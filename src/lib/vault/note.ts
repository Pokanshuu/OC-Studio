import { parseFrontmatter } from './frontmatter'
import { extractWikiLinks } from './wikilink'
import type { VaultFileEntry, VaultNote } from './types'

// ── 单个 .md 文件 → VaultNote ───────────────────────────────────────────
// 只做「拆结构」：路径 / frontmatter / 正文 / 链接。不解释语义。

export interface NoteParseResult {
  note: VaultNote
  /** frontmatter 解析失败原因；成功为 null */
  error: string | null
}

export function toNote(file: VaultFileEntry): NoteParseResult {
  const relPath = file.relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  const slash = relPath.lastIndexOf('/')
  const folder = slash >= 0 ? relPath.slice(0, slash) : ''
  const fileName = slash >= 0 ? relPath.slice(slash + 1) : relPath
  const basename = fileName.replace(/\.md$/i, '')

  const parsed = parseFrontmatter(file.content)

  return {
    note: {
      relPath,
      folder,
      basename,
      frontmatter: parsed.data,
      body: parsed.body,
      links: extractWikiLinks(parsed.body),
      size: file.size,
      // Windows 的 mtimeMs 带小数，统一取整，避免它渗进实体的 updatedAt
      mtimeMs: Math.round(file.mtimeMs),
    },
    error: parsed.error,
  }
}

/** 展示名：frontmatter.title 优先，回落文件名 */
export function noteTitle(note: VaultNote): string {
  const title = note.frontmatter.title
  if (typeof title === 'string' && title.trim() !== '') return title.trim()
  if (typeof title === 'number') return String(title)
  return note.basename
}

/** frontmatter.aliases → 字符串数组（兼容 `[a, b]` 与 `a、b` 两种写法） */
export function noteAliases(note: VaultNote): string[] {
  return toStringArray(note.frontmatter.aliases)
}

/** frontmatter 的任意值 → 去空字符串数组 */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
      .map((item) => String(item).trim())
      .filter((item) => item !== '')
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter((item) => item !== '')
  }
  return []
}
