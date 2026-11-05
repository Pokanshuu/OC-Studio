/**
 * 小说版面版式（导出中心的「版式」一栏）—— **唯一源**。
 *
 * 四套预设 + 六个可单独微调的参数。这里只放**版式数值与字体栈**，
 * 不碰分页（`pagination.ts`）也不碰渲染（`render-pages.ts` / `NovelReader`）：
 * 三个消费者都从这里取同一份参数，预览与导出的 PNG 才可能一致。
 *
 * 字体栈写在这里而不是 CSS：Canvas 的 `ctx.font` 只认字体栈字符串，
 * 预览侧用同一个字符串喂 `fontFamily`，两边才是同一款字。
 */

import {
  PAGE_FONT_SIZE,
  PAGE_LINE_HEIGHT,
  PAGE_MARGIN,
  type NovelPageFormat,
  type NovelLayoutOverrides,
  type NovelBookMeta,
} from './pagination'

export type NovelFontKind = 'song' | 'hei' | 'kai'

export const NOVEL_FONTS: Record<NovelFontKind, { label: string; stack: string }> = {
  song: { label: '宋体', stack: "'Noto Serif SC', 'Songti SC', 'SimSun', serif" },
  hei: { label: '黑体', stack: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  kai: { label: '楷体', stack: "'Kaiti SC', 'KaiTi', 'STKaiti', serif" },
}

export const NOVEL_FONT_OPTIONS = (Object.keys(NOVEL_FONTS) as NovelFontKind[]).map((value) => ({
  value,
  label: NOVEL_FONTS[value].label,
}))

/** 章首标题的样子 */
export type NovelTitleStyle = 'center' | 'left' | 'minimal'

export const NOVEL_TITLE_OPTIONS: ReadonlyArray<{ value: NovelTitleStyle; label: string }> = [
  { value: 'center', label: '居中' },
  { value: 'left', label: '左对齐' },
  { value: 'minimal', label: '小标题' },
]

/** 页码位置 */
export type NovelPageNumber = 'none' | 'right' | 'center'

export const NOVEL_PAGE_NUMBER_OPTIONS: ReadonlyArray<{ value: NovelPageNumber; label: string }> = [
  { value: 'none', label: '不显示' },
  { value: 'right', label: '右下' },
  { value: 'center', label: '居中' },
]

export interface NovelLayoutParams {
  font: NovelFontKind
  fontSize: number
  lineHeight: number
  margin: number
  titleStyle: NovelTitleStyle
  pageNumber: NovelPageNumber
  /** 每章从新的一页开始 */
  chapterBreak: boolean
  /** 正文前加一页扉页（书名 / 作者 / 简介） */
  titlePage: boolean
}

export const DEFAULT_NOVEL_LAYOUT: NovelLayoutParams = {
  font: 'song',
  fontSize: PAGE_FONT_SIZE,
  lineHeight: PAGE_LINE_HEIGHT,
  margin: PAGE_MARGIN,
  titleStyle: 'center',
  pageNumber: 'right',
  chapterBreak: true,
  titlePage: false,
}

export type NovelLayoutPresetId = 'book' | 'chapter' | 'minimal' | 'letter'

export interface NovelLayoutPreset {
  id: NovelLayoutPresetId
  label: string
  /** 界面上的一句提示（≤ 20 字） */
  hint: string
  params: NovelLayoutParams
}

/**
 * 四套版式：
 * - 书页：最稳的投稿版式（宋体、居中章首、右下页码）
 * - 章首：大页边距 + 左对齐章首 + 扉页，像一本正式出版的书
 * - 极简：黑体小字、窄边距、章不另起页、无页码 —— 网文 / 长读
 * - 信笺：楷体、宽行距、页码居中，气质最软
 */
export const NOVEL_LAYOUT_PRESETS: readonly NovelLayoutPreset[] = [
  {
    id: 'book',
    label: '书页',
    hint: '宋体 · 章首居中',
    params: DEFAULT_NOVEL_LAYOUT,
  },
  {
    id: 'chapter',
    label: '章首',
    hint: '宽边距 · 带扉页',
    params: {
      font: 'song',
      fontSize: 17,
      lineHeight: 2,
      margin: 72,
      titleStyle: 'left',
      pageNumber: 'center',
      chapterBreak: true,
      titlePage: true,
    },
  },
  {
    id: 'minimal',
    label: '极简',
    hint: '黑体 · 章节连排',
    params: {
      font: 'hei',
      fontSize: 15,
      lineHeight: 1.8,
      margin: 44,
      titleStyle: 'minimal',
      pageNumber: 'none',
      chapterBreak: false,
      titlePage: false,
    },
  },
  {
    id: 'letter',
    label: '信笺',
    hint: '楷体 · 宽行距',
    params: {
      font: 'kai',
      fontSize: 17,
      lineHeight: 2.2,
      margin: 64,
      titleStyle: 'center',
      pageNumber: 'center',
      chapterBreak: true,
      titlePage: false,
    },
  },
]

export const NOVEL_LAYOUT_OPTIONS = NOVEL_LAYOUT_PRESETS.map(({ id, label }) => ({ value: id, label }))

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 收敛参数：未知字体 / 越界数值一律回到默认，界面拖不出乱版 */
export function normalizeNovelLayout(input?: Partial<NovelLayoutParams> | null): NovelLayoutParams {
  const source = input ?? {}
  const font: NovelFontKind =
    source.font === 'hei' || source.font === 'kai' || source.font === 'song' ? source.font : DEFAULT_NOVEL_LAYOUT.font
  const titleStyle: NovelTitleStyle =
    source.titleStyle === 'left' || source.titleStyle === 'minimal' || source.titleStyle === 'center'
      ? source.titleStyle
      : DEFAULT_NOVEL_LAYOUT.titleStyle
  const pageNumber: NovelPageNumber =
    source.pageNumber === 'none' || source.pageNumber === 'center' || source.pageNumber === 'right'
      ? source.pageNumber
      : DEFAULT_NOVEL_LAYOUT.pageNumber
  return {
    font,
    fontSize: clamp(source.fontSize ?? DEFAULT_NOVEL_LAYOUT.fontSize, 12, 22),
    lineHeight: clamp(source.lineHeight ?? DEFAULT_NOVEL_LAYOUT.lineHeight, 1.4, 2.6),
    margin: clamp(source.margin ?? DEFAULT_NOVEL_LAYOUT.margin, 24, 96),
    titleStyle,
    pageNumber,
    chapterBreak: source.chapterBreak ?? DEFAULT_NOVEL_LAYOUT.chapterBreak,
    titlePage: source.titlePage ?? DEFAULT_NOVEL_LAYOUT.titlePage,
  }
}

/** 当前参数正好等于哪套预设（界面上高亮用；都不等就返回 null） */
export function presetIdOf(layout: NovelLayoutParams): NovelLayoutPresetId | null {
  for (const preset of NOVEL_LAYOUT_PRESETS) {
    const keys = Object.keys(preset.params) as Array<keyof NovelLayoutParams>
    if (keys.every((key) => preset.params[key] === layout[key])) return preset.id
  }
  return null
}

/** 版式参数 → 分页参数（纸张与作品信息只有面板知道，所以由调用方补齐） */
export function toPaginateOptions(
  layout: NovelLayoutParams,
  format: NovelPageFormat,
  meta?: NovelBookMeta,
): NovelLayoutOverrides {
  return {
    format,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    margin: layout.margin,
    chapterBreak: layout.chapterBreak,
    titlePage: layout.titlePage,
    meta,
  }
}

/** 章首标题的字号（两种渲染器共用这个比例） */
export function titleFontSize(layout: NovelLayoutParams): number {
  return Math.round(layout.fontSize * (layout.titleStyle === 'minimal' ? 1.18 : 1.45))
}

/** 扉页书名 / 作者的字号 */
export function titlePageFontSize(layout: NovelLayoutParams): { title: number; author: number; synopsis: number } {
  return {
    title: Math.round(layout.fontSize * 2.1),
    author: Math.round(layout.fontSize * 1.05),
    synopsis: Math.round(layout.fontSize * 0.9),
  }
}
