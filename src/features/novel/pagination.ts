/**
 * 分页：把章节文本排成一页一页。
 *
 * 只做**估算排版**，不做真排版：目标是「写作时能看出大概几页」，
 * 不是所见即所得的印刷稿（`docs/小说.md` §5：版式交给导出目标）。
 *
 * 三种页面比例与 fork 一致：9:16（手机/竖版）、16:9（横版）、A4（打印）。
 * 单位是 CSS px。
 *
 * **一页 = 一串「行」**（`NovelRow`），不是一串纯文本：章首标题、正文行、段间空行
 * 都要参与占位计算。以前只有 `lines: string[]` + `startsChapter`，只能表达「标题在页首」，
 * 于是「每章另起一页」被写死 —— 关掉它，mid-page 的章首标题就没地方画。行模型两种都能画，
 * 而且 DOM 预览（`NovelReader`）与 PNG 导出（`render-pages`）走的是**同一份行**，
 * 只负责把同样的行画在同一组 y 上。
 *
 * 版式参数（字号 / 行距 / 页边距 / 每章另起 / 扉页）由 `layout.ts` 的预设提供，
 * 传字符串（`'9:16'`）就是全套默认值。
 */
import type { NovelExportChapter } from './export'

export type NovelPageFormat = '9:16' | '16:9' | 'A4'

export interface NovelPageSize {
  /** 纸张尺寸（含页边距） */
  width: number
  height: number
  label: string
}

/** 默认页边距（版式参数没给时用它） */
export const PAGE_MARGIN = 56
export const PAGE_FONT_SIZE = 16
export const PAGE_LINE_HEIGHT = 1.9
/** 章首标题固定占两行的容量 —— 两种渲染器都按这个让位 */
export const TITLE_LINES = 2

export const PAGE_SIZES: Record<NovelPageFormat, NovelPageSize> = {
  '9:16': { width: 720, height: 1280, label: '竖版 9:16' },
  '16:9': { width: 1280, height: 720, label: '横版 16:9' },
  A4: { width: 794, height: 1123, label: 'A4' },
}

/** 一行：正文 / 空行 / 章首标题（标题占 `TITLE_LINES` 行） */
export type NovelRow =
  | { kind: 'text'; text: string }
  | { kind: 'gap' }
  | { kind: 'title'; text: string }

export interface NovelPage {
  /** 第几页（从 1 开始，整本书连续编号；扉页算第 1 页） */
  index: number
  /** 这一页正文属于哪一章（扉页是书名） */
  chapterTitle: string
  rows: NovelRow[]
  /** 这一页的第一行就是章首标题 */
  startsChapter: boolean
  /** 扉页：只画书名 / 作者 / 简介，没有正文行 */
  titlePage?: boolean
}

/** 作品信息（扉页、页眉用） */
export interface NovelBookMeta {
  title?: string
  author?: string
  synopsis?: string
}

/** 分页需要的版式参数（渲染参数在 `layout.ts`） */
export interface NovelPageLayout {
  format: NovelPageFormat
  fontSize: number
  lineHeight: number
  margin: number
  /** 每章从新的一页开始 */
  chapterBreak: boolean
  /** 正文前面加一页扉页 */
  titlePage: boolean
  meta?: NovelBookMeta
}

export interface NovelLayoutOverrides extends Partial<Omit<NovelPageLayout, 'format'>> {
  format?: NovelPageFormat
}

/** 传字符串 = 只指定纸张；传对象 = 叠加版式参数 */
export type NovelPaginateInput = NovelPageFormat | NovelLayoutOverrides

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 收敛成一个完整的分页参数（越界一律夹取，界面上拖不出乱版） */
export function resolvePageLayout(input?: NovelPaginateInput): NovelPageLayout {
  const options: NovelLayoutOverrides = typeof input === 'string' || input === undefined ? { format: input } : input
  const format = options.format ?? '9:16'
  return {
    format,
    fontSize: clamp(options.fontSize ?? PAGE_FONT_SIZE, 10, 40),
    lineHeight: clamp(options.lineHeight ?? PAGE_LINE_HEIGHT, 1.2, 3),
    margin: clamp(options.margin ?? PAGE_MARGIN, 0, 180),
    chapterBreak: options.chapterBreak ?? true,
    titlePage: options.titlePage ?? false,
    meta: options.meta,
  }
}

/** 一页能放多少行 */
export function linesPerPage(input?: NovelPaginateInput): number {
  const layout = resolvePageLayout(input)
  const size = PAGE_SIZES[layout.format]
  const contentHeight = size.height - layout.margin * 2
  return Math.max(1, Math.floor(contentHeight / (layout.fontSize * layout.lineHeight)))
}

/** 一行能放多少字（中文按 1em 宽估，英文按 0.55em 粗估） */
export function charsPerLine(input?: NovelPaginateInput): number {
  const layout = resolvePageLayout(input)
  const size = PAGE_SIZES[layout.format]
  const contentWidth = size.width - layout.margin * 2
  return Math.max(8, Math.floor(contentWidth / layout.fontSize))
}

/** 宽字符（CJK / 全角标点）算 1，其它算 0.55 —— 混排时行不会溢出太多 */
function charWidth(char: string): number {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]/.test(char) ? 1 : 0.55
}

/** 按宽度把一段文字折成多行（不切断英文单词） */
export function wrapText(text: string, input?: NovelPaginateInput): string[] {
  const limit = charsPerLine(input)
  const lines: string[] = []
  for (const raw of text.split('\n')) {
    let line = ''
    let width = 0
    for (const char of raw) {
      const w = charWidth(char)
      if (width + w > limit && line.length > 0) {
        lines.push(line)
        line = ''
        width = 0
      }
      line += char
      width += w
    }
    lines.push(line)
  }
  return lines
}

/** 章节正文 → 行（空行 = 段落间隔；末尾的空行不要，避免标题前多一块空白） */
function chapterRows(chapter: NovelExportChapter, layout: NovelPageLayout): NovelRow[] {
  const rows: NovelRow[] = []
  for (const block of chapter.text.split(/\n{2,}/)) {
    const trimmed = block.trim()
    if (trimmed.length === 0) continue
    for (const line of wrapText(trimmed, layout)) rows.push({ kind: 'text', text: line })
    rows.push({ kind: 'gap' })
  }
  while (rows.length > 0 && rows[rows.length - 1].kind === 'gap') rows.pop()
  return rows
}

function rowCost(row: NovelRow): number {
  return row.kind === 'title' ? TITLE_LINES : 1
}

/**
 * 整本书 → 页序列。
 *
 * - 章标题占两行容量；标题落页底时整页下移（不会出现「标题孤零零在页脚」）
 * - `chapterBreak` 关闭时，章节接着上一页排，标题就画在当前页里
 * - 空章节也占一页（否则导出后章节会消失）
 * - `titlePage` 打开时第一页是扉页（书名 / 作者 / 简介）
 */
export function paginateNovel(chapters: NovelExportChapter[], input?: NovelPaginateInput): NovelPage[] {
  const layout = resolvePageLayout(input)
  const capacity = linesPerPage(layout)
  const pages: NovelPage[] = []

  let used = 0
  // 「下一行必须另起一页」—— 用标志而不是一个可变的「当前页」变量：
  // 它不会在闭包里被赋值，读的时候就不用 `!`（那个断言在 TS 里会被窄化成 never）
  let needNewPage = false

  const startPage = (chapterTitle: string, titlePage = false): NovelPage => {
    const page: NovelPage = {
      index: pages.length + 1,
      chapterTitle,
      rows: [],
      startsChapter: false,
      ...(titlePage ? { titlePage: true } : {}),
    }
    pages.push(page)
    used = 0
    needNewPage = false
    return page
  }

  const addRow = (row: NovelRow, chapterTitle: string): void => {
    const cost = rowCost(row)
    const page =
      pages.length === 0 || needNewPage || used + cost > capacity
        ? startPage(chapterTitle)
        : pages[pages.length - 1]
    page.rows.push(row)
    used += cost
  }

  if (layout.titlePage) {
    startPage(layout.meta?.title?.trim() || '扉页', true)
    needNewPage = true
  }

  for (const chapter of chapters) {
    const title = chapter.title.trim() || '未命名章节'
    const rows = chapterRows(chapter, layout)
    const last = pages.length === 0 ? null : pages[pages.length - 1]
    const pageHasBody = last !== null && last.rows.length > 0

    // 每章另起一页：把当前页掐掉（空的也掐，下一页从标题开始）
    if (layout.chapterBreak && pageHasBody) needNewPage = true

    if (rows.length === 0) {
      // 空章：自己占一页（标题行）
      if (pageHasBody) needNewPage = true
      addRow({ kind: 'title', text: title }, title)
      continue
    }

    // 章节接着上一页排时：标题前垫一行空行（贴着上一段会像正文的一部分）。
    // 页底只剩一两行时**直接换页** —— 标题占两行，落在页脚就是「标题孤零零」，
    // 而且下面没有正文，看起来像排版事故。
    if (pageHasBody && !needNewPage) {
      const remaining = capacity - used
      if (remaining >= TITLE_LINES + 2) addRow({ kind: 'gap' }, title)
      else if (remaining < TITLE_LINES + 1) needNewPage = true
    }
    addRow({ kind: 'title', text: title }, title)
    for (const row of rows) addRow(row, title)
  }

  for (const page of pages) page.startsChapter = page.rows[0]?.kind === 'title'
  return pages
}

/** 整本书大概几页 */
export function countPages(chapters: NovelExportChapter[], input?: NovelPaginateInput): number {
  return paginateNovel(chapters, input).length
}
