/**
 * fork 版（PR #5）小说数据的**只读适配器**。
 *
 * 那个 fork 把小说放在**独立 IndexedDB**（`OCStudioNovels`）里，章节是一段 HTML 字符串；
 * 我们的模型是「章节 = 一篇笔记，大纲 = `parentId` 的树」（见 `docs/小说.md` §1–§2、§7）。
 *
 * 三条硬规矩（`docs/小说.md` §7.3）：
 * 1. **幂等**：导入完成由调用方在 `meta` 打标记，这里不写任何状态
 * 2. **不删源**：只读 `OCStudioNovels`，一个字节都不动
 * 3. **可核对**：返回 `report`，调用方写进 journal / 提示给用户
 *
 * 这个模块只做「读 + 映射」，不碰 Dexie 主库、不碰 vault。
 */

export interface LegacyNovelChapter {
  id: string
  title: string
  /** HTML 字符串（fork 版用 `<p></p>` 这类） */
  content: string
  summary?: string
  status?: 'draft' | 'revising' | 'done'
}

export interface LegacyNovel {
  id?: number
  title: string
  author: string
  synopsis: string
  coverUrl?: string
  notes?: string
  noteItems?: Array<{ id: string; text: string }>
  targetWords?: number
  chapters: LegacyNovelChapter[]
  createdAt: number
  updatedAt: number
}

/** 我们的 `worldEntries` 落库形态（只列导入要写的字段） */
export interface NovelEntryDraft {
  title: string
  /** 归属标记：不是层级（层级仍然只由 parentId 表达） */
  category: '小说'
  parentId: number | null
  order: number
  /** `worldEntries.content` 存 JSON 字符串 */
  content: string
}

export interface NovelImportPlan {
  /** 小说本体 → 一个顶层词条 */
  root: NovelEntryDraft
  /** 章节 → 根的子节点，顺序按原 chapters 数组 */
  chapters: NovelEntryDraft[]
  report: {
    /** blob: / http(s) 封面拿不到，记下来提示用户重设 */
    skippedCovers: number
    /** HTML 里无法表达、被降级成纯文本的块数 */
    htmlFallbacks: number
  }
}

type DocNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: DocNode[]
  text?: string
  marks?: Array<{ type: string }>
}

const emptyDoc = (): DocNode => ({ type: 'doc', content: [{ type: 'paragraph' }] })

function textNode(text: string, marks?: Array<{ type: string }>): DocNode {
  return marks && marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text }
}

/** 行内：strong / em / s / code，其余降级成纯文本 */
function inlineFrom(node: Node, inherited: Array<{ type: string }> = []): DocNode[] {
  const out: DocNode[] = []
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      const text = child.textContent ?? ''
      if (text.trim().length > 0 || text === ' ') out.push(textNode(text, inherited))
      return
    }
    if (child.nodeType !== 1) return
    const el = child as HTMLElement
    const tag = el.tagName.toLowerCase()
    const marks = [...inherited]
    if (tag === 'strong' || tag === 'b') marks.push({ type: 'bold' })
    if (tag === 'em' || tag === 'i') marks.push({ type: 'italic' })
    if (tag === 's' || tag === 'del') marks.push({ type: 'strike' })
    if (tag === 'code') marks.push({ type: 'code' })
    out.push(...inlineFrom(el, marks))
  })
  return out
}

function blockFrom(el: HTMLElement): DocNode | null {
  const tag = el.tagName.toLowerCase()
  const inline = inlineFrom(el)
  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(el.querySelectorAll(':scope > li')).map((li) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: inlineFrom(li) }],
    }))
    return items.length > 0
      ? { type: tag === 'ul' ? 'bulletList' : 'orderedList', content: items }
      : null
  }
  if (/^h[1-3]$/.test(tag)) {
    return { type: 'heading', attrs: { level: Number(tag.slice(1)) }, content: inline }
  }
  if (tag === 'blockquote') {
    return { type: 'blockquote', content: [{ type: 'paragraph', content: inline }] }
  }
  if (tag === 'pre') {
    return { type: 'codeBlock', content: [textNode(el.textContent ?? '')] }
  }
  if (inline.length === 0) return { type: 'paragraph' }
  return { type: 'paragraph', content: inline }
}

/** 无 DOM 环境下的行内解析：只认粗体 / 斜体 / 删除线 / 行内代码 */
function inlineFromHtml(html: string): DocNode[] {
  const out: DocNode[] = []
  const marks: Array<{ type: string }> = []
  const markOf: Record<string, string> = {
    strong: 'bold',
    b: 'bold',
    em: 'italic',
    i: 'italic',
    s: 'strike',
    del: 'strike',
    code: 'code',
  }
  const push = (text: string) => {
    if (text.length > 0) out.push(textNode(text, [...marks]))
  }
  const tagRe = /<\/?([a-zA-Z0-9]+)[^>]*>/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(html)) !== null) {
    push(html.slice(cursor, match.index))
    const tag = match[1].toLowerCase()
    const closing = match[0].startsWith('</')
    const mark = markOf[tag]
    if (mark) {
      if (closing) {
        const at = marks.map((m) => m.type).lastIndexOf(mark)
        if (at >= 0) marks.splice(at, 1)
      } else {
        marks.push({ type: mark })
      }
    } else if (tag === 'br') {
      push('\n')
    }
    cursor = tagRe.lastIndex
  }
  push(html.slice(cursor))
  return out
}

/**
 * 无 DOM 环境下的块级解析（Node / 自检脚本）：段落、标题、列表、引用、代码块。
 * 能力比 DOMParser 版弱（不认嵌套表格、图片），但**内容不丢、结构尽力保留**。
 */
function fallbackDoc(source: string): { doc: DocNode; degraded: boolean } {
  const blocks: DocNode[] = []
  const blockRe = /<(p|h1|h2|h3|ul|ol|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let cursor = 0
  let match: RegExpExecArray | null

  const pushPlain = (text: string) => {
    const clean = text.replace(/<[^>]+>/g, '').trim()
    if (clean.length > 0) blocks.push({ type: 'paragraph', content: [textNode(clean)] })
  }

  while ((match = blockRe.exec(source)) !== null) {
    pushPlain(source.slice(cursor, match.index))
    const tag = match[1].toLowerCase()
    const inner = match[2]

    if (tag === 'ul' || tag === 'ol') {
      const items: DocNode[] = []
      const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
      let li: RegExpExecArray | null
      while ((li = liRe.exec(inner)) !== null) {
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineFromHtml(li[1]) }] })
      }
      if (items.length > 0) {
        blocks.push({ type: tag === 'ul' ? 'bulletList' : 'orderedList', content: items })
      }
    } else if (/^h[1-3]$/.test(tag)) {
      blocks.push({
        type: 'heading',
        attrs: { level: Number(tag.slice(1)) },
        content: inlineFromHtml(inner),
      })
    } else if (tag === 'blockquote') {
      blocks.push({ type: 'blockquote', content: [{ type: 'paragraph', content: inlineFromHtml(inner) }] })
    } else if (tag === 'pre') {
      blocks.push({ type: 'codeBlock', content: [textNode(inner.replace(/<[^>]+>/g, ''))] })
    } else {
      const inline = inlineFromHtml(inner)
      blocks.push(inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' })
    }
    cursor = blockRe.lastIndex
  }
  pushPlain(source.slice(cursor))

  return {
    doc: { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] },
    degraded: true,
  }
}

/**
 * HTML → Tiptap doc。
 *
 * 有 DOM（浏览器 / Capacitor / Tauri）时走 DOMParser；没有 DOM（Node、自检脚本）
 * 时走一组正则解析器，**保留段落、标题、列表、粗斜体**，只把认不出的标签降级成文本。
 */
export function htmlToDoc(html: string): { doc: DocNode; degraded: boolean } {
  const source = html.trim()
  if (source.length === 0) return { doc: emptyDoc(), degraded: false }

  if (typeof DOMParser === 'undefined') return fallbackDoc(source)

  const doc = new DOMParser().parseFromString(source, 'text/html')
  const blocks: DocNode[] = []
  Array.from(doc.body.childNodes).forEach((node) => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? ''
      if (text.trim().length > 0) blocks.push({ type: 'paragraph', content: [textNode(text.trim())] })
      return
    }
    if (node.nodeType !== 1) return
    const block = blockFrom(node as HTMLElement)
    if (block) blocks.push(block)
  })

  return {
    doc: { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] },
    degraded: false,
  }
}

/** 封面能不能被我们取到：blob:/http(s) 在另一个库里拿不到 */
function coverIsReachable(url: string | undefined): boolean {
  if (!url) return false
  return !/^(blob:|https?:)/i.test(url)
}

/**
 * 一本 fork 小说 → 一棵笔记子树（根 + 章节）。
 *
 * `startOrder` 用于接在已有节点后面；返回的 `chapters[].parentId` 先留 null，
 * 等根节点拿到自增主键后由调用方回填（Dexie 的 add 才能拿到 id）。
 */
export function planNovelImport(novel: LegacyNovel, startOrder = 0): NovelImportPlan {
  let degraded = 0

  const chapterDrafts: NovelEntryDraft[] = novel.chapters.map((chapter, index) => {
    const { doc, degraded: wasDegraded } = htmlToDoc(chapter.content)
    if (wasDegraded) degraded += 1
    if (chapter.summary || chapter.status) {
      const meta: DocNode[] = []
      if (chapter.summary) {
        meta.push({ type: 'paragraph', content: [textNode(`梗概：${chapter.summary}`)] })
      }
      if (chapter.status) {
        meta.push({ type: 'paragraph', content: [textNode(`状态：${chapter.status}`)] })
      }
      doc.content = [...doc.content ?? [], ...meta]
    }
    return {
      title: chapter.title.trim() || `第${index + 1}章`,
      category: '小说',
      parentId: null,
      order: startOrder + index + 1,
      content: JSON.stringify(doc),
    }
  })

  // 根节点正文：简介 + 备注（备注不静默丢）
  const rootBlocks: DocNode[] = []
  if (novel.synopsis.trim()) {
    rootBlocks.push({ type: 'paragraph', content: [textNode(novel.synopsis.trim())] })
  }
  if (novel.notes && novel.notes.trim()) {
    rootBlocks.push({ type: 'heading', attrs: { level: 2 }, content: [textNode('备注')] })
    rootBlocks.push({ type: 'paragraph', content: [textNode(novel.notes.trim())] })
  }
  if (novel.noteItems && novel.noteItems.length > 0) {
    if (!novel.notes || !novel.notes.trim()) {
      rootBlocks.push({ type: 'heading', attrs: { level: 2 }, content: [textNode('备注')] })
    }
    novel.noteItems.forEach((item) => {
      if (item.text.trim()) {
        rootBlocks.push({ type: 'paragraph', content: [textNode(`· ${item.text.trim()}`)] })
      }
    })
  }

  return {
    root: {
      title: novel.title.trim() || '未命名小说',
      category: '小说',
      parentId: null,
      order: startOrder,
      content: JSON.stringify({ type: 'doc', content: rootBlocks.length > 0 ? rootBlocks : [{ type: 'paragraph' }] }),
    },
    chapters: chapterDrafts,
    report: {
      skippedCovers: coverIsReachable(novel.coverUrl) ? 0 : novel.coverUrl ? 1 : 0,
      htmlFallbacks: degraded,
    },
  }
}

/** fork 小说库的名字与表名（`src/features/novel/store.ts` 里的常量） */
export const LEGACY_NOVEL_DB = 'OCStudioNovels'
export const LEGACY_NOVEL_TABLE = 'novels'

/**
 * 读取 fork 的小说库；不存在或打不开时返回空数组（绝不抛）。
 * 注意：这里**只读**，不删除、不清空。
 */
export async function readLegacyNovels(): Promise<LegacyNovel[]> {
  if (typeof indexedDB === 'undefined') return []
  const exists = await Promise.resolve(
    typeof indexedDB.databases === 'function'
      ? indexedDB.databases().then((list) => list.some((db) => db.name === LEGACY_NOVEL_DB))
      : true,
  )
  if (!exists) return []

  const { default: Dexie } = await import('dexie')
  const legacy = new Dexie(LEGACY_NOVEL_DB)
  legacy.version(1).stores({ [LEGACY_NOVEL_TABLE]: '++id,updatedAt' })
  try {
    const rows = (await legacy.table(LEGACY_NOVEL_TABLE).toArray()) as LegacyNovel[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  } finally {
    legacy.close()
  }
}
