/**
 * 封面卡的画面合成 —— 参考实现 `paintScene` 的移植。
 *
 * 构图（全部由参数给出，默认值就是参考实现的数，见 `lib/cover/tuning.ts`）：
 *
 *   ┌──────────────────────────────┐
 *   │        照片（顶部贴齐）          │
 *   │    下缘逐行递增模糊 → 完全混色     │  ← 模糊从「模糊起点」开始
 *   ├──────────────────────────────┤  ← 照片在「照片高度」处彻底溶掉
 *   │  色块：标题 / 简介 / 一行小字      │  ← 由 DOM 画（不烧进画布）
 *   └──────────────────────────────┘
 *
 * 关键点：色块是画布底色，不是照片上盖的一层渐变遮罩 —— 所以它天然越过照片的
 * 左、右、下边界，文字才能落在实色区里，标题也才能压在模糊区上。
 */

import { INK_TINT, darken, lighten, luminance, rgba, tintFromPixels } from './color'
import { progressiveBlur } from './blur'

/** 画布比例：参考实现的 4:5 */
export const COVER_ASPECT = 4 / 5

/** 照片开始淡出（照片自身高度比） */
const PHOTO_FADE_START = 0.78
/** 参考实现按 1080 宽出图，所有 px 参数都以它为基准等比缩放 */
const DESIGN_WIDTH = 1080
const GRAIN_TILE = 160

const SERIF_STACK = "'Noto Serif SC', 'Songti SC', STSong, 'Times New Roman', serif"

export interface CoverImage {
  element: HTMLImageElement | HTMLCanvasElement
  width: number
  height: number
  /** 能不能读像素（跨域且没有 CORS 时读不了，只能走无模糊的降级） */
  readable: boolean
}

export interface CoverSceneOptions {
  tint: string
  /** 卡片比例：宽 / 高 */
  aspect: number
  /** 照片左右留边：画布宽比（0 = 满幅） */
  inset: number
  /** 照片高度：画布高比 */
  photoHeight: number
  /** 模糊起点：画布高比 */
  blurStart: number
  /** 模糊强度：1080 宽下的 px */
  blur: number
  /** 混色起点：画布高比 */
  mixStart: number
  /** 混色完成位置：画布高比 */
  mixPoint: number
  /** 颗粒 0–1 */
  grain: number
  focusX: number
  focusY: number
  /** 没有照片时压在色块上的衬线首字 */
  watermark?: string
}

export interface CoverRenderOptions {
  /** 照片提不出颜色 / 没有照片时的兜底混色 */
  fallbackTint: string
  /** 没有头图时拿它取混色（头像 / 国徽），比纯色更有依据 */
  tintImage?: CoverImage | null
  /** 混色来源：auto = 从图取色；mono = 黑白（块色由调用方按主题给 `monoColor`） */
  tintMode?: 'auto' | 'mono'
  /** 黑白模式的块色：亮色主题给纸色、暗色主题给墨色（`readTokenColor('--oc-paper-card', …)`） */
  monoColor?: string
  watermark?: string
  /** 以下都是 `CoverTuning` 的同名字段（比例已换成 0–1） */
  aspect?: number
  inset?: number
  photoHeight?: number
  blurStart?: number
  blur?: number
  mixStart?: number
  mixPoint?: number
  grain?: number
  focusX?: number
  focusY?: number
  /** 画布最长边上限（设备像素）：卡片很小，不必按原生分辨率画 */
  maxPixelWidth?: number
}

const DEFAULT_BLUR_START = 0.48
const DEFAULT_BLUR = 42
const DEFAULT_MIX_START = 0.54
const DEFAULT_MIX_POINT = 1
const DEFAULT_GRAIN = 0.28
const DEFAULT_PHOTO_HEIGHT = 0.66
const DEFAULT_MAX_PIXEL_WIDTH = 760

let noiseTile: HTMLCanvasElement | null = null
let plateCanvas: HTMLCanvasElement | null = null

/** 颗粒贴图：一张 160×160 的噪点，全局只造一次 */
function getNoiseTile(): HTMLCanvasElement | null {
  if (noiseTile) return noiseTile
  const canvas = document.createElement('canvas')
  canvas.width = GRAIN_TILE
  canvas.height = GRAIN_TILE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const tile = ctx.createImageData(GRAIN_TILE, GRAIN_TILE)
  const { data } = tile
  for (let i = 0; i < data.length; i += 4) {
    const value = 92 + Math.random() * 72
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  ctx.putImageData(tile, 0, 0)
  noiseTile = canvas
  return canvas
}

/** 覆盖式裁切（保持比例、多余部分裁掉）—— 只给取色用 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CoverImage,
  width: number,
  height: number,
  focusX: number,
  focusY: number,
): void {
  const scale = Math.max(width / image.width, height / image.height)
  const dw = image.width * scale
  const dh = image.height * scale
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image.element, (width - dw) * focusX, (height - dh) * focusY, dw, dh)
}

/**
 * 照片块的高度（画布像素）—— **只按宽度铺满，左右永远不裁**：
 *
 * ```
 * 自然高度 = 卡片宽 × (图片高 / 图片宽)
 * 块高度   = min(自然高度, 画布高 × 照片高度上限)
 * ```
 *
 * 所以 3:2 的横图放在 1:1 的卡上只占约 67% 高，下面那段留给色块与文字 ——
 * 这正是封面的样子；只有竖图超出上限时才**裁上下**，左右始终完整。
 */
export function photoPlateHeight(
  cardWidth: number,
  cardHeight: number,
  imageWidth: number,
  imageHeight: number,
  maxRatio: number,
): number {
  const natural = cardWidth * (imageHeight / Math.max(1, imageWidth))
  const cap = cardHeight * maxRatio
  return Math.max(4, Math.round(Math.min(natural, cap)))
}

/** 按宽度铺满照片块；超出块高时按 `focusY` 裁上下 */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  image: CoverImage,
  width: number,
  height: number,
  focusY: number,
): void {
  const scale = width / image.width
  const dh = Math.max(height, image.height * scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image.element, 0, (height - dh) * focusY, width, dh)
}

/** 从照片里提混色：缩到 48×60 就够，权重见 `tintFromPixels` */
export function sampleTint(image: CoverImage, focusX: number, focusY: number): string | null {
  if (!image.readable) return null
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 60
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  drawCover(ctx, image, 48, 60, focusX, focusY)
  try {
    return tintFromPixels(ctx.getImageData(0, 0, 48, 60).data)
  } catch {
    return null
  }
}

/**
 * 无像素可读时的降级：不模糊，只把下缘的 Alpha 擦掉，让照片同样溶进色块。
 * 构图一致，只是少了那层逐行递增的柔化。
 */
function paintSoftDissolve(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const dissolve = ctx.createLinearGradient(0, height * 0.46, 0, height)
  dissolve.addColorStop(0, 'rgba(0, 0, 0, 0)')
  dissolve.addColorStop(0.55, 'rgba(0, 0, 0, 0.55)')
  dissolve.addColorStop(1, 'rgba(0, 0, 0, 1)')
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = dissolve
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

/**
 * 读设计令牌的真实色值 —— 画布拿不到 CSS 变量，只能问一次 `getComputedStyle`。
 * 黑白模式的块色就靠它：`--oc-paper-card` 在亮色主题是纸色、暗色主题是墨色，
 * 所以「黑白」天然跟着主题走，不用在这里再写一份明暗分支。
 */
export function readTokenColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return /^#[0-9A-Fa-f]{6}$/.test(raw) ? raw : fallback
  } catch {
    return fallback
  }
}

/** 照片那一块：模糊只算需要模糊的那一段（起点以上是清晰的，别白算） */
export function paintPhoto(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: CoverImage,
  options: CoverSceneOptions,
): void {
  const plateX = width * options.inset
  const plateW = width * (1 - options.inset * 2)
  const plateY = 0
  // 只按宽度铺满：横图自己就矮，下面那段留给色块；竖图超出上限才裁上下
  const plateH = photoPlateHeight(plateW, height, image.width, image.height, options.photoHeight)
  const photoWidth = Math.max(4, Math.round(plateW))
  const photoHeight = Math.max(4, Math.round(plateH))

  if (!plateCanvas) plateCanvas = document.createElement('canvas')
  const plate = plateCanvas
  if (plate.width !== photoWidth) plate.width = photoWidth
  if (plate.height !== photoHeight) plate.height = photoHeight
  const plateCtx = plate.getContext('2d', { willReadFrequently: true })
  if (!plateCtx) return

  plateCtx.clearRect(0, 0, photoWidth, photoHeight)
  drawPhoto(plateCtx, image, photoWidth, photoHeight, options.focusY)

  if (image.readable) {
    // 起点换算到照片自己的行号（参数是画布比例，不是照片比例）
    const startRatio = (options.blurStart * height - plateY) / plateH
    const blurStartRow = Math.round(Math.min(1, Math.max(0, startRatio)) * photoHeight)
    // 淡出是照片自己的事（照片高度的 78% 起），跟模糊起点无关。
    // 照片比模糊起点还矮时（很宽的图），起点落在照片外面 —— 这时候如果整段跳过，
    // 照片就会一刀切在色块上：所以从「模糊起点」和「淡出起点」里更靠上的那个开始算。
    const fadeRow = Math.round(PHOTO_FADE_START * photoHeight)
    const startRow = Math.max(0, Math.min(blurStartRow, fadeRow))
    const radius = options.blur * (width / DESIGN_WIDTH)

    // 半径可以是 0（滑杆拉到最左），淡出仍然要跑 —— 否则又是硬边
    if (startRow < photoHeight) {
      try {
        const rows = photoHeight - startRow
        const slice = plateCtx.getImageData(0, startRow, photoWidth, rows)
        const blurred = progressiveBlur({
          data: slice.data,
          width: photoWidth,
          rows,
          firstRow: startRow,
          fullHeight: photoHeight,
          radius,
          fadeStart: PHOTO_FADE_START,
        })
        plateCtx.putImageData(new ImageData(blurred, photoWidth, rows), 0, startRow)
      } catch {
        // 读不到像素（画布被污染）：退化成一次性的柔和淡出
        paintSoftDissolve(plateCtx, photoWidth, photoHeight)
      }
    }
  } else {
    paintSoftDissolve(plateCtx, photoWidth, photoHeight)
  }

  // 贴顶的照片没有外露的角，圆角交给卡片的 CSS 裁 —— 画布里再裁一次会在顶角
  // 留下四个透明的缺口，透出底下的色块
  const flush = plateY === 0 && plateX === 0 && Math.abs(plateW - width) < 0.5
  if (flush) {
    ctx.drawImage(plate, plateX, plateY, plateW, plateH)
    return
  }

  const radius = Math.max(1, 2 * (width / DESIGN_WIDTH))
  ctx.save()
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(plateX, plateY, plateW, plateH, radius)
  } else {
    ctx.rect(plateX, plateY, plateW, plateH)
  }
  ctx.clip()
  ctx.drawImage(plate, plateX, plateY, plateW, plateH)
  ctx.restore()
}

function paintWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tint: string,
  watermark: string,
): void {
  const size = height * 0.38
  const light = luminance(tint) > 0.5
  ctx.save()
  ctx.globalAlpha = light ? 0.08 : 0.1
  ctx.fillStyle = light ? darken(tint, 0.55) : lighten(tint, 0.62)
  ctx.font = `600 ${size}px ${SERIF_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(watermark, width / 2, height * 0.3)
  ctx.restore()
}

export function paintScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  image: CoverImage | null,
  options: CoverSceneOptions,
): void {
  const tint = options.tint
  // 底色是亮是暗，下面几层「压暗 / 暗角 / 颗粒」的力度完全不同 ——
  // 纸色底（黑白模式 + 亮色主题）上把它们按深色底那套来，纸就发灰发脏。
  const lightBlock = luminance(tint) > 0.5
  ctx.clearRect(0, 0, width, height)

  // 铺满画布的色块：上端极轻提亮，下端收暗（浅色底只收一点点，否则显脏）
  const field = ctx.createLinearGradient(0, 0, 0, height)
  field.addColorStop(0, lighten(tint, lightBlock ? 0.02 : 0.045))
  field.addColorStop(0.52, tint)
  field.addColorStop(0.72, tint)
  field.addColorStop(1, darken(tint, lightBlock ? 0.035 : 0.14))
  ctx.fillStyle = field
  ctx.fillRect(0, 0, width, height)

  if (image) {
    paintPhoto(ctx, width, height, image, options)
  } else if (options.watermark) {
    paintWatermark(ctx, width, height, tint, options.watermark)
  }

  // 混色：照片下缘被这层实色吃掉，色块从 mixEnd 起完全不透明。
  // 起点以上的照片只是被压了一层很薄的色，所以标题落在模糊区里也读得清。
  const mixStart = height * Math.min(options.mixStart, options.mixPoint - 0.04)
  const mixEnd = height * Math.min(0.98, Math.max(0.4, options.mixPoint))
  const mix = ctx.createLinearGradient(0, mixStart, 0, mixEnd)
  mix.addColorStop(0, rgba(tint, 0))
  mix.addColorStop(0.38, rgba(tint, 0.38))
  mix.addColorStop(0.72, rgba(tint, 0.86))
  mix.addColorStop(1, rgba(tint, 1))
  ctx.fillStyle = mix
  ctx.fillRect(0, mixStart, width, height - mixStart)

  // 色块底部一点点厚度，免得看起来像一块纯 UI 填色（纸色底几乎不加）
  const shade = ctx.createLinearGradient(0, mixEnd, 0, height)
  shade.addColorStop(0, lightBlock ? 'rgba(43, 43, 43, 0)' : 'rgba(5, 8, 6, 0)')
  shade.addColorStop(1, lightBlock ? 'rgba(43, 43, 43, 0.02)' : 'rgba(5, 8, 6, 0.2)')
  ctx.fillStyle = shade
  ctx.fillRect(0, mixEnd, width, height - mixEnd)

  // 克制的暗角
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    width * 0.1,
    width * 0.5,
    height * 0.5,
    width * 0.84,
  )
  if (lightBlock) {
    // 纸色底不要暗角：一圈灰会让整张纸看起来像旧的
    vignette.addColorStop(0, 'rgba(43, 43, 43, 0)')
    vignette.addColorStop(0.7, 'rgba(43, 43, 43, 0)')
    vignette.addColorStop(1, 'rgba(43, 43, 43, 0)')
  } else {
    vignette.addColorStop(0, 'rgba(5, 7, 5, 0)')
    vignette.addColorStop(0.7, 'rgba(5, 7, 5, 0.035)')
    vignette.addColorStop(1, 'rgba(5, 7, 5, 0.16)')
  }
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  // 胶片颗粒（纸色底上要压一档：同样的强度在浅色底上会像蒙了一层脏点）
  const grain = Math.min(1, Math.max(0, options.grain))
  const tile = getNoiseTile()
  if (grain > 0 && tile) {
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) {
      ctx.save()
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = (0.025 + grain * 0.09) * (lightBlock ? 0.35 : 1)
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    }
  }
}

/**
 * 画一张封面卡。尺寸按 CSS 宽度 + 设备像素比算，最长边封顶，
 * 保证同一张卡在 2× 屏上清晰、在 1× 屏上不浪费。
 */
export function renderCover(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  image: CoverImage | null,
  options: CoverRenderOptions,
): void {
  const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
  const limit = options.maxPixelWidth ?? DEFAULT_MAX_PIXEL_WIDTH
  const aspect = options.aspect ?? COVER_ASPECT
  const pixelWidth = Math.max(2, Math.min(limit, Math.round(cssWidth * dpr)))
  const pixelHeight = Math.max(2, Math.round(pixelWidth / aspect))

  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const focusX = options.focusX ?? 0.5
  const focusY = options.focusY ?? 0.5
  const mono = options.tintMode === 'mono'
  const tintSource = mono ? null : image ?? options.tintImage ?? null
  const tint =
    (mono ? options.monoColor : null) ??
    (tintSource ? sampleTint(tintSource, focusX, focusY) : null) ??
    (mono ? INK_TINT : options.fallbackTint)

  paintScene(ctx, pixelWidth, pixelHeight, image, {
    tint,
    aspect,
    inset: options.inset ?? 0,
    photoHeight: options.photoHeight ?? DEFAULT_PHOTO_HEIGHT,
    blurStart: options.blurStart ?? DEFAULT_BLUR_START,
    blur: options.blur ?? DEFAULT_BLUR,
    mixStart: options.mixStart ?? DEFAULT_MIX_START,
    mixPoint: options.mixPoint ?? DEFAULT_MIX_POINT,
    grain: options.grain ?? DEFAULT_GRAIN,
    focusX,
    focusY,
    watermark: options.watermark,
  })
}
