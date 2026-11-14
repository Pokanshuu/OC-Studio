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
import { flushPendingSpecialFields, queueSpecialInfoFields } from './info-groups'
import { templateHostOf } from './support'
import type { TemplateParamValue } from './params'
import { docFromRecord, parseTemplate, serializeTemplate } from './serialize'
import { TEMPLATE_DIR, templatePath, type TemplateComponentId, type TemplateDoc } from './types'

const LS_KEY = 'oc-templates-v1'

let cache: TemplateDoc[] = BUILTIN_TEMPLATES.map((doc) => JSON.parse(JSON.stringify(doc)) as TemplateDoc)
let loaded = false
/** 上次装载用的是哪个库根；根一变就重读（启动早期会话还没建的坑见 `loadTemplates`） */
let loadedRoot: string | null = null
let readFailed = false
/** 有模板文件存在但解析不出来：普通界面跳过，备份要把它标成「未包含」 */
let backupIncomplete: string | null = null
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

/**
 * 模板 id → 它在盘上的相对路径。
 *
 * 保存必须**写回读进来那份文件**，不能一律按 `templatePath(id)` 另开一份：
 * 文件名和 frontmatter 的 `id:` 一旦不一致（用户复制过文件、同步盘改过名），
 * 按 id 写就会留下一个永远清不掉的旧文件，重启后两份同 id 的模板谁生效还看目录顺序。
 */
const sourcePaths = new Map<string, string>()

/**
 * 从 `.ocstudio/templates/` 读全部模板。
 *
 * `unreadable` 是「存在但解析不出来的 .md」数量：普通界面会静默跳过（一个坏文件
 * 不该让所有模板打不开），但**备份不能把「跳过」当成「没有」** —— 由 `loadTemplates`
 * 记成不完整，`collectBackupConfig` 把这整段标成未包含。
 */
async function readFromVault(
  root: string,
): Promise<{ docs: TemplateDoc[] | null; unreadable: number; duplicates: number }> {
  const assets = await vaultFs.listAssets(root, TEMPLATE_DIR)
  const files = assets.filter((asset) => asset.name.toLowerCase().endsWith('.md'))
  if (files.length === 0) return { docs: null, unreadable: 0, duplicates: 0 }
  const out: TemplateDoc[] = []
  const seen = new Set<string>()
  let unreadable = 0
  let duplicates = 0
  for (const file of files) {
    const bytes = await vaultFs.readBytes(root, file.relPath)
    const text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    const fallbackId = file.name.replace(/\.md$/i, '')
    const parsed = parseTemplate(text, fallbackId)
    if (!parsed) {
      unreadable += 1
      continue
    }
    // 两份文件声明同一个 id：只认先读到的那份，另一份留着不动也不参与保存 ——
    // 否则存盘时两份按同一个 relPath 互相覆盖，谁赢看目录列举顺序。
    if (seen.has(parsed.id)) {
      duplicates += 1
      console.warn(`[templates] id 重复，忽略 ${file.relPath}（${parsed.id} 已由前面的文件提供）`)
      continue
    }
    seen.add(parsed.id)
    sourcePaths.set(parsed.id, file.relPath)
    out.push(parsed)
  }
  return { docs: out.length > 0 ? out : null, unreadable, duplicates }
}

function readFromStorage(): { docs: TemplateDoc[] | null; corrupt: boolean } {
  if (typeof window === 'undefined') return { docs: null, corrupt: false }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { docs: null, corrupt: false }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { docs: null, corrupt: true }
    // 一律过一遍归一化：旧版本 / 手改过的快照可能缺 `aliases`，进了缓存就会在
    // `findTemplateByName` 上抛 TypeError（整个「新建条目」跟着失败）。
    const docs: TemplateDoc[] = []
    for (const item of parsed) {
      if (item === null || typeof item !== 'object') continue
      const doc = docFromRecord(item as Record<string, unknown>, '')
      if (doc) docs.push(doc)
    }
    return { docs: docs.length > 0 ? docs : null, corrupt: false }
  } catch {
    // 坏快照：普通界面回落内置模板，备份把它标成不完整
    return { docs: null, corrupt: true }
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
/**
 * 写盘排队。
 *
 * 为什么要它：连点两个参数（`setTemplateComponentParams`）会在同一瞬间发两次写，
 * 两次都写 `.ocstudio/templates/<id>.md`；Rust 侧的原子写临时文件名是固定的，
 * 并发时可能互相覆盖 rename，结果可能是**坏文件**，也可能只是丢掉一次修改。
 * 排队之后「读缓存 → 改 → 写盘 → 换内存」整段串行，后一次一定看得见前一次。
 *
 * 注意：队列里的任务**不能**再调 `enqueueWrite`（自己等自己 = 死锁）；
 * 需要嵌套时调裸的 `writeTemplates` / `persistMigratedTemplates`。
 */
let writeQueue: Promise<unknown> = Promise.resolve()
function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task)
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function persistMigratedTemplates(docs: TemplateDoc[]): Promise<void> {
  if (docs.length === 0) return
  const upgraded = docs.map((doc) => stripRetiredComponents(upgradeLegacyTemplate(doc)))
  const root = vaultRoot()
  try {
    if (root) {
      await enqueueWrite(async () => {
        const entries = upgraded.map((doc) => {
          const relPath = sourcePaths.get(doc.id) ?? templatePath(doc.id)
          sourcePaths.set(doc.id, relPath)
          return { relPath, content: serializeTemplate(doc) }
        })
        await vaultFs.writeTexts(root, entries)
      })
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

/**
 * 备份读取用的只读状态（不触发加载）。
 *
 * `readFailed` 覆盖权限 / I/O / 坏文件；`backupIncomplete` 覆盖「部分模板文件
 * 解析失败但整体没抛」的情况 —— 两种都不能让备份宣称模板段完整。
 */
export interface TemplatesReadState {
  loaded: boolean
  readFailed: boolean
  root: string | null
  reason?: string
}

export function getTemplatesReadState(): TemplatesReadState {
  const failed = readFailed || backupIncomplete !== null
  return {
    loaded,
    readFailed: failed,
    root: loadedRoot,
    ...(failed
      ? { reason: readFailed ? '模板读取失败（权限 / I/O）' : (backupIncomplete ?? '模板不完整') }
      : {}),
  }
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
      const disk = root ? await readFromVault(root) : null
      // 盘上有可解析的模板就只认盘；盘上没有文件（或全部解析失败）时保留原来的
      // localStorage 兜底（浏览器预览 / 旧快照），但会把「坏」记进 backupIncomplete。
      const stored = disk !== null && disk.docs !== null ? null : readFromStorage()
      const docs = disk?.docs ?? stored?.docs ?? null
      cache = merge(docs)
      syncFieldKeys()
      backupIncomplete =
        disk !== null && disk.unreadable > 0
          ? `${disk.unreadable} 个模板文件解析失败`
          : disk !== null && disk.duplicates > 0
            ? `${disk.duplicates} 个模板文件与别的文件 id 重复，本次只认第一份`
            : stored?.corrupt === true
              ? '浏览器本地的模板快照损坏'
              : null
      const migrated = queueLegacyNoteSpecialFields(docs)
      // 顺序不能反：模板文件一旦写成 `版本: 3`，下次开库就不再排队补那几行字段。
      // 所以先让特殊字段真正落进 info-groups.json，确认成功了才把模板升级落盘；
      // 没落成就不动模板文件，下次开库会重来一遍。
      const flushed = migrated.length === 0 ? true : await flushPendingSpecialFields()
      if (flushed) await persistMigratedTemplates(migrated)
      else console.warn('[templates] 基本信息组件还没落盘，模板升级留到下次开库')
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
export function saveTemplates(docs: TemplateDoc[]): Promise<void> {
  return enqueueWrite(() => writeTemplates(docs))
}

/**
 * 真正的写入。**先写盘、成功了才换内存**。
 *
 * 反过来的话，写失败时界面照样显示新顺序 —— 用户看到"改好了"，重启回到旧的。
 * 顺带把「从列表里被去掉的模板」的文件一起删掉：只改内存不删文件的话，
 * 删掉的模板下次开库会被 `readFromVault` 原样读回来（删了又复活）。
 *
 * 只能在 `enqueueWrite` 里跑（或者在没有并发写的时候直接调，如迁移）。
 */
async function writeTemplates(docs: TemplateDoc[]): Promise<void> {
  const root = vaultRoot()
  // 桌面版但会话没就绪：宁可不写，也不能把内存里的内置默认写进笔记库
  if (root === null && isVaultSupported()) throw new Error('笔记库还没打开，稍后再试')
  if (readFailed) throw new Error('模板上次没有读成功，先刷新笔记库再改')
  // 还没读完就写 = 拿内存里的内置默认覆盖用户盘上的模板（启动早期那一小段）
  if (!loaded) throw new Error('模板还没读完，稍后再试')

  const previous = cache
  const next = docs.map((doc) => ({ ...doc }))
  const keep = new Set(next.map((doc) => doc.id))

  if (root) {
    const entries = next.map((doc) => ({
      relPath: sourcePaths.get(doc.id) ?? templatePath(doc.id),
      content: serializeTemplate(doc),
    }))
    const results = await vaultFs.writeTexts(root, entries)
    const failed = results.filter((result) => !result.ok)
    if (failed.length > 0) throw new Error(failed[0].error ?? '模板写入失败')

    for (const doc of previous) {
      if (keep.has(doc.id)) continue
      const relPath = sourcePaths.get(doc.id) ?? templatePath(doc.id)
      sourcePaths.delete(doc.id)
      try {
        await vaultFs.remove(root, relPath)
      } catch {
        // 文件可能已被外部删掉 / 正被占用：内存里已经没有这一条，不阻塞这次保存
      }
    }
    for (const doc of next) {
      if (!sourcePaths.has(doc.id)) sourcePaths.set(doc.id, templatePath(doc.id))
    }
  } else if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }

  cache = next
  syncFieldKeys()
  loaded = true
  loadedRoot = root
  emit()
}

/**
 * 只改一条：读缓存 → 原位替换 → 整体写回（写回是「外科式」的，别的模板不动）。
 *
 * 读缓存这一步必须在**队列内部**做：两次连点各自读一次、各自写一次的话，
 * 后一次会拿着旧快照把前一次的修改抹掉。
 */
export function saveTemplate(next: TemplateDoc): Promise<void> {
  return enqueueWrite(async () => {
    const exists = cache.some((doc) => doc.id === next.id)
    const docs = exists ? cache.map((doc) => (doc.id === next.id ? next : doc)) : [...cache, next]
    await writeTemplates(docs)
  })
}

/** 追加一份模板（id 已存在就替换）；新建 / 复制都走它，别拿界面上的旧快照整体覆盖 */
export function addTemplate(doc: TemplateDoc): Promise<void> {
  return enqueueWrite(async () => {
    const exists = cache.some((item) => item.id === doc.id)
    const docs = exists ? cache.map((item) => (item.id === doc.id ? doc : item)) : [...cache, doc]
    await writeTemplates(docs)
  })
}

/** 删一份模板（连同它的文件）；内置模板不允许删 */
export function deleteTemplate(id: string): Promise<void> {
  return enqueueWrite(async () => {
    if (!cache.some((doc) => doc.id === id)) return
    await writeTemplates(cache.filter((doc) => doc.id !== id))
  })
}

/**
 * 改某模板某个组件的一组参数（`null` = 删掉这个键）。
 *
 * 为什么一次能写多个：选基本信息 / 正文组件时要顺手清掉旧的内联兼容键
 * （`info.params.fields`、`body.params.preset`），否则文件里会留着一份「不再生效但看着还在」的值。
 *
 * **从当前缓存读、不接界面传进来的快照**：连点两个参数时，后一次不会把前一次覆盖掉。
 */
export function setTemplateComponentParams(
  templateId: string,
  componentId: TemplateComponentId,
  patch: Record<string, TemplateParamValue | null>,
): Promise<void> {
  // 读缓存也放进队列：连点两个参数时，后一次必须看到前一次写进缓存的结果
  return enqueueWrite(async () => {
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
    const docs = cache.map((doc) => (doc.id === templateId ? { ...current, components } : doc))
    await writeTemplates(docs)
  })
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
  // `aliases` 兜一层：手改 / 旧版快照里可能没有这个键（归一化之后不会有，但别让一处脏数据崩掉调用方）
  return (
    cache.find((doc) => doc.name === target) ??
    cache.find((doc) => (doc.aliases ?? []).includes(target)) ??
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
