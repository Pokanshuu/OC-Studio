import { getVaultSession } from './vault-session'
import { vaultFs } from './vault-fs'

// ── 创作时间线（`.ocstudio/journal.jsonl`） ──────────────────────────────
// 目的很单纯：**证明过程**。「这角色我 8 月就写了」「这段设定是后来改的」——
// 被误解成抄别人的时候，能把一份带时间戳的记录摊出来。
//
// 因此刻意只做三件事：记录、只读列表、导出。**不做**回滚、不做 diff、不存全文。
// 每行一条 JSON：
//   { ts, kind, relPath, title, keys, hash, prevHash }
// · keys      这次改到哪些 frontmatter 键（正文算一个 `body`）
// · hash      写完之后整份文件的 sha256
// · prevHash  写之前那份的 sha256（新文件为空）
// 哈希只是「这一版≠上一版」的凭据，不保存内容本身 —— 记录别人也伪造不了时间线
// 以外的东西，我们也不替用户留一份正文副本。
//
// 写不进去绝不能影响保存：调用点一律 fire-and-forget + 打日志。

export const JOURNAL_REL_PATH = '.ocstudio/journal.jsonl'
/** 一次 tail 最多取多少行（够看，且不会把大文件全塞进内存） */
export const JOURNAL_TAIL_LIMIT = 2000

export type JournalKind = 'create' | 'update' | 'trash' | 'restore' | 'remove'

export interface JournalEntry {
  /** 毫秒时间戳 */
  ts: number
  kind: JournalKind
  relPath: string
  title: string
  /** 这次改到的键；正文记作 `body` */
  keys: string[]
  hash: string
  prevHash: string
}

/** 一条待写入的记录（哈希与时间由本模块补齐） */
export interface JournalDraft {
  kind: JournalKind
  relPath: string
  title: string
  keys: string[]
  content: string
  prevContent: string
}

async function sha256Hex(text: string): Promise<string> {
  if (text === '') return ''
  try {
    const bytes = new TextEncoder().encode(text)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // 没有 subtle（老 WebView / 非安全上下文）就退回长度+简单哈希：
    // 时间线仍然能证明「变过」，只是强度弱一点，不该因此不记
    let hash = 0
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0
    return `fnv:${(hash >>> 0).toString(16)}:${text.length}`
  }
}

/** 把一批改动追加进时间线。失败只打日志，不打断保存。 */
export async function appendJournal(drafts: JournalDraft[]): Promise<void> {
  const session = getVaultSession()
  if (session === null || drafts.length === 0) return

  try {
    const lines: string[] = []
    const ts = Date.now()
    for (const draft of drafts) {
      const entry: JournalEntry = {
        ts,
        kind: draft.kind,
        relPath: draft.relPath,
        title: draft.title,
        keys: draft.keys,
        hash: await sha256Hex(draft.content),
        prevHash: await sha256Hex(draft.prevContent),
      }
      lines.push(JSON.stringify(entry))
    }
    await vaultFs.journalAppend(session.root, JOURNAL_REL_PATH, lines)
  } catch (err) {
    console.warn('[vault] 时间线写入失败（不影响保存）:', err)
  }
}

/** 读时间线，**新的在前**。坏行（手改坏了 / 写到一半）直接跳过。 */
export async function readJournal(limit = JOURNAL_TAIL_LIMIT): Promise<JournalEntry[]> {
  const session = getVaultSession()
  if (session === null) return []

  let lines: string[]
  try {
    lines = await vaultFs.journalTail(session.root, JOURNAL_REL_PATH, limit)
  } catch {
    return []
  }

  const entries: JournalEntry[] = []
  for (const line of lines) {
    const entry = parseJournalLine(line)
    if (entry !== null) entries.push(entry)
  }
  entries.reverse()
  return entries
}

/** 解析单行；坏行返回 null（导出给自检脚本用） */
export function parseJournalLine(line: string): JournalEntry | null {
  try {
    const value: unknown = JSON.parse(line)
    if (value === null || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const kind = record.kind
    if (
      kind !== 'create' &&
      kind !== 'update' &&
      kind !== 'trash' &&
      kind !== 'restore' &&
      kind !== 'remove'
    ) {
      return null
    }
    return {
      ts: typeof record.ts === 'number' ? record.ts : 0,
      kind,
      relPath: typeof record.relPath === 'string' ? record.relPath : '',
      title: typeof record.title === 'string' ? record.title : '',
      keys: Array.isArray(record.keys)
        ? record.keys.filter((key): key is string => typeof key === 'string')
        : [],
      hash: typeof record.hash === 'string' ? record.hash : '',
      prevHash: typeof record.prevHash === 'string' ? record.prevHash : '',
    }
  } catch {
    return null
  }
}

const KIND_LABEL: Record<JournalKind, string> = {
  create: '新建',
  update: '保存',
  trash: '移入回收站',
  restore: '从回收站还原',
  remove: '彻底删除',
}

export function journalKindLabel(kind: JournalKind): string {
  return KIND_LABEL[kind]
}

/** 某一条笔记的历史（按 relPath 匹配，新的在前） */
export function journalOf(entries: JournalEntry[], relPath: string): JournalEntry[] {
  return entries.filter((entry) => entry.relPath === relPath)
}

/**
 * 导出的结构（JSON）。
 * 带 `version` 是给以后留退路：要改结构就改这个版本号，不做第二套格式。
 * `time` / `kindLabel` 是给人看的，`ts` / `keys` / hash 是给机器看的。
 */
export interface JournalExport {
  app: 'oc-studio'
  version: 1
  exportedAt: string
  note: { relPath: string; title: string }
  entries: (JournalEntry & { time: string; kindLabel: string })[]
}

export function buildJournalExport(
  entries: JournalEntry[],
  note: { relPath: string; title: string },
): JournalExport {
  return {
    app: 'oc-studio',
    version: 1,
    exportedAt: new Date().toISOString(),
    note,
    entries: entries.map((entry) => ({
      ...entry,
      time: formatTimestamp(entry.ts),
      kindLabel: journalKindLabel(entry.kind),
    })),
  }
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return '未知时间'
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
