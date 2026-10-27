// 正文桥：Markdown ⇄ Tiptap JSON 的对外入口。
// 两个方向都只依赖 doc.ts 的支持清单，保证解析与序列化对同一份契约负责。

export type { TiptapDoc, TiptapMark, TiptapNode } from './doc'
export {
  BLOCK_NODE_NAMES,
  FALLBACK_FENCE_INFO,
  IMAGE_EXTENSIONS,
  INLINE_NODE_NAMES,
  MARK_NAMES,
  MARK_OUTER_TO_INNER,
  isImageSrc,
  isSupportedBlock,
  isSupportedInline,
  longestRun,
  markOrderIndex,
  marksEqual,
  sortMarks,
} from './doc'

export type { LinkRef, MarkdownToTiptapOptions, ResolvedLink } from './to-tiptap'
export { markdownToTiptap } from './to-tiptap'

export type { TiptapToMarkdownOptions, TiptapToMarkdownResult } from './to-markdown'
export { tiptapToMarkdown } from './to-markdown'
