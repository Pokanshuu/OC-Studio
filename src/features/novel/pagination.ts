/**
 * 分页（W2 最后一块）：把章节文本排成一页一页。
 *
 * 只做**估算排版**，不做真排版：目标是「写作时能看出大概几页」，
 * 不是所见即所得的印刷稿（`docs/小说.md` §5：版式交给导出目标）。
 *
 * 三种页面比例与 fork 一致：9:16（手机/竖版）、16:9（横版）、A4（打印）。
 * 单位是 CSS px；字号 16、行高 1.9、页边距 64，和阅读界面同一观感。
 */
import type { NovelExportChapter } from './export'

export type NovelPageFormat = '9:16' | '16:9' | 'A4'

export interface NovelPageSize {
  /** 版心尺寸（不含页边距） */
  width: number
  height: number
  label: string
}

export const PAGE_MARGIN = 56
export const PAGE_FONT_SIZE = 16
export const PAGE_LINE_HEIGHT = 1.9

export const PAGE_SIZES: Record<NovelPageFormat, NovelPageSize> = {
  '9:16': { width: 720, height: 1280, label: '竖版 9:16' },
  '16:9': { width: 1280, height: 720, label: '横版 16:9' },
  A4: { width: 794, height: 1123, label: 'A4' },
}

export interface NovelPage {
  /** 第几页（从 1 开始，整本书连续编号） */
  index: number
  /** 这一页从哪一章开始（跨页的章会重复自己的标题只在首页显示） */
  chapterTitle: string
  /** 行（已按版心宽度折断） */
  lines: string[]
  /** 这一页是不是某章的第一页（决定要不要显示章标题） */
  startsChapter: boolean
}

/** 一页能放多少行 */
export function linesPerPage(format: NovelPageFormat): number {
  const size = PAGE_SIZES[format]
  const contentHeight = size.height - PAGE_MARGIN * 2
  return Math.max(1, Math.floor(contentHeight / (PAGE_FONT_SIZE * PAGE_LINE_HEIGHT)))
}

/** 一行能放多少字（中文按 1em 宽估，英文按 0.55em 粗估） */
export function charsPerLine(format: NovelPageFormat): number {
  const size = PAGE_SIZES[format]
  const contentWidth = size.width - PAGE_MARGIN * 2
  return Math.max(8, Math.floor(contentWidth / PAGE_FONT_SIZE))
}

/** 宽字符（CJK / 全角标点）算 1，其它算 0.55 —— 混排时行不会溢出太多 */
function charWidth(char: string): number {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]/.test(char) ? 1 : 0.55
}

/** 按宽度把一段文字折成多行（不切断英文单词） */
export function wrapText(text: string, format: NovelPageFormat): string[] {
  const limit = charsPerLine(format)
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

/**
 * 整本书 → 页序列。
 *
 * - 每章从新的一页开始（章里第一个字落在新页）
 * - 章标题占 2 行的高度（标题 + 空行）
 * - 空章节也占一页（否则导出后章节会消失）
 */
export function paginateNovel(chapters: NovelExportChapter[], format: NovelPageFormat): NovelPage[] {
  const capacity = linesPerPage(format)
  const pages: NovelPage[] = []
  let chapterStartLine = 1

  for (const chapter of chapters) {
    const bodyLines = chapter.text
      .split(/\n{2,}/)
      .flatMap((block) => {
        const wrapped = wrapText(block.trim(), format)
        return block.trim().length > 0 ? [...wrapped, ''] : []
      })

    // 标题占两行容量
    const lines: string[] = []
    let remaining = capacity - 2
    let index = 0
    let first = true

    const pushPage = () => {
      pages.push({
        index: chapterStartLine,
        chapterTitle: chapter.title,
        lines: [...lines],
        startsChapter: first,
      })
      chapterStartLine += 1
      first = false
      lines.length = 0
      remaining = capacity
    }

    if (bodyLines.length === 0) {
      // 空章：只占一页（标题）
      pushPage()
      continue
    }

    for (const line of bodyLines) {
      if (remaining <= 0) pushPage()
      lines.push(line)
      remaining -= 1
      index += 1
    }
    if (lines.length > 0) pushPage()
    void index
  }

  return pages
}

/** 整本书大概几页 */
export function countPages(chapters: NovelExportChapter[], format: NovelPageFormat): number {
  return paginateNovel(chapters, format).length
}
