/**
 * 海报导出的**唯一契约**。
 *
 * 六套版式（`PosterTemplateId`）只是同一份数据的不同排法：模板拿到的永远是
 * 结构化的 `PosterData` + `PosterOptions`，不自己读 IndexedDB、不自己拼图片路径。
 * 这样「只导出某几个组件」只需要在 options 上关掉对应开关，六套版式同时生效。
 *
 * 画布固定 1080px 宽，高度由 `POSTER_RATIOS` 给出；模板根节点必须**正好**占满
 * `width × height`，超出内容自己裁掉（海报不是文档，不滚动）。
 */
import type { ComponentType } from 'react'

export type PosterTemplateId = 'editorial' | 'noir' | 'archive' | 'frame' | 'mono' | 'split'

export const POSTER_TEMPLATE_IDS: PosterTemplateId[] = [
  'editorial',
  'noir',
  'archive',
  'frame',
  'mono',
  'split',
]

export type PosterRatio = 'card' | 'square' | 'portrait' | 'wide'
export type PosterPadding = 'compact' | 'standard' | 'loose'

/** 背景层：纸色 / 透明 / 墨色 / 网格纸 / 渐变 / 封面模糊 */
export type PosterBackground = 'paper' | 'transparent' | 'ink' | 'grid' | 'gradient' | 'cover'

/** 海报上的文字色：纸底用墨字，墨底用纸字。由 `posterTone()` 统一算。 */
export type PosterTone = 'paper' | 'ink'

/**
 * 封面落在哪：`auto` = 版式原本的位置；其余是用户的显式覆盖。
 * 版式通过 `PosterTemplateMeta.coverPlacements` 声明自己支持哪些；
 * 不支持时由版式退化成最接近的一种，UI 不会展示不支持的值。
 */
export type PosterCoverPlacement = 'auto' | 'top' | 'left' | 'right' | 'background' | 'hidden'

/** 正文流的块。标题 / 封面 / 别名 / 署名是版式锚点，不参与排序。 */
export type PosterBlockId =
  | 'fields'
  | 'tags'
  | 'time'
  | 'location'
  | 'summary'
  | 'body'
  | 'relations'
  | 'gallery'

export const POSTER_BLOCK_IDS: PosterBlockId[] = [
  'fields',
  'tags',
  'time',
  'location',
  'summary',
  'body',
  'relations',
  'gallery',
]

export const POSTER_BLOCK_LABELS: Record<PosterBlockId, string> = {
  fields: '基本信息',
  tags: '标签',
  time: '时间',
  location: '地点',
  summary: '简介',
  body: '正文',
  relations: '关系',
  gallery: '画廊',
}

/** 默认正文流顺序（版式可以有自己的默认，但用户改过之后一律按用户的来） */
export const DEFAULT_POSTER_BLOCK_ORDER: PosterBlockId[] = [...POSTER_BLOCK_IDS]

export type PosterAlign = 'auto' | 'left' | 'center' | 'right'
export type PosterFieldColumns = 'auto' | 1 | 2

export interface PosterField {
  label: string
  value: string
}

/** 关系一行：`label` 是对方名字，`value` 是关系名 */
export interface PosterRelation {
  label: string
  value: string
}

/**
 * 一张海报能拿到的全部内容。**每个字段都可能是空的** ——
 * 用户可能只勾了「封面 + 名称」，版式必须在缺块时仍然好看。
 */
export interface PosterData {
  /** 主标题（角色名 / 事件名 / 词条名） */
  title: string
  /** 别名 / 副标题（角色别名、事件时间、国家体制…） */
  subtitle: string
  /** 题头小字（角色 / 事件 / 国家 / 词条 / 分类） */
  kindLabel: string
  /** 套用的模板名（署名区用） */
  templateName: string
  /** 档案版式用的编号（`NO. 003`），由对象 id 派生 */
  serial?: string
  cover?: string
  aliases: string[]
  fields: PosterField[]
  tags: string[]
  summary: string
  body: string
  relations: PosterRelation[]
  gallery: string[]
  time: string
  location: string
}

export interface PosterOptions {
  template: PosterTemplateId
  ratio: PosterRatio
  background: PosterBackground
  padding: PosterPadding
  /** 字号缩放：模板的 `em` 以 `16 × fontScale` 为基准 */
  fontScale: number
  /** 标题字号在版式默认值上的倍率（0.8–1.4） */
  titleScale: number
  /** 封面位置；`auto` = 版式自己的排法 */
  coverPlacement: PosterCoverPlacement
  /** 封面**遮罩**在其区域里的占比倍率（0.7–1.3）；改的是框，不是图 */
  coverScale: number
  /** 图片在遮罩里的缩放（1–3）；遮罩不动，只有图片变大 */
  coverZoom: number
  /** 取景中心：0 = 看图片左边，100 = 看右边（等价于 `object-position`） */
  coverX: number
  /** 取景中心：0 = 看图片上缘，100 = 看下缘 */
  coverY: number
  /** 文字对齐；`auto` = 版式自己的排法 */
  align: PosterAlign
  /** 基本信息列数；`auto` = 版式自己的排法 */
  fieldColumns: PosterFieldColumns
  /** 正文流顺序：用户拖动 / 上下移动后写回 */
  blockOrder: PosterBlockId[]
  showCover: boolean
  showFields: boolean
  showTags: boolean
  showRelations: boolean
  showGallery: boolean
  showTime: boolean
  showLocation: boolean
  showSummary: boolean
  showBody: boolean
  showAliases: boolean
  showSignature: boolean
  /** 署名文字；空 = 不打印 */
  signature: string
}

export interface PosterRatioMeta {
  label: string
  hint: string
  width: number
  height: number
}

export const POSTER_RATIOS: Record<PosterRatio, PosterRatioMeta> = {
  card: { label: '角色卡', hint: '3 : 4', width: 1080, height: 1440 },
  square: { label: '方卡', hint: '1 : 1', width: 1080, height: 1080 },
  portrait: { label: '竖版', hint: '9 : 16', width: 1080, height: 1920 },
  wide: { label: '横幅', hint: '16 : 9', width: 1080, height: 608 },
}

/** 外留白（1080 宽下的像素）；模板内部仍可再留自己的呼吸区。 */
export const POSTER_PADDING: Record<PosterPadding, number> = {
  compact: 40,
  standard: 68,
  loose: 96,
}

/**
 * 版式的基准字号：模板把根节点设成 `POSTER_BASE_FONT_SIZE × fontScale`，
 * 所有内部尺寸用 `em`。24px 是「1080 宽的海报上正文仍读得清」的下限 ——
 * 16px 在缩到 40% 的预览里只剩 6px，谁也看不清。
 */
export const POSTER_BASE_FONT_SIZE = 24

export const POSTER_RATIO_IDS: PosterRatio[] = ['card', 'square', 'portrait', 'wide']
export const POSTER_PADDING_IDS: PosterPadding[] = ['compact', 'standard', 'loose']

/** 图片取景的取值范围。取景是三个数字，不是任意坐标 —— 版式的构图不能散。 */
export const POSTER_COVER_ZOOM_MIN = 1
export const POSTER_COVER_ZOOM_MAX = 3
export const POSTER_COVER_POSITION_CENTER = 50

export const POSTER_BACKGROUND_LABELS: Record<PosterBackground, string> = {
  paper: '纸色',
  transparent: '透明',
  ink: '墨色',
  grid: '网格纸',
  gradient: '渐变',
  cover: '封面模糊',
}

export const DEFAULT_POSTER_OPTIONS: PosterOptions = {
  template: 'editorial',
  ratio: 'card',
  background: 'paper',
  padding: 'standard',
  fontScale: 1,
  titleScale: 1,
  coverPlacement: 'auto',
  coverScale: 1,
  coverZoom: 1,
  coverX: POSTER_COVER_POSITION_CENTER,
  coverY: POSTER_COVER_POSITION_CENTER,
  align: 'auto',
  fieldColumns: 'auto',
  blockOrder: [...DEFAULT_POSTER_BLOCK_ORDER],
  showCover: true,
  showFields: true,
  showTags: true,
  showRelations: false,
  showGallery: false,
  showTime: true,
  showLocation: true,
  showSummary: true,
  showBody: true,
  showAliases: false,
  showSignature: true,
  signature: 'OC Studio',
}

/** 内容开关与 block id 的对应关系（正文流用）。 */
export const POSTER_BLOCK_SWITCH: Record<PosterBlockId, keyof PosterOptions> = {
  fields: 'showFields',
  tags: 'showTags',
  time: 'showTime',
  location: 'showLocation',
  summary: 'showSummary',
  body: 'showBody',
  relations: 'showRelations',
  gallery: 'showGallery',
}

/** 把用户的 `blockOrder` 补全 / 去重，保证 8 个块都恰好出现一次。 */
export function normalizeBlockOrder(order: readonly PosterBlockId[] | undefined): PosterBlockId[] {
  const seen = new Set<PosterBlockId>()
  const next: PosterBlockId[] = []
  for (const id of order ?? []) {
    if (POSTER_BLOCK_IDS.includes(id) && !seen.has(id)) {
      seen.add(id)
      next.push(id)
    }
  }
  for (const id of POSTER_BLOCK_IDS) {
    if (!seen.has(id)) next.push(id)
  }
  return next
}

/** 当前启用的正文块，按用户顺序。 */
export function enabledPosterBlocks(options: PosterOptions): PosterBlockId[] {
  return normalizeBlockOrder(options.blockOrder).filter(
    (id) => options[POSTER_BLOCK_SWITCH[id]] !== false,
  )
}

/** 用户是否动过图片取景（用于显示「复位」）。 */
export function hasCustomCoverFraming(
  options: Pick<PosterOptions, 'coverZoom' | 'coverX' | 'coverY'>,
): boolean {
  return (
    Math.abs(options.coverZoom - 1) > 0.001 ||
    Math.abs(options.coverX - POSTER_COVER_POSITION_CENTER) > 0.5 ||
    Math.abs(options.coverY - POSTER_COVER_POSITION_CENTER) > 0.5
  )
}

/** 解析对齐：`auto` 用版式自己的默认值。 */
export function resolvePosterAlign(align: PosterAlign, fallback: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  return align === 'auto' ? fallback : align
}

/** 解析列数：`auto` 用版式自己的默认值。 */
export function resolveFieldColumns(columns: PosterFieldColumns, fallback: 1 | 2): 1 | 2 {
  return columns === 'auto' ? fallback : columns
}

/** 模板组件拿到的 props；`width / height` 就是画布尺寸（1080 宽）。 */
export interface PosterTemplateProps {
  data: PosterData
  options: PosterOptions
  width: number
  height: number
  tone: PosterTone
  /** frontmatter 里的图片路径 → 浏览器可渲染的 URL */
  image: (src: string) => string
}

export interface PosterTemplateMeta {
  id: PosterTemplateId
  /** 版式名（导出中心里给人看） */
  name: string
  /** 一句观感，≤ 8 字 */
  hint: string
  /**
   * 固定色调。`ink` = 深底浅字（夜色）；不填则跟随背景：
   * 背景是墨色时用浅字，其余用墨字。
   */
  tone?: PosterTone
  /** 版式支持的封面位置（第一个是 `auto` 时的实际位置）。 */
  coverPlacements: PosterCoverPlacement[]
  /** 文字对齐的版式默认值（用户选 `auto` 时生效）。 */
  defaultAlign: 'left' | 'center' | 'right'
  /** 基本信息列数的版式默认值（用户选 `auto` 时生效）。 */
  defaultFieldColumns: 1 | 2
  component: ComponentType<PosterTemplateProps>
}

/** 背景 → 文字色。模板不要自己猜，一律用这个结果。 */
export function posterTone(
  meta: Pick<PosterTemplateMeta, 'tone'>,
  options: Pick<PosterOptions, 'background'>,
): PosterTone {
  if (meta.tone) return meta.tone
  return options.background === 'ink' ? 'ink' : 'paper'
}
