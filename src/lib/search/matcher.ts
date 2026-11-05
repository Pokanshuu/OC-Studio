/**
 * 全局搜索的匹配与呈现原语（纯函数，不碰 Dexie / DOM）。
 *
 * 口径：
 * - 查询按空白拆成多个词，**全部命中**才算匹配（AND）。中文不需要分词：
 *   子串匹配本身就能覆盖「赤月」→「赤月帝国」这类检索。
 * - 命中位置分四档：标题 → 别名 → 字段 → 正文；标题决定排序，正文只补一段摘要。
 * - 高亮与摘要都在这里生成，桌面 / 移动两套壳共用同一份判断。
 */

export type SearchMatchField = 'title' | 'alias' | 'field' | 'body'

/** 参与匹配的字段（已转小写；索引侧只算一次） */
export interface SearchableRow {
  titleLower: string
  aliasesLower: string[]
  fieldLower: string
  bodyLower: string
}

export interface RowMatch {
  matched: SearchMatchField
  score: number
}

/** 查询 → 词数组：小写、去重、丢掉空白（单字也保留，中文常按单字找） */
export function searchTerms(query: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of query.split(/\s+/)) {
    const term = raw.trim().toLocaleLowerCase('zh-Hans')
    if (term === '' || seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }
  return terms
}

function countHits(text: string, terms: string[]): number {
  let hits = 0
  for (const term of terms) {
    if (text.includes(term)) hits += 1
  }
  return hits
}

function better(best: RowMatch | null, matched: SearchMatchField, score: number): RowMatch | null {
  if (score <= 0) return best
  if (best === null || score > best.score) return { matched, score }
  return best
}

/** 一行索引 → 命中结果；没有全部命中返回 null */
export function matchRow(row: SearchableRow, terms: string[]): RowMatch | null {
  if (terms.length === 0) return null

  const aliasText = row.aliasesLower.join('\n')
  const combined = [row.titleLower, aliasText, row.fieldLower, row.bodyLower].join('\n')
  for (const term of terms) {
    if (!combined.includes(term)) return null
  }

  const query = terms.join(' ')
  const title = row.titleLower
  let best: RowMatch | null = null

  if (title === query) {
    best = better(best, 'title', 200)
  } else if (title.startsWith(query)) {
    best = better(best, 'title', 170)
  } else if (title.includes(query)) {
    best = better(best, 'title', 150)
  } else {
    const hits = countHits(title, terms)
    if (hits > 0) best = better(best, 'title', 120 + hits * 2)
  }

  const aliasHits = countHits(aliasText, terms)
  if (aliasHits > 0) {
    const exact = row.aliasesLower.some((alias) => alias === query)
    best = better(best, 'alias', (exact ? 110 : 85) + aliasHits * 2)
  }

  const fieldHits = countHits(row.fieldLower, terms)
  if (fieldHits > 0) best = better(best, 'field', 60 + fieldHits * 2)

  const bodyHits = countHits(row.bodyLower, terms)
  if (bodyHits > 0) best = better(best, 'body', 40 + bodyHits * 2)

  return best
}

/** 所有命中区间（含重叠合并）；找不到返回空数组 */
export function highlightRanges(text: string, terms: string[]): { start: number; end: number }[] {
  if (text === '' || terms.length === 0) return []
  const lower = text.toLocaleLowerCase('zh-Hans')
  const ranges: { start: number; end: number }[] = []

  for (const term of terms) {
    if (term === '' || term.length > lower.length) continue
    let from = 0
    while (from <= lower.length - term.length) {
      const index = lower.indexOf(term, from)
      if (index < 0) break
      ranges.push({ start: index, end: index + term.length })
      from = index + term.length
    }
  }

  if (ranges.length === 0) return []
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const merged: { start: number; end: number }[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export interface HighlightPart {
  text: string
  hit: boolean
}

/** 把一段话切成「命中 / 未命中」的片段，供组件直接渲染 */
export function splitHighlight(text: string, terms: string[]): HighlightPart[] {
  const ranges = highlightRanges(text, terms)
  if (ranges.length === 0) return [{ text, hit: false }]

  const parts: HighlightPart[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), hit: false })
    parts.push({ text: text.slice(range.start, range.end), hit: true })
    cursor = range.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}

/**
 * 正文 → 一行摘要（关键词前后各留 `radius` 个字符）。
 *
 * 换行与连续空白先压成单个空格：摘要是「一行」的，保留 Markdown 换行只会把
 * 命中词挤出可视区。找不到命中词返回 null（标题命中时就不显示第二行）。
 */
export function buildSnippet(text: string, terms: string[], radius = 32): string | null {
  if (text === '') return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null

  const lower = flat.toLocaleLowerCase('zh-Hans')
  let index = -1
  let length = 0
  for (const term of terms) {
    if (term === '') continue
    const at = lower.indexOf(term)
    if (at >= 0 && (index < 0 || at < index)) {
      index = at
      length = term.length
    }
  }
  if (index < 0) return null

  const start = Math.max(0, index - radius)
  const end = Math.min(flat.length, index + length + radius)
  const head = start > 0 ? '…' : ''
  const tail = end < flat.length ? '…' : ''
  return `${head}${flat.slice(start, end).trim()}${tail}`
}
