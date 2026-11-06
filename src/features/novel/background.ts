/**
 * 小说版面背景唯一源（N1）。
 *
 * 预览（`NovelPreview`，后续接线）与 PNG 分页导出（`render-pages.ts`）都从这里取，
 * 不再各画一套。三种预设 + 自定义图片：
 *
 * | kind        | 预览（CSS）        | 导出（Canvas）                     |
 * | ----------- | ------------------ | ---------------------------------- |
 * | `paper`     | 暖白渐变            | 同色底 + 极淡噪点                   |
 * | `cream`     | 米黄渐变            | 同色底 + 噪点 + 细纤维              |
 * | `parchment` | 羊皮纸渐变 + 双层纤维 | 同色底 + 噪点 + 纤维 + 四角压暗      |
 * | `custom`    | 用户图铺满          | 用户图铺满 + 正文区可读底板          |
 *
 * 纹理**全部用 Canvas 即时画**（不引第三方、不读外部贴图），且只用
 * 由画布尺寸与固定种子推出来的位置 —— 同一页导出两次像素一致：
 * 导出的 PNG 会进投稿 / 印刷流程，随机噪点会导致两次导出不可复现。
 *
 * 注意：这里的色值是**版面内容色**（纸张），不是界面令牌；Canvas 拿不到
 * CSS 变量，所以用 `rgb()` 字面量，并由本文件独家持有。
 */

export type NovelBackgroundKind = 'paper' | 'cream' | 'parchment' | 'custom'

export type NovelPresetKind = Exclude<NovelBackgroundKind, 'custom'>

export type NovelBackgroundTexture = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void

export interface NovelBackgroundResolution {
  /** CSS `background` 值（预览用；可多层，第一层在最上） */
  cssBackground: string
  /** Canvas 打底填充色（导出用；自定义图会在其上再画图） */
  canvasFill: string
  /** Canvas 纹理（噪点 / 纤维）。预设之外的 kind 没有 */
  texture?: NovelBackgroundTexture
  /** 自定义背景图的源（库内相对路径或 data URL），Canvas 侧自行解析后绘制 */
  imageSrc?: string
}

export const NOVEL_BACKGROUND_PRESETS: ReadonlyArray<{
  value: NovelPresetKind
  label: string
}> = [
  { value: 'paper', label: '纸白' },
  { value: 'cream', label: '米黄' },
  { value: 'parchment', label: '羊皮纸' },
]

const PAPER_FILL = 'rgb(248, 245, 238)'
const CUSTOM_FALLBACK_FILL = 'rgb(249, 246, 240)'

/** 自定义背景图上的正文底板（预览与 PNG 导出共用）：图可能很花，字要读得清 */
export const NOVEL_READING_PANEL = 'rgba(250, 247, 241, 0.86)'

/**
 * 版面文字色 —— **不跟界面主题反转**。
 *
 * 纸张永远是浅色（纸白 / 米黄 / 羊皮纸 / 用户图 + 可读底板），所以正文必须是深墨。
 * 以前预览用的是界面令牌 `text-ink`：暗色主题下 `--oc-ink` 是浅色，纸面上就成白字
 * （`NovelPreview` 与 PNG 导出因此长得不一样）。CSS 那边拿不到 Canvas 的常量，
 * 所以这一份由本文件独家持有，两边都从这里取。
 */
export const NOVEL_PAGE_INK = 'rgb(58, 48, 36)'
/** 页码比正文淡一档 */
export const NOVEL_PAGE_NUMBER_INK = 'rgba(80, 64, 45, 0.68)'

const PAPER_CSS = 'linear-gradient(160deg, rgb(251, 248, 242) 0%, rgb(248, 245, 238) 55%, rgb(241, 237, 229) 100%)'

const CREAM_CSS = 'linear-gradient(160deg, rgb(248, 239, 221) 0%, rgb(243, 231, 208) 55%, rgb(234, 217, 183) 100%)'

/** 羊皮纸：两层极细斜纹（纤维方向交叉）+ 底色渐变 */
const PARCHMENT_CSS = [
  'repeating-linear-gradient(112deg, rgba(122, 96, 58, 0.045) 0px, rgba(122, 96, 58, 0.045) 1px, rgba(122, 96, 58, 0) 1px, rgba(122, 96, 58, 0) 4px)',
  'repeating-linear-gradient(24deg, rgba(160, 132, 88, 0.05) 0px, rgba(160, 132, 88, 0.05) 1px, rgba(160, 132, 88, 0) 1px, rgba(160, 132, 88, 0) 7px)',
  'linear-gradient(150deg, rgb(245, 234, 213) 0%, rgb(233, 216, 183) 48%, rgb(216, 192, 152) 100%)',
].join(', ')

function cssUrl(src: string): string {
  return `url("${src.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, '')}")`
}

/** 固定种子的伪随机数：同尺寸同预设 → 同纹理 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(width: number, height: number, salt: number): number {
  return (Math.round(width) * 73856093) ^ (Math.round(height) * 19349663) ^ salt
}

/** 斜向柔光：左上偏亮、右下偏沉，让平涂色有纸的厚度 */
function paintPaperLight(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, 'rgba(255, 252, 246, 0.30)')
  gradient.addColorStop(0.55, 'rgba(255, 252, 246, 0)')
  gradient.addColorStop(1, `rgba(118 92 54 / ${strength})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

/** 四角压暗（羊皮纸的旧边） */
function paintEdgeBurn(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number): void {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.28,
    width / 2,
    height / 2,
    Math.hypot(width, height) * 0.62,
  )
  gradient.addColorStop(0, 'rgba(110, 82, 44, 0)')
  gradient.addColorStop(0.72, 'rgba(110, 82, 44, 0)')
  gradient.addColorStop(1, `rgba(110 82 44 / ${strength})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

/** 噪点：1–2px 的明暗颗粒，数量按面积给（与画布尺寸无关的密度） */
function paintGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  density: number,
  alpha: number,
): void {
  const random = seededRandom(seed)
  const count = Math.max(240, Math.min(9000, Math.round((width * height) / density)))
  ctx.save()
  for (let i = 0; i < count; i += 1) {
    const x = random() * width
    const y = random() * height
    const size = random() > 0.86 ? 2 : 1
    const light = random() > 0.5
    ctx.fillStyle = light ? `rgba(255 252 245 / ${alpha})` : `rgba(96 76 50 / ${alpha * 1.15})`
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()
}

/** 纤维：几十条极细短弧线，方向大致一致（纸浆纹理） */
function paintFibers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  density: number,
  maxAlpha: number,
): void {
  const random = seededRandom(seed)
  const count = Math.max(18, Math.min(220, Math.round((width * height) / density)))
  const base = Math.min(width, height)
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i += 1) {
    const x = random() * width
    const y = random() * height
    const length = base * (0.018 + random() * 0.075)
    const angle = (random() - 0.5) * 0.55
    const dx = Math.cos(angle) * length
    const dy = Math.sin(angle) * length
    const lift = (random() - 0.5) * base * 0.012
    const light = random() > 0.45
    ctx.strokeStyle = light
      ? `rgba(255 250 238 / ${0.04 + random() * maxAlpha})`
      : `rgba(128 100 60 / ${0.03 + random() * maxAlpha * 0.8})`
    ctx.lineWidth = 0.6 + random() * 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + dx / 2, y + dy / 2 + lift, x + dx, y + dy)
    ctx.stroke()
  }
  ctx.restore()
}

const PAPER_TEXTURE: NovelBackgroundTexture = (ctx, width, height) => {
  paintPaperLight(ctx, width, height, 0.045)
  paintGrain(ctx, width, height, seedFor(width, height, 0x1a2b3c), 2600, 0.012)
}

const CREAM_TEXTURE: NovelBackgroundTexture = (ctx, width, height) => {
  paintPaperLight(ctx, width, height, 0.07)
  paintGrain(ctx, width, height, seedFor(width, height, 0x2b3c4d), 2000, 0.014)
  paintFibers(ctx, width, height, seedFor(width, height, 0x3c4d5e), 190000, 0.045)
}

const PARCHMENT_TEXTURE: NovelBackgroundTexture = (ctx, width, height) => {
  paintPaperLight(ctx, width, height, 0.11)
  paintEdgeBurn(ctx, width, height, 0.1)
  paintGrain(ctx, width, height, seedFor(width, height, 0x4d5e6f), 1500, 0.018)
  paintFibers(ctx, width, height, seedFor(width, height, 0x5e6f70), 110000, 0.07)
  paintFibers(ctx, width, height, seedFor(width, height, 0x6f7081), 160000, 0.05)
}

/**
 * 把一个背景选择收敛成「预览能用的 CSS + 导出能用的填充 / 纹理」。
 *
 * 纯函数：不碰 DOM、不解析路径。`custom` 只给 `imageSrc`，图片本身由
 * 调用方（`render-pages.ts`）先按环境解析成可加载的 URL 再画。
 * 自定义图为空 / 空白时回落到纸白，界面不会出现「选中了却没有背景」。
 */
export function resolveNovelBackground(
  kind: NovelBackgroundKind,
  image?: string,
): NovelBackgroundResolution {
  const source = image?.trim() ?? ''
  if (kind === 'custom' && source.length > 0) {
    return {
      cssBackground: `${cssUrl(source)} center / cover no-repeat, ${PAPER_CSS}`,
      canvasFill: CUSTOM_FALLBACK_FILL,
      imageSrc: source,
    }
  }

  if (kind === 'cream') {
    return {
      cssBackground: CREAM_CSS,
      canvasFill: 'rgb(243, 231, 208)',
      texture: CREAM_TEXTURE,
    }
  }

  if (kind === 'parchment') {
    return {
      cssBackground: PARCHMENT_CSS,
      canvasFill: 'rgb(233, 216, 183)',
      texture: PARCHMENT_TEXTURE,
    }
  }

  return {
    cssBackground: PAPER_CSS,
    canvasFill: PAPER_FILL,
    texture: PAPER_TEXTURE,
  }
}
