/**
 * 海报选项的**唯一校验入口**。
 *
 * 来源有三种：localStorage 的会话选项、`.ocstudio/exports.json` 的命名预设、
 * 手改过的 JSON。一律先过这里，非法值回默认，不让界面落进「没有这个版式 /
 * 背景不存在」的状态。
 */
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
