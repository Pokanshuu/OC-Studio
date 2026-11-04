/**
 * 小说导出（W2 第三刀）：章节树 → Markdown / TXT。
 *
 * 数据是「章节 = 一篇笔记，大纲 = `parentId` 的树」（`docs/小说.md` §1–§4），
 * 所以导出不另建一套遍历：先 `buildEntryTree` 排成树，再按深度拼。
 *
 * 正文在 `worldEntries.content` 里是 Tiptap JSON 字符串；这里用一个**只读**的
 * 极简渲染器把它转成纯文本 / Markdown，不复用编辑器的 HTML 输出
 * （编辑器输出会带一堆 span，投稿用不了）。
 *
 * 不做的：分页、版式、页眉页脚（版式交给导出目标，见 docs/小说.md §5）。
 */
import type { WorldEntry } from '@/types'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'

export type NovelDocNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: NovelDocNode[]
  text?: string
  marks?: Array<{ type: string }>
}

export interface NovelExportChapter {
  title: string
  /** 1 = 卷/章，2 = 节 …（按树深度） */
  depth: number
  text: string
  /**
   * 章内插图（`imageBlock.src`，库内相对路径或 data URL），按正文顺序。
   * 纯文本 / TXT / 分页预览不显示；Word 导出据此把图写进 `word/media/`。
   */
  images?: string[]
}

function parseDoc(content: string): NovelDocNode | null {
  if (!content.trim().startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as NovelDocNode
  } catch {
    return null
  }
}

function inlineText(node: NovelDocNode, markdown: boolean): string {
  if (node.type === 'text') {
    const text = node.text ?? ''
    if (!markdown || !node.marks || node.marks.length === 0) return text
    return node.marks.reduce((acc, mark) => {
      if (mark.type === 'bold') return `**${acc}**`
      if (mark.type === 'italic') return `*${acc}*`
      if (mark.type === 'strike') return `~~${acc}~~`
      if (mark.type === 'code') return `\`${acc}\``
      return acc
    }, text)
  }
  // @ 引用 / [[内链]] 是 atom：正文在 attrs.label 上，直接读 content 会得到空串
  if (node.type === 'mention' || node.type === 'wikiLink') {
    const label = String(node.attrs?.label ?? node.attrs?.raw ?? '').trim()
    return label
  }
  if (node.type === 'hardBreak') return '\n'
  const inner = (node.content ?? []).map((child) => inlineText(child, markdown)).join('')
  return inner
}

function blockLines(node: NovelDocNode, markdown: boolean): string[] {
  switch (node.type) {
    case 'paragraph':
      return [inlineText(node, markdown)]
    case 'heading': {
      const level = Number(node.attrs?.level ?? 2)
      const text = inlineText(node, markdown)
      return markdown ? [`${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`] : [text]
    }
    case 'imageBlock': {
      const src = String(node.attrs?.src ?? '')
      if (!src) return []
      // 纯文本（TXT / 分页预览 / 字数）不出现任何图片标记；Markdown 才保留图片语法
      return markdown ? [`![](${src})`] : []
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (node.content ?? []).map((item, index) => {
        const text = (item.content ?? []).map((child) => inlineText(child, markdown)).join('')
        const bullet = node.type === 'orderedList' ? `${index + 1}.` : '-'
        return `${bullet} ${text}`
      })
      return items
    }
    case 'blockquote': {
      const text = (node.content ?? []).map((child) => inlineText(child, markdown)).join('\n')
      return markdown ? text.split('\n').map((line) => `> ${line}`) : [text]
    }
    case 'codeBlock':
      return markdown
        ? ['```', (node.content ?? []).map((child) => child.text ?? '').join(''), '```']
        : [(node.content ?? []).map((child) => child.text ?? '').join('')]
    case 'horizontalRule':
      return markdown ? ['---'] : ['']
    default:
      return node.content ? node.content.flatMap((child) => blockLines(child, markdown)) : []
  }
}

function imageSources(node: NovelDocNode, out: string[]): void {
  if (node.type === 'imageBlock' || node.type === 'image') {
    const src = String(node.attrs?.src ?? '').trim()
    if (src) out.push(src)
  }
  for (const child of node.content ?? []) imageSources(child, out)
}

/** 一章的插图源（正文顺序）；没有图片时返回空数组 */
export function chapterImages(entry: WorldEntry): string[] {
  const doc = parseDoc(entry.content)
  if (!doc) return []
  const out: string[] = []
  imageSources(doc, out)
  return out
}

/** 一章的正文：Tiptap JSON → Markdown / 纯文本 */
export function chapterText(entry: WorldEntry, markdown: boolean): string {
  const doc = parseDoc(entry.content)
  if (!doc) {
    // 老数据可能直接把纯文本 / Markdown 存在 content 里
    return entry.content.trim()
  }
  const blocks = (doc.content ?? []).flatMap((node) => blockLines(node, markdown))
  return blocks.join(markdown ? '\n\n' : '\n').trim()
}

function collect(
  nodes: WorldTreeNode[],
  depth: number,
  out: NovelExportChapter[],
  markdown: boolean,
): void {
  for (const node of nodes) {
    const text = chapterText(node.entry, markdown)
    const images = chapterImages(node.entry)
    out.push(
      images.length > 0
        ? { title: node.entry.title, depth, text, images }
        : { title: node.entry.title, depth, text },
    )
    if (node.children.length > 0) collect(node.children, depth + 1, out, markdown)
  }
}

/**
 * 树 → 章节序列（顺序与编辑器目录 / 静态站完全一致）。
 *
 * 默认给**纯文本**：TXT / Word / 分页预览 / 字数统计都不该看到 `**` `##`；
 * 只有 Markdown 导出才显式要 `markdown: true`。
 */
export function flattenNovel(
  entries: WorldEntry[],
  options: { markdown?: boolean } = {},
): NovelExportChapter[] {
  const out: NovelExportChapter[] = []
  collect(buildEntryTree(entries), 1, out, options.markdown === true)
  return out
}

/** Markdown：书名 `#`，卷 `##`，章 `###` …（层级从书名下一档开始，最多 6 级） */
export function toMarkdown(chapters: NovelExportChapter[], options: { title?: string } = {}): string {
  const parts: string[] = []
  if (options.title) parts.push(`# ${options.title}`)
  for (const chapter of chapters) {
    const level = Math.min(6, chapter.depth + 1)
    parts.push(`${'#'.repeat(level)} ${chapter.title}`)
    if (chapter.text) parts.push(chapter.text)
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n'
}

/** TXT：投稿最常用的形态 —— 标题空一行，正文按段，章节之间空两行 */
export function toTxt(chapters: NovelExportChapter[], options: { title?: string } = {}): string {
  const parts: string[] = []
  if (options.title) parts.push(options.title)
  for (const chapter of chapters) {
    parts.push(chapter.title)
    if (chapter.text) parts.push(chapter.text)
  }
  return parts.join('\n\n') + '\n'
}

/** 字数（和 fork 版一致：按去掉空白的字符数算）；图片路径 / 图片标记不计入 */
export function countNovelWords(chapters: NovelExportChapter[]): number {
  return chapters.reduce((sum, chapter) => {
    const prose = chapter.text
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/［图片］/g, '')
    return sum + prose.replace(/\s/g, '').length
  }, 0)
}
