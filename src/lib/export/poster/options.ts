/**
 * 海报选项的**唯一校验入口**。
 *
 * 来源有三种：localStorage 的会话选项、`.ocstudio/exports.json` 的命名预设、
 * 手改过的 JSON。一律先过这里，非法值回默认，不让界面落进「没有这个版式 /
 * 背景不存在」的状态。
 */
import type { TemplateComponentId, TemplateDoc } from '@/lib/templates/types'
import {
  DEFAULT_POSTER_OPTIONS,
  DEFAULT_POSTER_BLOCK_ORDER,
  POSTER_BACKGROUND_LABELS,
  POSTER_COVER_ZOOM_MAX,
  POSTER_COVER_ZOOM_MIN,
  POSTER_PADDING_IDS,
  POSTER_RATIO_IDS,
  POSTER_TEMPLATE_IDS,
  normalizeBlockOrder,
  type PosterAlign,
  type PosterBackground,
  type PosterCoverPlacement,
  type PosterOptions,
  type PosterRatio,
  type PosterBlockId,
  type PosterTemplateId,
} from './types'

const COVER_PLACEMENTS: PosterCoverPlacement[] = ['auto', 'top', 'left', 'right', 'background', 'hidden']
const ALIGNS: PosterAlign[] = ['auto', 'left', 'center', 'right']

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

export function isPosterTemplateId(value: unknown): value is PosterTemplateId {
  return typeof value === 'string' && (POSTER_TEMPLATE_IDS as string[]).includes(value)
}

/** 海报主体 → 编辑器模板 id（自建分类 / 宠物 / 武器都落在词条模板上） */
const TEMPLATE_ID_BY_SUBJECT: Record<'character' | 'event' | 'country' | 'world', string> = {
  character: 'character',
  event: 'event',
  country: 'country',
  world: 'entry',
}

/**
 * 模板组件 → 海报正文块（立绘 / 图片都并进海报的「画廊」）。
 *
 * 时间 / 地点不在这里：它们已经并回「基本信息」（`info` → `fields`），
 * 海报的时间 / 地点块由 `PosterInfoHints` 单独决定（见下）。
 */
const POSTER_BLOCK_BY_COMPONENT: Partial<Record<TemplateComponentId, PosterBlockId>> = {
  info: 'fields',
  tags: 'tags',
  summary: 'summary',
  body: 'body',
  relations: 'relations',
  gallery: 'gallery',
  portrait: 'gallery',
  image: 'gallery',
}

/**
 * 海报的**默认选项**从编辑器模板来：开关 / 正文块顺序与编辑器一致。
 *
 * 只在用户还没保存过海报选项时使用（见 `PosterPanel`）。之后用户在导出面板改的
 * 一切以导出配置为准 —— 海报是成品图，排版参数不该被模板反复改回去。
 * 只映射海报真实有的块；模板里没有的组件（封面 / 头像等）按海报自己的版式走。
 */
/**
 * 基本信息里有没有时间 / 地点的行。
 *
 * 事件看字段表（`lib/fields`），词条看基本信息组件的字段类型（`InfoGroup.types`）——
 * 这两个数据源都在调用方手里（`PosterPanel`），这里不 import 存储层：脚本里也能调。
 */
export interface PosterInfoHints {
  time: boolean
  location: boolean
}

export function posterTemplateDefaults(
  kind: 'character' | 'event' | 'country' | 'world',
  templates: readonly TemplateDoc[] | undefined,
  hints?: PosterInfoHints,
): Partial<PosterOptions> {
  const doc = templates?.find((item) => item.id === TEMPLATE_ID_BY_SUBJECT[kind])
  if (doc === undefined) return {}
  const enabled = new Set(
    doc.components.filter((component) => component.enabled).map((component) => component.id),
  )
  const order: PosterBlockId[] = []
  for (const component of doc.components) {
    if (!component.enabled) continue
    const block = POSTER_BLOCK_BY_COMPONENT[component.id]
    if (block !== undefined && !order.includes(block)) order.push(block)
  }
  const hasBlock = (block: PosterBlockId): boolean => order.includes(block)
  // 时间 / 地点是基本信息里的行：基本信息不开，它们也没有入口
  const infoEnabled = enabled.has('info')
  return {
    showFields: hasBlock('fields') && infoEnabled,
    showTags: hasBlock('tags') && enabled.has('tags'),
    showTime: infoEnabled && hints?.time === true,
    showLocation: infoEnabled && hints?.location === true,
    showSummary: hasBlock('summary') && enabled.has('summary'),
    showBody: hasBlock('body') && enabled.has('body'),
    showRelations: hasBlock('relations') && enabled.has('relations'),
    showGallery: hasBlock('gallery') && (enabled.has('gallery') || enabled.has('portrait') || enabled.has('image')),
    showCover: enabled.has('cover') || enabled.has('avatar'),
    ...(order.length > 0 ? { blockOrder: order } : {}),
  }
}

export function normalizePosterOptions(value: unknown): PosterOptions {
  const fallback = DEFAULT_POSTER_OPTIONS
  if (value === null || typeof value !== 'object') return { ...fallback, blockOrder: [...DEFAULT_POSTER_BLOCK_ORDER] }
  const record = value as Partial<PosterOptions> & Record<string, unknown>

  return {
    template: isPosterTemplateId(record.template) ? record.template : fallback.template,
    ratio: oneOf<PosterRatio>(record.ratio, POSTER_RATIO_IDS, fallback.ratio),
    background: oneOf<PosterBackground>(
      record.background,
      Object.keys(POSTER_BACKGROUND_LABELS) as PosterBackground[],
      fallback.background,
    ),
    padding: oneOf(record.padding, POSTER_PADDING_IDS, fallback.padding),
    fontScale: numberIn(record.fontScale, 0.7, 1.5, fallback.fontScale),
    titleScale: numberIn(record.titleScale, 0.8, 1.4, fallback.titleScale),
    coverPlacement: oneOf<PosterCoverPlacement>(record.coverPlacement, COVER_PLACEMENTS, fallback.coverPlacement),
    coverScale: numberIn(record.coverScale, 0.7, 1.3, fallback.coverScale),
    coverZoom: numberIn(record.coverZoom, POSTER_COVER_ZOOM_MIN, POSTER_COVER_ZOOM_MAX, fallback.coverZoom),
    coverX: numberIn(record.coverX, 0, 100, fallback.coverX),
    coverY: numberIn(record.coverY, 0, 100, fallback.coverY),
    align: oneOf<PosterAlign>(record.align, ALIGNS, fallback.align),
    fieldColumns: record.fieldColumns === 1 || record.fieldColumns === 2 ? record.fieldColumns : fallback.fieldColumns,
    blockOrder: normalizeBlockOrder(record.blockOrder),
    showCover: record.showCover !== false,
    showFields: record.showFields !== false,
    showTags: record.showTags !== false,
    showRelations: record.showRelations === true,
    showGallery: record.showGallery === true,
    showTime: record.showTime !== false,
    showLocation: record.showLocation !== false,
    showSummary: record.showSummary !== false,
    showBody: record.showBody !== false,
    showAliases: record.showAliases === true,
    showSignature: record.showSignature !== false,
    signature:
      typeof record.signature === 'string' && record.signature.trim() !== ''
        ? record.signature.slice(0, 40)
        : fallback.signature,
  }
}

/** 版式切换时的「合理起点」：夜色默认墨底，其它回纸底；用户之后仍可改。 */
export function optionsForTemplate(current: PosterOptions, template: PosterTemplateId): PosterOptions {
  if (template === current.template) return current
  if (template === 'noir' && current.background === 'paper') {
    return { ...current, template, background: 'ink' }
  }
  if (current.template === 'noir' && current.background === 'ink') {
    return { ...current, template, background: 'paper' }
  }
  return { ...current, template }
}

/** 移到上 / 下一位；越界原样返回。 */
export function moveBlock(order: PosterOptions['blockOrder'], id: PosterOptions['blockOrder'][number], delta: -1 | 1): PosterOptions['blockOrder'] {
  const next = [...order]
  const index = next.indexOf(id)
  if (index === -1) return next
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
