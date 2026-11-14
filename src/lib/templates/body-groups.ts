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

/**
 * 文件形状校验：写出去的一定是 `{ version, groups: [] }`。
 * JSON 能 parse 但缺 `groups` 数组也算坏文件（普通界面回落内置组件，备份标记未包含）。
 */
function readBodyGroupsPayload(payload: unknown): unknown[] {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { groups?: unknown }).groups)
  ) {
    throw new Error('正文组件文件结构不正确')
  }
  return (payload as { groups: unknown[] }).groups
}

let snapshot: BodyGroup[] = merge([])
let loaded = false
/** 上次装载用的库根（根一变重读；启动早期会话没就绪时不装载，见 `loadBodyGroups`） */
let loadedRoot: string | null = null
let readFailed = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

/**
 * 装载正文组件。规矩同 `info-groups` / `templates`：会话没就绪时不读、不标记完成，
 * 读失败不覆盖缓存，保存时拒绝写入 —— 否则启动早期会读成一份空表，再被写回盘上。
 */
export async function loadBodyGroups(force = false): Promise<void> {
  if (loading) return loading
  const readyRoot = vaultRoot()
  if (readyRoot === null && isVaultSupported()) return
  if (!force && loaded && loadedRoot === readyRoot) return
  loading = (async () => {
    try {
      const root = readyRoot
      if (root) {
        if (await vaultFs.exists(root, REL_PATH)) {
          const bytes = await vaultFs.readBytes(root, REL_PATH)
          const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as unknown
          snapshot = merge(normalize(readBodyGroupsPayload(payload)))
        } else {
          snapshot = merge([])
        }
      } else if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY)
        snapshot = merge(raw === null ? [] : normalize(readBodyGroupsPayload(JSON.parse(raw) as unknown)))
      }
      readFailed = false
    } catch {
      readFailed = true
    } finally {
      loaded = true
      loadedRoot = readyRoot
      loading = null
      emit()
    }
  })()
  return loading
}

/**
 * 写盘排队（理由同 `templates/store.ts` 与 `info-groups.ts`）：连点两下时
 * 两次保存各读一次 `snapshot`，不排队就会互相覆盖。
 * 队列里的任务不能再调 `enqueueWrite`。
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

/** 写盘 + 换内存（**先写盘**：失败时界面不该显示盘上没有的骨架）。只能在队列里跑 */
async function writeBodyGroups(merged: BodyGroup[]): Promise<void> {
  const root = vaultRoot()
  // 会话没就绪 / 上次没读成功：不写，免得把一份空表覆盖到盘上
  if (root === null && isVaultSupported()) throw new Error('笔记库还没打开，稍后再试')
  if (readFailed) throw new Error('正文组件上次没有读成功，先刷新笔记库再改')

  if (root) {
    try {
      await vaultFs.mkdir(root, '.ocstudio')
    } catch {
      // 目录已存在时可能抛错，忽略
    }
    const results = await vaultFs.writeTexts(root, [{ relPath: REL_PATH, content: serialize(merged) }])
    const failed = results.find((result) => !result.ok)
    if (failed !== undefined) throw new Error(failed.error ?? '写入正文组件失败')
  } else if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, serialize(merged))
  }

  snapshot = merged
  loaded = true
  loadedRoot = root
  emit()
}

export function saveBodyGroups(next: BodyGroup[]): Promise<void> {
  return enqueueWrite(() => writeBodyGroups(merge(normalize(next))))
}

export function getBodyGroups(): BodyGroup[] {
  return snapshot
}

/**
 * 备份读取用的只读状态（不触发加载）。
 * 普通界面读失败仍保留旧快照 / 回落内置组件，备份必须把这一段标成「未包含」。
 */
export interface BodyGroupsReadState {
  loaded: boolean
  readFailed: boolean
  root: string | null
  reason?: string
}

export function getBodyGroupsReadState(): BodyGroupsReadState {
  return {
    loaded,
    readFailed,
    root: loadedRoot,
    ...(readFailed ? { reason: '正文组读取失败（权限 / 坏 JSON）' } : {}),
  }
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

/** 新建 / 改名 / 改骨架 / 删除 —— 都在队列里读 `snapshot` 再写 */
export function createBodyGroup(input: { name: string; markdown?: string }): Promise<BodyGroup> {
  const name = input.name.trim()
  if (name === '') return Promise.reject(new Error('正文组件名不能为空'))
  const group: BodyGroup = { id: newBodyGroupId(), name, markdown: input.markdown ?? '' }
  return enqueueWrite(async () => {
    if (snapshot.some((item) => item.name === name)) {
      throw new Error(`已经有叫「${name}」的正文组件了`)
    }
    await writeBodyGroups(merge(normalize([...snapshot, group])))
    return group
  })
}

export function updateBodyGroup(
  id: string,
  patch: Partial<Omit<BodyGroup, 'id' | 'builtin'>>,
): Promise<void> {
  return enqueueWrite(async () => {
    const next = snapshot.map((group) =>
      group.id === id
        ? {
            ...group,
            ...patch,
            name: (patch.name ?? group.name).trim() || group.name,
            markdown: patch.markdown ?? group.markdown,
          }
        : group,
    )
    await writeBodyGroups(merge(normalize(next)))
  })
}

/** 内置组件不删；自定义组件删掉后，引用它的模板会退回默认（`defaultBodyGroupIdOfTemplate`） */
export function deleteBodyGroup(id: string): Promise<void> {
  if (isBuiltinBodyGroup(id)) return Promise.reject(new Error('内置正文组件不能删除'))
  return enqueueWrite(() =>
    writeBodyGroups(merge(normalize(snapshot.filter((group) => group.id !== id)))),
  )
}
