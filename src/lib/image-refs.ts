import { worldBodyOf } from '@/lib/world-body'
import type { Character, Country, Event, WorldEntry } from '@/types'

// ── 实体图片引用的唯一收集器 ─────────────────────────────────────────────
// 三个地方共用这份规则，避免再出现「这边认得正文图、那边不认」的漂移：
//   1. 相册（`components/shared/useAlbumData.ts`）—— 正文里的图也要能被看见
//   2. `.ocbak` 备份（`lib/export/payload.ts`）—— 备份要能把图一起带走
//   3. 老数据落地（`lib/vault/export-dir.ts`）—— 迁进文件夹时要把图搬过去
//
// 字段图之外还有三个「已存在但曾漏收」的槽位（PR5 收尾 D1）：
// 角色 `animationUrl`（OC 动画，走 `collectCharacterAnimationRefs`）、
// 词条 `novelCover`（小说封面）、词条 `mapImage`（地图底图）。
// 只扫字段 / 只扫正文都会漏，所以「哪些字段算图片」只能在这里回答。
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
  /** 模板「图片」组件的单图槽位（与画廊分开统计） */
  | 'image'
  /** 角色 OC 动画（视频，落在 `附件/`）；不进相册的静态图分组 */
  | 'animation'
  /** 词条 · 小说封面（2:3 槽位） */
  | 'novelCover'
  /** 词条 · 地图底图（`.ocstudio/maps/` 相对路径或 `data:`） */
  | 'map'

export interface ImageRef {
  url: string
  category: ImageCategory
}

/**
 * 收集时的旁路账本。
 *
 * `blob:` 是**只在当前会话有效**的地址（浏览器预览上传、视频上传后未落盘），
 * 刷新即失效，备份与落地都带不走 —— 收集器直接跳过它们，并把地址记进
 * `skipped`，免得下游把「丢了几个引用」做成静默行为。
 */
export interface ImageRefOptions {
  skipped?: string[]
}

/** 只在当前会话有效的地址：`blob:` 刷新即失效 */
export function isTransientImageRef(url: string): boolean {
  return url.startsWith('blob:')
}

/** 所有字段图共用的入列规则：空串 / `blob:` 不进结果（后者留痕） */
function addRef(
  refs: ImageRef[],
  url: string | undefined,
  category: ImageCategory,
  options?: ImageRefOptions,
): void {
  if (typeof url !== 'string' || url === '') return
  if (isTransientImageRef(url)) {
    options?.skipped?.push(url)
    return
  }
  refs.push({ url, category })
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

export function collectCharacterImageRefs(
  character: Character,
  options?: ImageRefOptions,
): ImageRef[] {
  const refs: ImageRef[] = []
  addRef(refs, character.avatarUrl, 'avatar', options)
  for (const url of listUrls(character.avatars)) addRef(refs, url, 'fullbody', options)
  addRef(refs, character.headerUrl, 'header', options)
  for (const url of listUrls(character.gallery)) addRef(refs, url, 'gallery', options)
  for (const url of collectBodyImageRefs(character.document)) addRef(refs, url, 'body', options)
  return refs
}

/**
 * 角色 OC 动画（`animationUrl`）。
 *
 * 单独一条入口而不是塞进 `collectCharacterImageRefs`：相册是**静态图**画廊
 * （`docs/相册.md` §1.1 的槽位里没有动画），把 `.mp4` 塞进去只会在网格里
 * 出现一格坏图。备份（`.ocbak`）与文件夹落地才是它的两个消费方。
 */
export function collectCharacterAnimationRefs(
  character: Character,
  options?: ImageRefOptions,
): ImageRef[] {
  const refs: ImageRef[] = []
  addRef(refs, character.animationUrl, 'animation', options)
  return refs
}

export function collectEventImageRefs(event: Event, options?: ImageRefOptions): ImageRef[] {
  const refs: ImageRef[] = []
  addRef(refs, event.headerUrl, 'header', options)
  for (const url of listUrls(event.images)) addRef(refs, url, 'gallery', options)
  for (const url of collectBodyImageRefs(event.document)) addRef(refs, url, 'body', options)
  return refs
}

export function collectCountryImageRefs(country: Country, options?: ImageRefOptions): ImageRef[] {
  const refs: ImageRef[] = []
  addRef(refs, country.flagUrl, 'flag', options)
  addRef(refs, country.headerUrl, 'header', options)
  for (const url of listUrls(country.gallery)) addRef(refs, url, 'gallery', options)
  for (const url of collectBodyImageRefs(country.document)) addRef(refs, url, 'body', options)
  return refs
}

/**
 * 词条的正文在 `content`（历史数据是 JSON 字符串），没有才看 `document`；
 * 另外两个「已存在但曾漏收」的字段图也在这里：
 * - `novelCover` 小说封面（2:3）
 * - `mapImage` 地图底图（`.ocstudio/maps/` 相对路径或 `data:`）
 */
export function collectWorldEntryImageRefs(
  entry: WorldEntry,
  options?: ImageRefOptions,
): ImageRef[] {
  const refs: ImageRef[] = []
  const doc = worldBodyOf(entry)
  for (const url of collectBodyImageRefs(doc)) addRef(refs, url, 'body', options)
  addRef(refs, entry.cover, 'cover', options)
  // 模板组件的三个图片槽位：头像 / 单图 / 图集
  addRef(refs, entry.avatar, 'avatar', options)
  addRef(refs, entry.image, 'image', options)
  for (const url of listUrls(entry.gallery)) addRef(refs, url, 'gallery', options)
  addRef(refs, entry.novelCover, 'novelCover', options)
  addRef(refs, entry.mapImage, 'map', options)
  return refs
}

/**
 * 一次收集一整份数据集 —— `.ocbak` 备份与老数据落地共用这一条入口。
 *
 * 别在调用方自己写 `for (const row of rows)`：`payload.ts` 曾经把**整个数组**
 * 当成一个实体传给收集器（`collectCharacterImageRefs(characters as never)`），
 * 于是 `.ocbak` 一张实体图都没内联，换台机器导入全是死链。
 * 相册按实体自己遍历（它要带来源信息），也仍然走下面这些单实体函数。
 */
export interface ImageRefDataset {
  characters: Character[]
  events: Event[]
  countries: Country[]
  worldEntries: WorldEntry[]
  /** 世界封面（`meta.coverUrl`） */
  metaCoverUrl?: string
}

export function collectDatasetImageRefs(
  data: ImageRefDataset,
  options?: ImageRefOptions,
): ImageRef[] {
  const refs: ImageRef[] = []
  const push = (list: ImageRef[]): void => {
    for (const ref of list) refs.push(ref)
  }

  for (const character of data.characters) {
    push(collectCharacterImageRefs(character, options))
    push(collectCharacterAnimationRefs(character, options))
  }
  for (const event of data.events) push(collectEventImageRefs(event, options))
  for (const country of data.countries) push(collectCountryImageRefs(country, options))
  for (const entry of data.worldEntries) push(collectWorldEntryImageRefs(entry, options))
  addRef(refs, data.metaCoverUrl, 'cover', options)

  return refs
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
