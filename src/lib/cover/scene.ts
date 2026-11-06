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

/**
 * 溶解带默认厚度：**卡片高度**的 15%，由参数 `dissolve` 覆盖（面板「溶解带」）。
 *
 * 厚度按卡片高度取，不按照片高度取 —— 这是「所有卡片效果一致」的关键：
 * 早先固定淡掉照片自身高度的 14%，3:2 的头图（占卡片 78% 高）看着正好，
 * 但 3:1 的横幅只占卡片 39% 高，同样 14% 只剩三十几像素，就成了硬边。
 *
 * 11% → 15%（2026-11-05）：照片与色块之间的过渡再柔和一点；宽度成为参数，
 * 太窄就只剩一条线，太宽会把照片主体吃掉，面板里 4–30% 实时可调。
 */
const DEFAULT_DISSOLVE_RATIO = 0.15
/** 极端横幅（照片本身比溶解带还矮）时最多淡掉下半部分，别把主体整个吃掉 */
const DISSOLVE_MAX_PHOTO_RATIO = 0.5
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
  /** 照片区高度：卡片高比（固定值，图片按 cover 裁进来） */
  photoHeight: number
  /** 溶解带厚度：卡片高比（照片下缘从这里开始淡进色块） */
  dissolve: number
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
  /** 溶解带厚度：卡片高比 */
  dissolve?: number
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
const DEFAULT_PHOTO_HEIGHT = 0.78
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

/** 覆盖式裁切（保持比例、多余部分裁掉）—— 照片块与取色共用 */
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
 * 照片块的高度（画布像素）—— **卡片高度的固定比例**。
 *
 * 封面卡的长宽比是固定的（实体卡 7:6、书封 2:3），照片区也必须固定：
 * 早先按「图片自然高度」走，3:2 的头图占 78% 高、3:1 的横幅只占 39%，
 * 同一排卡片就成了两种版式。现在统一按卡片高度的比例取，图片用 cover 裁进来。
 */
export function photoPlateHeight(cardHeight: number, ratio: number): number {
  const clamped = Math.min(1, Math.max(0.2, ratio))
  return Math.max(4, Math.round(cardHeight * clamped))
}

/**
 * 照片从自己的第几行开始淡出（照片高度比）。
 *
 * 溶解带厚度按**卡片高度**的 `dissolve` 取，所以 3:1 的横幅照片也有一条和 3:2
 * 一样厚的渐变，不会因为照片矮就被压成一条硬边；照片特别矮时最多淡掉下半部分。
 * 没有照片高度时返回 1（整块透明，不淡出）。
 */
export function photoDissolveStart(
  cardHeight: number,
  photoHeight: number,
  dissolve = DEFAULT_DISSOLVE_RATIO,
): number {
  if (photoHeight <= 0) return 1
  const band = Math.min(cardHeight * Math.max(0, dissolve), photoHeight * DISSOLVE_MAX_PHOTO_RATIO)
  return Math.min(1, Math.max(0, 1 - band / photoHeight))
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
  // 照片区高度是卡片高度的固定比例；图片按 cover 裁进去（见 `photoPlateHeight`）
  const plateH = photoPlateHeight(height, options.photoHeight)
  const photoWidth = Math.max(4, Math.round(plateW))
  const photoHeight = Math.max(4, Math.round(plateH))

  if (!plateCanvas) plateCanvas = document.createElement('canvas')
  const plate = plateCanvas
  if (plate.width !== photoWidth) plate.width = photoWidth
  if (plate.height !== photoHeight) plate.height = photoHeight
  const plateCtx = plate.getContext('2d', { willReadFrequently: true })
  if (!plateCtx) return

  plateCtx.clearRect(0, 0, photoWidth, photoHeight)
  drawCover(plateCtx, image, photoWidth, photoHeight, options.focusX, options.focusY)

  if (image.readable) {
    // 起点换算到照片自己的行号（参数是画布比例，不是照片比例）
    const startRatio = (options.blurStart * height - plateY) / plateH
    const blurStartRow = Math.round(Math.min(1, Math.max(0, startRatio)) * photoHeight)
    // 淡出是照片自己的事，但溶解带的**厚度按卡片高度**算（见 `photoDissolveStart`）。
    // 起点以上是清晰的，模糊从「模糊起点」和「溶解起点」里更靠上的那个开始 ——
    // 标题落在照片下面时（卡片矮 / 字号大），靠这一条才不会一刀切在色块上。
    const fadeStart = photoDissolveStart(height, plateH, options.dissolve)
    const fadeRow = Math.round(fadeStart * photoHeight)
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
          fadeStart,
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

  // 铺满画布的色块。纸色底就是**一块干净的纸**：不做上下渐变，
  // 否则底边会露出一道更暗的带子（纸色上看就是「脏」）。
  if (lightBlock) {
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, width, height)
  } else {
    const field = ctx.createLinearGradient(0, 0, 0, height)
    field.addColorStop(0, lighten(tint, 0.045))
    field.addColorStop(0.52, tint)
    field.addColorStop(0.72, tint)
    field.addColorStop(1, darken(tint, 0.14))
    ctx.fillStyle = field
    ctx.fillRect(0, 0, width, height)
  }

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

  // 色块底部一点点厚度，免得看起来像一块纯 UI 填色。
  // 纸色底不加：那层暗在平铺的纸上就是一条脏边。
  if (!lightBlock) {
    const shade = ctx.createLinearGradient(0, mixEnd, 0, height)
    shade.addColorStop(0, 'rgba(5, 8, 6, 0)')
    shade.addColorStop(1, 'rgba(5, 8, 6, 0.2)')
    ctx.fillStyle = shade
    ctx.fillRect(0, mixEnd, width, height - mixEnd)

    // 克制的暗角（纸色底不要：一圈灰让整张纸看起来像旧的）
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      width * 0.1,
      width * 0.5,
      height * 0.5,
      width * 0.84,
    )
    vignette.addColorStop(0, 'rgba(5, 7, 5, 0)')
    vignette.addColorStop(0.7, 'rgba(5, 7, 5, 0.035)')
    vignette.addColorStop(1, 'rgba(5, 7, 5, 0.16)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, width, height)
  }

  // 胶片颗粒。纸色底完全不加：浅色平铺面上任何噪点都像蒙了一层灰。
  const grain = Math.min(1, Math.max(0, options.grain))
  const tile = lightBlock ? null : getNoiseTile()
  if (grain > 0 && tile) {
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) {
      ctx.save()
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = 0.025 + grain * 0.09
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
    dissolve: options.dissolve ?? DEFAULT_DISSOLVE_RATIO,
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
