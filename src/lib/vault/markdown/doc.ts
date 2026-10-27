// ── 正文桥的共享类型与「支持清单」 ──────────────────────────────────────
//
// 为什么把清单集中在这里：解析与序列化必须对同一份清单负责。清单散在两个
// 转换器里时，最容易出的问题是单向丢失 —— 解析认得某个节点、序列化不认得，
// 于是「读进来能看、存回去就没了」，而且不会有任何报错。
//
// 这里只放类型与常量，不放算法，保证可以被两个转换器同时 import 而不成环。

/** Tiptap 的标记（mark）。attrs 只在 link 这类带参标记上出现 */
export interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

/** Tiptap 的节点。text 只有 text 节点有；content 只有非原子节点有 */
export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

export interface TiptapDoc {
  type: 'doc'
  content: TiptapNode[]
}

/**
 * 兜底块的围栏信息串。
 * 遇到无法无损表达为 Markdown 的内容时，正文照常输出可读 Markdown，
 * 末尾再附一个这个标记的围栏块保存原始 JSON —— 信息一条都不丢。
 */
export const FALLBACK_FENCE_INFO = 'oc-document'

/** 块级节点：编辑器 schema 里 group 为 block 的那些 */
export const BLOCK_NODE_NAMES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'imageBlock',
])

/** 行内节点。注意图片是块级原子节点 `imageBlock`（不是 `image`），
 *  它在行内只可能以「独占一个段落」的形式出现，转换时会被提升为块。 */
export const INLINE_NODE_NAMES: ReadonlySet<string> = new Set([
  'text',
  'hardBreak',
  'mention',
  'wikiLink',
  'imageBlock',
])

/**
 * 标记的固定嵌套顺序（外 → 内）。
 * 序列化时按这个次序从内往外包裹，解析时按同一顺序对 marks 排序，
 * 这样同一组 marks 无论来源如何都产出同一种写法，深度比较才稳定。
 */
export const MARK_OUTER_TO_INNER: readonly string[] = [
  'link',
  'small',
  'underline',
  'strike',
  'italic',
  'bold',
  'code',
]

export const MARK_NAMES: ReadonlySet<string> = new Set(MARK_OUTER_TO_INNER)

/** 能被 markdown 的围栏代码块表达的语言串允不允许出现反引号与空格 */
export const IMAGE_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.avif',
  '.bmp',
  '.heic',
  '.heif',
]

export function markOrderIndex(type: string): number {
  const index = MARK_OUTER_TO_INNER.indexOf(type)
  // 未知标记排到最后：它们会被记为不支持，位置只影响稳定输出的形态
  return index === -1 ? MARK_OUTER_TO_INNER.length : index
}

/** 按固定顺序排序 marks，让深度比较与输出都稳定 */
export function sortMarks(marks: readonly TiptapMark[]): TiptapMark[] {
  return [...marks].sort((a, b) => markOrderIndex(a.type) - markOrderIndex(b.type))
}

export function marksEqual(a: readonly TiptapMark[] | undefined, b: readonly TiptapMark[] | undefined): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i].type !== right[i].type) return false
    if (JSON.stringify(left[i].attrs ?? null) !== JSON.stringify(right[i].attrs ?? null)) return false
  }
  return true
}

/** 是否看起来是图片路径（用于把 `![[素材/x.png]]` 认成图片块） */
export function isImageSrc(src: string): boolean {
  const lower = src.trim().toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isSupportedBlock(type: string): boolean {
  return BLOCK_NODE_NAMES.has(type)
}

export function isSupportedInline(type: string): boolean {
  return INLINE_NODE_NAMES.has(type)
}

/** 内容里最长的一段连续反引号：围栏必须比它更长，否则代码块会被截断 */
export function longestRun(text: string, char: string): number {
  let longest = 0
  let current = 0
  for (const ch of text) {
    if (ch === char) {
      current += 1
      if (current > longest) longest = current
    } else {
      current = 0
    }
  }
  return longest
}
