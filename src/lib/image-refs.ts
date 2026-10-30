import type { Character, Country, Event, WorldEntry } from '@/types'

// ── 实体图片引用的唯一收集器 ─────────────────────────────────────────────
// 三个地方共用这份规则，避免再出现「这边认得正文图、那边不认」的漂移：
//   1. 相册（`components/shared/useAlbumData.ts`）—— 正文里的图也要能被看见
//   2. `.ocbak` 备份（`lib/export/payload.ts`）—— 备份要能把图一起带走
//   3. 老数据落地（`lib/vault/export-dir.ts`）—— 迁进文件夹时要把图搬过去
//
// 只用纯函数、不碰数据库与 Tauri，方便脚本里直接断言。

export type ImageCategory =
  | 'avatar'
  | 'fullbody'
  | 'header'
  | 'gallery'
  | 'flag'
  | 'cover'
  | 'body'

export interface ImageRef {
  url: string
  category: ImageCategory
}

function parseDocument(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (text === '' || (text[0] !== '{' && text[0] !== '[')) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * 正文（Tiptap 文档）里所有 `imageBlock.src`。
 *
 * 字段图只是「封面 / 头像 / 图集」，作者真正大量插图的地方是正文；
 * 只扫字段的话，相册会少一大半图、备份会漏一大半图。
 */
export function collectBodyImageRefs(document: unknown): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const record = node as Record<string, unknown>
    if (record.type === 'imageBlock') {
      const attrs = record.attrs
      if (attrs !== null && typeof attrs === 'object') {
        const src = (attrs as Record<string, unknown>).src
        if (typeof src === 'string' && src !== '' && !seen.has(src)) {
          seen.add(src)
          found.push(src)
        }
      }
    }
    for (const value of Object.values(record)) visit(value)
  }

  visit(parseDocument(document))
  return found
}

function listUrls(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const item of list) {
    const url = typeof item === 'string' ? item : (item as { url?: string } | null)?.url
    if (typeof url === 'string' && url !== '') out.push(url)
  }
  return out
}

export function collectCharacterImageRefs(character: Character): ImageRef[] {
  const refs: ImageRef[] = []
  if (character.avatarUrl) refs.push({ url: character.avatarUrl, category: 'avatar' })
  for (const url of listUrls(character.avatars)) refs.push({ url, category: 'fullbody' })
  if (character.headerUrl) refs.push({ url: character.headerUrl, category: 'header' })
  for (const url of listUrls(character.gallery)) refs.push({ url, category: 'gallery' })
  for (const url of collectBodyImageRefs(character.document)) refs.push({ url, category: 'body' })
  return refs
}

export function collectEventImageRefs(event: Event): ImageRef[] {
  const refs: ImageRef[] = []
  if (event.headerUrl) refs.push({ url: event.headerUrl, category: 'header' })
  for (const url of listUrls(event.images)) refs.push({ url, category: 'gallery' })
  for (const url of collectBodyImageRefs(event.document)) refs.push({ url, category: 'body' })
  return refs
}

export function collectCountryImageRefs(country: Country): ImageRef[] {
  const refs: ImageRef[] = []
  if (country.flagUrl) refs.push({ url: country.flagUrl, category: 'flag' })
  if (country.headerUrl) refs.push({ url: country.headerUrl, category: 'header' })
  for (const url of collectBodyImageRefs(country.document)) refs.push({ url, category: 'body' })
  return refs
}

/** 词条的正文在 `content`（历史数据是 JSON 字符串），没有才看 `document` */
export function collectWorldEntryImageRefs(entry: WorldEntry): ImageRef[] {
  const doc = collectBodyImageRefs(entry.content).length > 0
    ? entry.content
    : entry.document
  return collectBodyImageRefs(doc).map((url) => ({ url, category: 'body' as const }))
}

/**
 * 把图片映射写回正文里的 `imageBlock.src`（返回新对象，不改原文档）。
 * `.ocbak` 内联图片时需要它：字段图换了 data URI，正文图不换就还是死链。
 */
export function inlineBodyImageRefs(document: unknown, map: Map<string, string>): unknown {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit)
    if (node === null || typeof node !== 'object') return node
    const record = node as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) next[key] = visit(value)
    if (record.type === 'imageBlock') {
      const attrs = record.attrs
      if (attrs !== null && typeof attrs === 'object') {
        const src = (attrs as Record<string, unknown>).src
        if (typeof src === 'string' && map.has(src)) {
          next.attrs = { ...(attrs as Record<string, unknown>), src: map.get(src) }
        }
      }
    }
    return next
  }
  const parsed = parseDocument(document)
  if (parsed === null) return document
  const rewritten = visit(parsed)
  // 词条的正文是字符串化的文档，改写后要还原成字符串
  return typeof document === 'string' ? JSON.stringify(rewritten) : rewritten
}
