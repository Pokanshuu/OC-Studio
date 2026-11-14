'use client'

/**
 * 灵感的读写：`.ocstudio/inspirations.json` 优先，浏览器预览退 localStorage。
 *
 * 与 `lib/categories/store.ts` 同一套形态（快照 + 订阅 + 逐次落盘），因为它是
 * 同一种东西：**库级的小表**，不是实体。区别只有一处 —— 灵感内容是作者写的字，
 * 所以写失败必须抛出来让界面提示，不能像分类那样静默回落。
 */
import { useSyncExternalStore } from 'react'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import {
  EMPTY_INSPIRATION_CONTENT,
  INSPIRATIONS_LS_KEY,
  INSPIRATIONS_REL_PATH,
  newInspirationId,
  normalizeInspirations,
  serializeInspirations,
  type Inspiration,
} from './types'

let snapshot: Inspiration[] = []
let loaded = false
/** 上次装载 / 尝试装载对应的库根；根一变就重读（换库后不能拿旧库快照当备份内容） */
let loadedRoot: string | null = null
let loading: Promise<void> | null = null
/**
 * 上次读盘失败（不是「文件不存在」）。
 *
 * 没有这个标记时：文件被占用 / 读坏，快照停在旧值（甚至是空表），接着一次自动保存
 * 就把整份灵感写回去 —— 作者写的字当场少一段。所以读失败后**禁止写回**，
 * 与模板 / 分类 / 文件夹清单的写盘纪律一致。
 */
let readFailed = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function root(): string | null {
  const session = getVaultSession()
  return session === null ? null : session.root
}

function setSnapshot(items: Inspiration[]): void {
  snapshot = items
  emit()
}

async function persist(items: Inspiration[]): Promise<void> {
  // 上次读盘失败：写回去等于用一份残缺 / 空的快照覆盖盘上的真灵感。
  if (readFailed) throw new Error('灵感上次没有读成功，先刷新笔记库再改')
  const next = [...items]
  const vaultRoot = root()
  // 桌面版但会话还没就绪：不能悄悄写进 localStorage（刷新就没了），也不能假装成功。
  if (vaultRoot === null && isVaultSupported()) throw new Error('笔记库还没打开，稍后再试')
  if (vaultRoot !== null) {
    try {
      await vaultFs.mkdir(vaultRoot, '.ocstudio')
    } catch {
      // 目录已存在
    }
    const results = await vaultFs.writeTexts(vaultRoot, [
      { relPath: INSPIRATIONS_REL_PATH, content: serializeInspirations(next) },
    ])
    const failed = results.find((result) => !result.ok)
    if (failed !== undefined) throw new Error(failed.error ?? '写入灵感失败')
    // **先落盘、成功了才换内存**：写失败时界面不该显示盘上不存在的版本。
    setSnapshot(next)
    return
  }
  if (typeof window !== 'undefined') localStorage.setItem(INSPIRATIONS_LS_KEY, serializeInspirations(next))
  setSnapshot(next)
}

/**
 * 严格解析：只有「文件不存在 / 空文件」才当空表。
 *
 * 坏 JSON、顶层不是数组也不是 `{ items: [] }` 一律返回 `null` —— 交给调用方标成
 * 读失败。**不能**把坏文件当成「用户把灵感删光了」：那会让下一次保存用空表覆盖它。
 * 单条坏行仍由 `normalizeInspirations` 丢弃（一条坏行不连坐整份文件）。
 */
function parseLoadedInspirations(text: string | null): Inspiration[] | null {
  if (text === null || text.trim() === '') return []
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return null
  }
  const items = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items)
      : null
  if (items === null) return null
  return normalizeInspirations(items)
}

/**
 * 读盘：有文件夹走文件，否则 localStorage。`force` 用于「上次读失败后重试」
 * （备份 / 恢复会强制重读一次，普通界面仍按库根去重，不反复打盘）。
 */
export function loadInspirations(force = false): Promise<void> {
  if (loading) return loading
  const readyRoot = root()
  // 桌面版但会话还没就绪：不读、也不把浏览器预览的 localStorage 顶上来
  // （否则「还没打开笔记库」会被当成「灵感是空的」）。
  if (readyRoot === null && isVaultSupported()) return Promise.resolve()
  if (!force && loaded && loadedRoot === readyRoot) return Promise.resolve()
  loading = (async () => {
    let text: string | null = null
    let failed = false
    try {
      if (readyRoot !== null) {
        // 有库时文件就是唯一真源：文件不存在 = 还没记过灵感，
        // 不能顺手去捡浏览器预览留在 localStorage 里的旧草稿。
        try {
          if (await vaultFs.exists(readyRoot, INSPIRATIONS_REL_PATH)) {
            const bytes = await vaultFs.readBytes(readyRoot, INSPIRATIONS_REL_PATH)
            text = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
          }
        } catch {
          // 文件存在但读不出来：记下来并禁止写回，别把空表当成「用户删光了」
          failed = true
        }
      } else if (typeof window !== 'undefined') {
        try {
          text = localStorage.getItem(INSPIRATIONS_LS_KEY)
        } catch {
          failed = true
        }
      }

      if (!failed) {
        const parsed = parseLoadedInspirations(text)
        if (parsed === null) failed = true
        else snapshot = parsed
      }
      readFailed = failed
    } finally {
      // 无论读取是否失败都要收尾：否则一次异常会让 loading 永远挂着，后续全部卡住
      loaded = true
      loadedRoot = readyRoot
      loading = null
      emit()
    }
  })()
  return loading
}

/**
 * 备份读取用的只读状态（不触发加载）。
 *
 * `loaded` / `readFailed` / `root` 三项一起看：根对不上说明快照是**上一个库**的
 * 缓存，哪怕 `readFailed=false` 也不能进备份。
 */
export interface InspirationReadState {
  loaded: boolean
  readFailed: boolean
  root: string | null
  reason?: string
}

export function getInspirationsReadState(): InspirationReadState {
  return {
    loaded,
    readFailed,
    root: loadedRoot,
    ...(readFailed ? { reason: '灵感文件读取失败（权限 / 坏 JSON）' } : {}),
  }
}

export function getInspirations(): Inspiration[] {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useInspirations(): Inspiration[] {
  return useSyncExternalStore(subscribe, getInspirations, getInspirations)
}

export async function createInspiration(): Promise<Inspiration> {
  await loadInspirations()
  const now = Date.now()
  const item: Inspiration = {
    id: newInspirationId(),
    title: '',
    content: EMPTY_INSPIRATION_CONTENT,
    createdAt: now,
    updatedAt: now,
  }
  await persist([item, ...snapshot])
  return item
}

export async function updateInspiration(
  id: string,
  draft: { title?: string; content?: string },
  options?: { silent?: boolean },
): Promise<void> {
  await loadInspirations()
  const current = snapshot.find((item) => item.id === id)
  if (current === undefined) throw new Error('这条灵感已被删除')
  const next: Inspiration = {
    ...current,
    title: draft.title ?? current.title,
    content: draft.content ?? current.content,
    updatedAt: Date.now(),
  }
  // 输入时不该每敲一个字就往上挪一位；`silent` 让自动保存只改内容不改排序。
  const items = options?.silent === true
    ? snapshot.map((item) => (item.id === id ? next : item))
    : [next, ...snapshot.filter((item) => item.id !== id)]
  await persist(items)
}

export async function deleteInspiration(id: string): Promise<void> {
  await loadInspirations()
  await persist(snapshot.filter((item) => item.id !== id))
}

/**
 * 记下「这条已经变成哪一篇词条了」。升级是单向的：灵感留着，词条才是结果。
 *
 * 除了 id 还记标题：id 是位置号（见 `Inspiration.promotedTitle` 的说明），
 * 只靠它，换库 / 重排之后「打开」会跳到别的条目上。
 */
export async function markPromoted(id: string, entryId: number, entryTitle?: string): Promise<void> {
  await loadInspirations()
  const current = snapshot.find((item) => item.id === id)
  if (current === undefined) return
  const title = entryTitle?.trim()
  await persist(
    snapshot.map((item) =>
      item.id === id
        ? { ...item, promotedId: entryId, ...(title ? { promotedTitle: title } : {}) }
        : item,
    ),
  )
}

/** 测试与「切库」时清掉内存快照 */
export function resetInspirations(): void {
  snapshot = []
  loaded = false
  loadedRoot = null
  loading = null
  readFailed = false
  emit()
}

/**
 * 备份恢复：把备份里的灵感**并进**当前快照（只增不删、不覆盖）。
 *
 * 规则（保守 + 幂等）：
 * - id 不存在 → 原样收下
 * - 同 id 且标题 / 正文 / 时间一致 → 跳过（重复导入同一份备份不会越长越多）
 * - 同 id 但内容不同 → **冲突**：本地那条一个字不动，备份这条另存成
 *   `<id>~restored`（必要时 `-2` / `-3`）的副本，两份都留着并在报告里计数。
 *   副本 id 是推导出来的，所以同一份备份再导一次会命中已有副本 → 跳过。
 *
 * 灵感是**创作内容**，不是「设置」：这里不看 `isConfigUntouched()` ——
 * 目标库里已经有改过的模板 / 分类，也不能成为丢下作者草稿的理由。
 */
export interface InspirationMergeReport {
  /** 备份里读到的条数（归一化后） */
  incoming: number
  /** 真正写进库的条数（含冲突副本） */
  added: number
  /** 已经存在、本次跳过的条数 */
  skipped: number
  /** 同 id 不同内容的冲突条数（副本可能已存在） */
  conflicts: number
}

const RESTORED_ID_SUFFIX = '~restored'

function sameInspiration(a: Inspiration, b: Inspiration): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    (a.promotedTitle ?? '') === (b.promotedTitle ?? '')
  )
}

export async function mergeInspirationsFromBackup(raw: unknown): Promise<InspirationMergeReport> {
  await loadInspirations()
  const currentRoot = root()
  const state = getInspirationsReadState()
  // 目标状态不可核对时**绝不合并**：旧库缓存 / 读失败 / 会话没就绪都算未知，
  // 这时写回等于拿备份 + 旧快照去覆盖盘上的真内容。
  if (currentRoot === null && isVaultSupported()) {
    throw new Error('笔记库还没打开，无法确认灵感状态，先刷新笔记库再恢复')
  }
  if (!state.loaded) throw new Error('灵感还没有读完，先刷新笔记库再恢复')
  if (state.readFailed) throw new Error('灵感上次没有读成功，先刷新笔记库再恢复')
  if (state.root !== currentRoot) throw new Error('灵感内存里是另一个笔记库的缓存，先刷新笔记库再恢复')
  const incoming = normalizeInspirations(raw)
  const next = [...snapshot]
  const byId = new Map(next.map((item) => [item.id, item]))
  let added = 0
  let skipped = 0
  let conflicts = 0

  for (const item of incoming) {
    const existing = byId.get(item.id)
    if (existing === undefined) {
      next.push(item)
      byId.set(item.id, item)
      added += 1
      continue
    }
    if (sameInspiration(existing, item)) {
      skipped += 1
      continue
    }
    conflicts += 1
    // 同 id 不同内容：留着本地那份，备份这份另存副本。
    let copyId = `${item.id}${RESTORED_ID_SUFFIX}`
    let index = 2
    let alreadyStored = false
    while (byId.has(copyId)) {
      if (sameInspiration(byId.get(copyId) as Inspiration, item)) {
        alreadyStored = true
        break
      }
      copyId = `${item.id}${RESTORED_ID_SUFFIX}-${index}`
      index += 1
    }
    if (alreadyStored) {
      skipped += 1
      continue
    }
    const copy: Inspiration = { ...item, id: copyId }
    next.push(copy)
    byId.set(copyId, copy)
    added += 1
  }

  if (added > 0) await persist(normalizeInspirations(next))
  return { incoming: incoming.length, added, skipped, conflicts }
}

export { normalizeInspirations }
