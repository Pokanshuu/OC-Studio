'use client'

/**
 * 模板的读写 —— **库里有文件就认文件，没有就用内置定义**。
 *
 * 存储位置：`.ocstudio/templates/<id>.md`（随库走、可分享，见 `docs/模板.md §3.2`）。
 * 浏览器 / Mock 预览没有真实文件夹，退化成 localStorage（键 `oc-templates-v1`），
 * 这条退化只为了让「设置里点得动」，不参与任何导出。
 *
 * 状态用 `useSyncExternalStore` 订阅，与 `vault-provider` 同一套路：
 * 服务端渲染时先给内置模板，客户端再补上磁盘里的。
 */
import { useEffect, useState } from 'react'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { setTemplateCustomFieldKeys } from '@/lib/vault/vault-field-keys'
import { BUILTIN_TEMPLATES } from './defaults'
import { TEMPLATE_SCHEMA_VERSION, type TemplateComponent } from './types'
import { collectTemplateFieldKeys } from './fields'
import { queueSpecialInfoFields } from './info-groups'
import { templateHostOf } from './support'
import type { TemplateParamValue } from './params'
import { parseTemplate, serializeTemplate } from './serialize'
import { TEMPLATE_DIR, templatePath, type TemplateComponentId, type TemplateDoc } from './types'

const LS_KEY = 'oc-templates-v1'

let cache: TemplateDoc[] = BUILTIN_TEMPLATES.map((doc) => JSON.parse(JSON.stringify(doc)) as TemplateDoc)
let loaded = false
/** 上次装载用的是哪个库根；根一变就重读（启动早期会话还没建的坑见 `loadTemplates`） */
let loadedRoot: string | null = null
let readFailed = false
let loading: Promise<void> | null = null
let error: string | null = null
const listeners = new Set<() => void>()
function emit(): void {
  for (const listener of listeners) listener()
}

/** 模板字段键登记给 scan / serialize（宠物 / 武器 → 物种 / 材质…） */
function syncFieldKeys(): void {
  setTemplateCustomFieldKeys({ worldEntry: collectTemplateFieldKeys(cache) })
}

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

async function readFromVault(root: string): Promise<TemplateDoc[] | null> {
  const assets = await vaultFs.listAssets(root, TEMPLATE_DIR)
  const files = assets.filter((asset) => asset.name.toLowerCase().endsWith('.md'))
  if (files.length === 0) return null
  const out: TemplateDoc[] = []
  for (const file of files) {
    const bytes = await vaultFs.readBytes(root, file.relPath)
    const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    const fallbackId = file.name.replace(/\.md$/i, '')
    const parsed = parseTemplate(text, fallbackId)
    if (parsed) out.push(parsed)
  }
  return out.length > 0 ? out : null
}

function readFromStorage(): TemplateDoc[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const docs = parsed.filter((item): item is TemplateDoc => {
      return Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item && 'components' in item)
    })
    return docs.length > 0 ? docs : null
  } catch {
    return null
  }
}

/**
 * 旧内置默认的快照 —— 只用来认「这份模板没被改过」。
 *
 * 两个历史形态：
 * - 头像画在封面里、avatar 关着，且还没有立绘 / 动画组件（2026-11-09 之前）
 * - 头像已独立，但立绘 / 动画还没组件化
 *
 * 认出来就换成当前内置默认（头像打开、补上立绘 / 动画）；用户动过任何一处就不碰。
 */
const LEGACY_BUILTIN_SHAPES: Record<string, TemplateComponent[][]> = (() => {
  const out: Record<string, TemplateComponent[][]> = {}
  for (const id of ['character', 'country']) {
    const builtin = BUILTIN_TEMPLATES.find((item) => item.id === id)
    if (!builtin) continue
    const base = builtin.components.filter(
      (component) => component.id !== 'portrait' && component.id !== 'animation',
    )
    const avatarOff = base.map((component) =>
      component.id === 'avatar' ? { ...component, enabled: false } : component,
    )
    out[id] = [avatarOff, base]
  }
  return out
})()

/**
 * 已退役的组件 id：读到就丢掉（旧模板文件里还写着它们）。
 *
 * 时间 / 地点 2026-11-10 并回「基本信息」的字段行：值一直在实体列上，
 * 丢掉这两个组件不碰任何数据。词条的特殊字段由 `loadTemplates` 补进它当时选的
 * 基本信息组件（见 `queueSpecialInfoFields`）。
 */
const RETIRED_COMPONENT_IDS = new Set<string>(['time', 'place'])

/**
 * 一次性升级：旧文件（没有 `版本:` 或版本更低）做两件事。
 *
 * 1. 丢掉已退役的组件（时间 / 地点）
 * 2. 补上后来新增的组件：没动过的角色 / 国家模板 → 直接换成当前内置默认（顺带把头像打开）；
 *    动过的角色模板 → **只补**立绘 / 动画（保留用户原有顺序与开关）
 *
 * 升级结果带当前 `schema`，下次保存写进文件；之后用户再删掉就不会被加回来。
 */
export function upgradeLegacyTemplate(doc: TemplateDoc): TemplateDoc {
  if ((doc.schema ?? 0) >= TEMPLATE_SCHEMA_VERSION) return doc

  const shapes = LEGACY_BUILTIN_SHAPES[doc.id]
  const builtin = BUILTIN_TEMPLATES.find((item) => item.id === doc.id)
  const untouched = shapes?.some((shape) => JSON.stringify(shape) === JSON.stringify(doc.components)) ?? false
  if (untouched && builtin !== undefined) {
    return {
      ...doc,
      components: JSON.parse(JSON.stringify(builtin.components)) as TemplateComponent[],
      schema: TEMPLATE_SCHEMA_VERSION,
    }
  }

  const components = doc.components.filter((component) => !RETIRED_COMPONENT_IDS.has(component.id))
  if (doc.id === 'character') {
    if (!components.some((component) => component.id === 'portrait')) {
      const anchor = components.findIndex(
        (component) => component.id === 'relations' || component.id === 'tags',
      )
      const at = anchor === -1 ? Math.max(0, components.length - 1) : anchor
      components.splice(at, 0, { id: 'portrait', enabled: true })
    }
    if (!components.some((component) => component.id === 'animation')) {
      const bodyAt = components.findIndex((component) => component.id === 'body')
      components.splice(bodyAt === -1 ? components.length : bodyAt, 0, {
        id: 'animation',
        enabled: true,
      })
    }
  }
  return { ...doc, components, schema: TEMPLATE_SCHEMA_VERSION }
}

/**
 * 旧笔记模板里的「时间 / 地点」组件退役后，值不能没有入口：把它们补进模板当时
 * 选中的基本信息组件（`info.params.group`）。没选组件 / 没开基本信息就无处可补 ——
 * 那种模板本来就不显示任何字段，时间 / 地点仍在文件里，需要时加个组件即可。
 *
 * 纯函数，审计脚本也用它核对迁移映射。
 */
export function legacyNoteSpecialFields(
  doc: TemplateDoc,
): { groupId: string; types: ('time' | 'timeEnd' | 'place')[] } | null {
  if ((doc.schema ?? 0) >= TEMPLATE_SCHEMA_VERSION) return null
  // 注意：不能用 `isNoteTemplate` —— 它按**当前**组件闭集判断，而这份文档里正带着
  // 已退役的 time / place，会被判成「不是笔记模板」而漏掉迁移。
  if (templateHostOf(doc.id) !== 'note') return null
  if (!doc.components.some((component) => component.id === 'body' && component.enabled)) return null
  const info = doc.components.find((component) => component.id === 'info' && component.enabled)
  const groupId = typeof info?.params?.group === 'string' ? info.params.group.trim() : ''
  if (groupId === '') return null
  const types: ('time' | 'timeEnd' | 'place')[] = []
  const time = doc.components.find(
    (component) => (component.id as string) === 'time' && component.enabled,
  )
  if (time !== undefined) {
    types.push('time')
    // `interval` 默认开：旧模板没写这个参数 = 有结束时间那一组
    if (time.params?.interval !== false) types.push('timeEnd')
  }
  if (doc.components.some((component) => (component.id as string) === 'place' && component.enabled)) {
    types.push('place')
  }
  return types.length > 0 ? { groupId, types } : null
}

function queueLegacyNoteSpecialFields(docs: TemplateDoc[] | null): TemplateDoc[] {
  if (docs === null) return []
  const queued: TemplateDoc[] = []
  for (const doc of docs) {
    const needs = legacyNoteSpecialFields(doc)
    if (needs === null) continue
    queueSpecialInfoFields(needs.groupId, needs.types)
    queued.push(doc)
  }
  return queued
}

/**
 * 迁移过的模板**立刻**写回盘上（带新 `版本:`）。
 *
 * 为什么不能像以前那样「等下次保存」：笔记的时间 / 地点被补进的是
 * `info-groups.json`，用户删掉那几行不会触发模板保存 —— 模板文件若仍是旧版本，
 * 下次开库又会把它们补回来。只写真正需要迁移的那几份，不动别的模板。
 */
async function persistMigratedTemplates(docs: TemplateDoc[]): Promise<void> {
  if (docs.length === 0) return
  const upgraded = docs.map((doc) => stripRetiredComponents(upgradeLegacyTemplate(doc)))
  const root = vaultRoot()
  try {
    if (root) {
      const entries = upgraded.map((doc) => ({
        relPath: templatePath(doc.id),
        content: serializeTemplate(doc),
      }))
      await vaultFs.writeTexts(root, entries)
      return
    }
    if (typeof window !== 'undefined') {
      const byId = new Map(cache.map((doc) => [doc.id, doc]))
      localStorage.setItem(LS_KEY, JSON.stringify([...byId.values()]))
    }
  } catch {
    // 迁移写盘失败不影响本次会话：内存里已经是升级后的；下次开库会再试一次
  }
}

/** 缓存里永远不留退役组件：手写的 `版本: 3` 文件里若还写着它们，也只当没看见 */
function stripRetiredComponents(doc: TemplateDoc): TemplateDoc {
  const components = doc.components.filter((component) => !RETIRED_COMPONENT_IDS.has(component.id))
  return components.length === doc.components.length ? doc : { ...doc, components }
}

function merge(docs: TemplateDoc[] | null): TemplateDoc[] {
  const byId = new Map<string, TemplateDoc>()
  for (const builtin of BUILTIN_TEMPLATES) {
    byId.set(builtin.id, JSON.parse(JSON.stringify(builtin)) as TemplateDoc)
  }
  for (const doc of docs ?? []) byId.set(doc.id, stripRetiredComponents(upgradeLegacyTemplate(doc)))
  return [...byId.values()]
}

// 内置模板已经声明了宠物 / 武器的字段；即使还没读盘也先登记
syncFieldKeys()

export function getTemplates(): TemplateDoc[] {
  return cache
}
export function subscribeTemplates(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 装载模板。
 *
 * **会话没就绪时绝不能当成「库里没有模板」**：以前这里会直接退到 localStorage、
 * 然后把 `loaded` 置真 —— 启动早期 `getVaultSession()` 还是 null，于是内存里
 * 全是内置默认、之后再也不重读。表现就是「一重启模板就回到默认」，而且用户接着
 * 改一下，内置默认还会被写回盘上，把真模板覆盖掉。
 *
 * 现在按 `categories/store.ts` 同一套规矩：
 * - 桌面版但会话还没建好 → 直接返回，不读、不标记完成（`AppShell` 的
 *   `VaultConfigSync` 会在库根出现时再喊一次）
 * - 记住上次装载用的根，根一变就重读
 * - 读盘失败只记 `readFailed`，**不拿内置默认覆盖缓存**，保存时直接报错
 */
export async function loadTemplates(force = false): Promise<void> {
  if (loading) return loading
  const root = vaultRoot()
  if (root === null && isVaultSupported()) return
  if (!force && loaded && loadedRoot === root) return
  loading = (async () => {
    error = null
    try {
      const fromDisk = root ? await readFromVault(root) : null
      const docs = fromDisk ?? readFromStorage()
      cache = merge(docs)
      const migrated = queueLegacyNoteSpecialFields(docs)
      await persistMigratedTemplates(migrated)
      syncFieldKeys()
      readFailed = false
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      readFailed = true
    } finally {
      loaded = true
      loadedRoot = root
      loading = null
      emit()
    }
  })()
  return loading
}

/** 整体保存（编排界面改完就调）：写盘 + 更新缓存 */
export async function saveTemplates(docs: TemplateDoc[]): Promise<void> {
  const root = vaultRoot()
  // 桌面版但会话没就绪：宁可不写，也不能把内存里的内置默认写进笔记库
  if (root === null && isVaultSupported()) throw new Error('笔记库还没打开，稍后再试')
  if (readFailed) throw new Error('模板上次没有读成功，先刷新笔记库再改')
  cache = docs.map((doc) => ({ ...doc }))
  syncFieldKeys()
  if (root) {
    const entries = docs.map((doc) => ({ relPath: templatePath(doc.id), content: serializeTemplate(doc) }))
    const results = await vaultFs.writeTexts(root, entries)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) {
      throw new Error(failed[0].error ?? '模板写入失败')
    }
  } else if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, JSON.stringify(docs))
  }
  loaded = true
  loadedRoot = root
  emit()
}

/** 只改一条：读缓存 → 原位替换 → 整体写回（写回是「外科式」的，别的模板不动） */
export async function saveTemplate(next: TemplateDoc): Promise<void> {
  const exists = cache.some((doc) => doc.id === next.id)
  const docs = exists ? cache.map((doc) => (doc.id === next.id ? next : doc)) : [...cache, next]
  await saveTemplates(docs)
}

/**
 * 改某模板某个组件的一组参数（`null` = 删掉这个键）。
 *
 * 为什么一次能写多个：选基本信息 / 正文组件时要顺手清掉旧的内联兼容键
 * （`info.params.fields`、`body.params.preset`），否则文件里会留着一份「不再生效但看着还在」的值。
 *
 * **从当前缓存读、不接界面传进来的快照**：连点两个参数时，后一次不会把前一次覆盖掉。
 */
export async function setTemplateComponentParams(
  templateId: string,
  componentId: TemplateComponentId,
  patch: Record<string, TemplateParamValue | null>,
): Promise<void> {
  const current = cache.find((doc) => doc.id === templateId)
  if (!current) return
  const components = current.components.map((component) => {
    if (component.id !== componentId) return component
    const params = { ...(component.params ?? {}) }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete params[key]
      else params[key] = value
    }
    return { ...component, params }
  })
  await saveTemplate({ ...current, components })
}

/**
 * 改某模板某个组件的一个参数（如 `relations.presentation`）。
 *
 * 参数是**模板级**的：在编辑器的关系区块上切换呈现，写回的是模板，
 * 不是这一篇笔记（`docs/模板.md §6.3`）。
 */
export async function setTemplateComponentParam(
  templateId: string,
  componentId: TemplateComponentId,
  key: string,
  value: TemplateParamValue,
): Promise<void> {
  await setTemplateComponentParams(templateId, componentId, { [key]: value })
}

export function resetTemplateToBuiltin(id: string): TemplateDoc | null {
  const builtin = BUILTIN_TEMPLATES.find((doc) => doc.id === id)
  return builtin ? (JSON.parse(JSON.stringify(builtin)) as TemplateDoc) : null
}

/** 按名字找模板（笔记里的 `模板:` 存的是名字，旧名走 `aliases`） */
export function findTemplateByName(name: string): TemplateDoc | undefined {
  const target = name.trim()
  if (!target) return undefined
  return (
    cache.find((doc) => doc.name === target) ??
    cache.find((doc) => doc.aliases.includes(target)) ??
    cache.find((doc) => doc.id === target)
  )
}

/** React 侧读模板：先给缓存，装载完成后再刷新一次 */
export function useTemplates(): { templates: TemplateDoc[]; loading: boolean; error: string | null } {
  const [snapshot, setSnapshot] = useState<TemplateDoc[]>(() => cache)
  const [pending, setPending] = useState(!loaded)

  useEffect(() => {
    const unsubscribe = subscribeTemplates(() => {
      setSnapshot([...cache])
      setPending(!loaded)
    })
    void loadTemplates()
    return unsubscribe
  }, [])

  return { templates: snapshot, loading: pending, error }
}
