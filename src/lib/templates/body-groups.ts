'use client'

/**
 * 正文组件（`BodyGroup`）—— **独立于模板**的一份预设正文，和基本信息组件同构。
 *
 * 模板的「正文」只**选择**一个组件（`body.params.group = <id>`）：组件自己有名、
 * 有骨架，可被多个模板复用，名字和模板名没有任何绑定；关系只由「选择了哪一个」决定。
 * 新建条目时把选中的那份 Markdown 铺进正文（`lib/templates/body-preset.ts`）。
 *
 * 存储：`.ocstudio/body-groups.json`（随库走）；浏览器 Mock 退 localStorage。
 * 内置组件可改、可改名，**不能删**（删了下次读盘会回来）。
 */
import { useEffect, useSyncExternalStore } from 'react'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'

const LS_KEY = 'oc-body-groups-v1'
export const BODY_GROUPS_REL_PATH = '.ocstudio/body-groups.json'
const REL_PATH = BODY_GROUPS_REL_PATH
const VERSION = 1

/** 「这份骨架归哪类条目」—— 只决定哪些模板能选到它 */
export type BodyGroupHost = 'character' | 'event' | 'country' | 'world' | 'note'

export interface BodyGroup {
  /** 稳定 id；模板只存它 */
  id: string
  /** 用户可改的名字，与模板名无关 */
  name: string
  /** 预设正文（Markdown）；空串 = 不铺 */
  markdown: string
  /** 内置组件：可改、不可删 */
  builtin?: boolean
  /** 宿主；缺省 = 任何模板都能选 */
  for?: BodyGroupHost
}

/**
 * 内置正文组件：沿用各实体原来的默认骨架（`lib/body-skeleton.ts` 的 Markdown 侧）。
 * 事件 / 词条的骨架本来只有占位提示，落成 Markdown 就是空的 —— 于是共用「空正文」。
 */
export const BUILTIN_BODY_GROUPS: BodyGroup[] = [
  {
    id: 'body-character',
    name: '角色',
    builtin: true,
    for: 'character',
    markdown: ['## 人物简介', '', '---', '', '## 人物生平'].join('\n'),
  },
  {
    id: 'body-country',
    name: '国家',
    builtin: true,
    for: 'country',
    markdown: ['## 政治制度', '', '---', '', '## 地理环境', '', '---', '', '## 人文风貌'].join('\n'),
  },
  {
    id: 'body-empty',
    name: '空正文',
    builtin: true,
    markdown: '',
  },
]

export function isBuiltinBodyGroup(id: string): boolean {
  return BUILTIN_BODY_GROUPS.some((group) => group.id === id)
}

/** 模板 → 宿主（按 id 前缀；用户复制的模板继承原前缀，与基本信息组件同一套判断） */
export function bodyGroupHostOfTemplate(templateId: string): BodyGroupHost | undefined {
  const id = templateId.trim().toLowerCase()
  if (id.startsWith('character')) return 'character'
  if (id.startsWith('event')) return 'event'
  if (id.startsWith('country')) return 'country'
  if (id.startsWith('entry') || id.startsWith('world')) return 'world'
  if (id.startsWith('pet') || id.startsWith('weapon')) return 'note'
  return undefined
}

/** 没选过时用哪一份：角色 / 国家各有出厂骨架，其余不铺 */
export function defaultBodyGroupIdOfTemplate(templateId: string): string {
  const host = bodyGroupHostOfTemplate(templateId)
  if (host === 'character') return 'body-character'
  if (host === 'country') return 'body-country'
  return 'body-empty'
}

/** 某套模板能选的正文组件：宿主要么相同、要么没标宿主（自建的老组件） */
export function selectableBodyGroups(templateId: string, groups: readonly BodyGroup[]): BodyGroup[] {
  const host = bodyGroupHostOfTemplate(templateId)
  if (host === undefined) return [...groups]
  return groups.filter((group) => group.for === undefined || group.for === host)
}

function hostOf(id: string, recordFor: unknown): BodyGroupHost | undefined {
  const builtin = BUILTIN_BODY_GROUPS.find((group) => group.id === id)
  if (builtin) return builtin.for
  return recordFor === 'character' ||
    recordFor === 'event' ||
    recordFor === 'country' ||
    recordFor === 'world' ||
    recordFor === 'note'
    ? recordFor
    : undefined
}

/** 内置 + 盘上：同 id 以盘上为准，自定义追加在后 */
function merge(saved: BodyGroup[]): BodyGroup[] {
  const byId = new Map<string, BodyGroup>()
  for (const group of BUILTIN_BODY_GROUPS) byId.set(group.id, { ...group })
  for (const group of saved) {
    byId.set(group.id, { ...group, builtin: group.builtin ?? isBuiltinBodyGroup(group.id) })
  }
  return [...byId.values()]
}

function normalize(raw: unknown): BodyGroup[] {
  if (!Array.isArray(raw)) return []
  const out: BodyGroup[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (id === '' || name === '' || seen.has(id)) continue
    seen.add(id)
    const markdown = typeof record.markdown === 'string' ? record.markdown : ''
    const host = hostOf(id, record.for)
    out.push({
      id,
      name,
      markdown,
      builtin: record.builtin === true || isBuiltinBodyGroup(id),
      ...(host !== undefined ? { for: host } : {}),
    })
  }
  return out
}

/** 给读盘脚本 / 审计用 */
export function normalizeBodyGroups(raw: unknown): BodyGroup[] {
  return merge(normalize(raw))
}

function serialize(groups: BodyGroup[]): string {
  return `${JSON.stringify({ version: VERSION, groups }, null, 2)}\n`
}

let snapshot: BodyGroup[] = merge([])
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

export async function loadBodyGroups(force = false): Promise<void> {
  if (loading) return loading
  if (loaded && !force) return
  loading = (async () => {
    try {
      const root = vaultRoot()
      if (root) {
        if (await vaultFs.exists(root, REL_PATH)) {
          const bytes = await vaultFs.readBytes(root, REL_PATH)
          const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as { groups?: unknown }
          snapshot = merge(normalize(payload?.groups))
        } else {
          snapshot = merge([])
        }
      } else if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY)
        snapshot = merge(raw === null ? [] : normalize((JSON.parse(raw) as { groups?: unknown })?.groups))
      }
    } catch {
      snapshot = merge([])
    } finally {
      loaded = true
      loading = null
      emit()
    }
  })()
  return loading
}

export async function saveBodyGroups(next: BodyGroup[]): Promise<void> {
  const merged = merge(normalize(next))
  const previous = snapshot
  snapshot = merged
  loaded = true
  emit()

  const root = vaultRoot()
  try {
    if (root) {
      try {
        await vaultFs.mkdir(root, '.ocstudio')
      } catch {
        // 目录已存在时可能抛错，忽略
      }
      const results = await vaultFs.writeTexts(root, [{ relPath: REL_PATH, content: serialize(merged) }])
      const failed = results.find((result) => !result.ok)
      if (failed !== undefined) throw new Error(failed.error ?? '写入正文组件失败')
      return
    }
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, serialize(merged))
  } catch (err) {
    // 写盘失败就退回旧表：别让人以为已经留住了
    snapshot = previous
    emit()
    throw err
  }
}

export function getBodyGroups(): BodyGroup[] {
  return snapshot
}

export function findBodyGroup(id: string): BodyGroup | undefined {
  return snapshot.find((group) => group.id === id)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useBodyGroups(): BodyGroup[] {
  useEffect(() => {
    void loadBodyGroups()
  }, [])
  return useSyncExternalStore(subscribe, getBodyGroups, getBodyGroups)
}

export function newBodyGroupId(): string {
  return `body-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

export async function createBodyGroup(input: { name: string; markdown?: string }): Promise<BodyGroup> {
  const name = input.name.trim()
  if (name === '') throw new Error('正文组件名不能为空')
  if (snapshot.some((group) => group.name === name)) throw new Error(`已经有叫「${name}」的正文组件了`)
  const group: BodyGroup = { id: newBodyGroupId(), name, markdown: input.markdown ?? '' }
  await saveBodyGroups([...snapshot, group])
  return group
}

export async function updateBodyGroup(
  id: string,
  patch: Partial<Omit<BodyGroup, 'id' | 'builtin'>>,
): Promise<void> {
  await saveBodyGroups(
    snapshot.map((group) =>
      group.id === id
        ? {
            ...group,
            ...patch,
            name: (patch.name ?? group.name).trim() || group.name,
            markdown: patch.markdown ?? group.markdown,
          }
        : group,
    ),
  )
}

/** 内置组件不删；自定义组件删掉后，引用它的模板会退回默认（`defaultBodyGroupIdOfTemplate`） */
export async function deleteBodyGroup(id: string): Promise<void> {
  if (isBuiltinBodyGroup(id)) throw new Error('内置正文组件不能删除')
  await saveBodyGroups(snapshot.filter((group) => group.id !== id))
}
