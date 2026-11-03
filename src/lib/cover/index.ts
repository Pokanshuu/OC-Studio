/**
 * 封面卡 —— 唯一对外边界。
 *
 * 算法与版式照搬 Simple_Cover（`js/engine.js` + `styles.css`）：照片下缘做成
 * 「渐进模糊 → 完全混色」的色块，标题与简介落在色块里（标题压在模糊区上）。
 * 与参考实现的差别只有两处：
 *   1. 文字由 DOM 画，不烧进画布 —— 可以选中、可以用字体令牌、换字号不糊；
 *   2. 所有版式数字都可调，见 `tuning.ts` 的调试面板。
 */

import { stripHtml } from '@/lib/utils'

export {
  DEFAULT_TINT,
  INK_TINT,
  NEUTRAL_TINT,
  darken,
  hexToRgb,
  hslToHex,
  lighten,
  mixColor,
  normalizeTint,
  rgbToHex,
  rgbToHsl,
  rgba,
  tintFromPixels,
} from './color'
export { progressiveBlur } from './blur'
export { COVER_ASPECT, renderCover, sampleTint } from './scene'
export type { CoverImage, CoverRenderOptions, CoverSceneOptions } from './scene'
export { enqueueCoverRender } from './queue'
export { loadCoverImage } from './image-cache'
export {
  COVER_ASPECT_OPTIONS,
  COVER_TINT_MODE_OPTIONS,
  COVER_TUNING_DEFAULTS,
  COVER_TUNING_RANGES,
  coverTuningJson,
  getCoverTuning,
  resetCoverTuning,
  sanitizeCoverTuning,
  setCoverTuningPanelOpen,
  toggleCoverTuningPanel,
  updateCoverTuning,
  useCoverTuning,
  useCoverTuningPanelOpen,
} from './tuning'
export type { CoverSliderKey, CoverTintMode, CoverTuning, CoverTuningRange } from './tuning'

/**
 * 卡片上的那行小字：去掉标记、压平空白、按字符数截断。
 * 视觉上还有 `line-clamp`，这里只是别把整段正文塞进 DOM。
 */
export function coverExcerpt(value: string | undefined | null, maxLength = 96): string {
  if (!value) return ''
  const text = stripHtml(value).replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}
