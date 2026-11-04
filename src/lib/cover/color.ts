/**
 * 封面卡取色 —— 参考实现的权重，但**色相诚实**。
 *
 * 参考实现在图片没有彩度时会硬塞苔青（色相固定 0.42、饱和度下限 0.22），
 * 于是线稿、黑白照片、灰色图上的一律变成深绿。那是给「风景照片封面」调出来的兜底，
 * 搬到这里就变成了「瞎混」：卡片必须忠实反映它自己的图。规则只有三条：
 *
 *   有彩度   → 用图自己的色相，饱和度不放大（只留 0.10 的下限，免得灰得发脏）
 *   无彩度   → 中性炭黑，不猜色相（线稿就是线稿）
 *   没有图   → 中性炭黑
 *
 * 亮度始终压到 0.15–0.26：压在色块上的米白标题才读得清。
 *
 * 画布拿不到 CSS 变量，颜色还要参与 HSL 换算与混色，所以这里是十六进制字面量。
 * 它属于「图上的内容」而不是界面令牌 —— 与地图插件的色板同一性质，
 * 已在 `scripts/design-audit.ts` 的白名单里登记。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

/** 混色用的冷暖两个端点（提亮 → 暖白，压暗 → 近黑） */
const LIGHT_END = '#FFFAF0'
const DARK_END = '#080B09'

/** 低于这个饱和度的图视为「没有彩度」，走中性混色 */
const CHROMA_FLOOR = 0.06

/** 中性混色的色相/饱和度：几乎无彩，只留一丝暖，免得死灰 */
const NEUTRAL_HUE = 0.09
const NEUTRAL_SAT = 0.05

/** 没有图可依据时的混色（不是随机色，是「没有颜色信息」） */
export const NEUTRAL_TINT = '#2A2825'

/**
 * 黑白模式的**兜底**块色 —— 与设计令牌同一个值，只在读不到 CSS 变量时用。
 * 真正的块色跟着主题读 `--oc-paper-card`：亮色主题是纸色，暗色主题才是墨色。
 */
export const MONO_LIGHT_TINT = '#F3EFE9'
export const MONO_DARK_TINT = '#2D2B28'
/** 旧名，保留给「没有 CSS 可用」的极端场景 */
export const INK_TINT = MONO_DARK_TINT

export const DEFAULT_TINT = NEUTRAL_TINT

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function hexToRgb(hex: string): Rgb {
  const raw = hex.trim().replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => char + char)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6)
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return { r: 0, g: 0, b: 0 }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to = (value: number) =>
    Math.round(clamp(value, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`
}

export function mixColor(a: string, b: string, amount = 0.5): string {
  const from = hexToRgb(a)
  const to = hexToRgb(b)
  const t = clamp01(amount)
  return rgbToHex({
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t,
  })
}

/** 往暖白提一点（色块顶部那层很轻的亮） */
export function lighten(hex: string, amount: number): string {
  return mixColor(hex, LIGHT_END, amount)
}

/** 往近黑压一点（色块底部收暗） */
export function darken(hex: string, amount: number): string {
  return mixColor(hex, DARK_END, amount)
}

/**
 * 相对亮度 0–1。画布上「这块底色是亮的还是暗的」全靠它决定：
 * 水印、暗角、底部厚度在深底色上是「提亮」，在纸色底色上必须反过来。
 */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0)
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return { h: h / 6, s, l }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 1) + 1) % 1
  const sat = clamp01(s)
  const light = clamp01(l)
  if (sat === 0) {
    const v = light * 255
    return rgbToHex({ r: v, g: v, b: v })
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const channel = (t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return rgbToHex({
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
  })
}

/**
 * 把任意颜色收敛成「能做封面底色」的深色。
 * 色相与饱和度**跟着原色走**；只有「几乎看不出颜色」时才转中性 ——
 * 绝不把线稿硬调成某个色相。
 *
 * 判断有没有彩度用 `(max − min) / max`（参考实现的度量），不用 HSL 的 s：
 * 近白色（252,252,250）的 HSL 饱和度是 0.25，会骗人。
 */
export function normalizeTint(color: Rgb): string {
  const { h, s, l } = rgbToHsl(color)
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  const chroma = max === 0 ? 0 : (max - min) / max
  if (chroma < CHROMA_FLOOR) {
    return hslToHex({ h: NEUTRAL_HUE, s: NEUTRAL_SAT, l: clamp(l * 0.55, 0.15, 0.25) })
  }
  return hslToHex({
    h,
    s: clamp(s, 0.1, 0.45),
    l: clamp(l * 0.55, 0.15, 0.26),
  })
}

/**
 * 从照片像素里提混色 —— 权重按饱和度给，压掉过亮 / 过暗的像素。
 * 返回 null 表示这张图提不出可用颜色（调用方回落到中性混色）。
 */
export function tintFromPixels(data: Uint8ClampedArray): string | null {
  let r = 0
  let g = 0
  let b = 0
  let weightSum = 0

  for (let i = 0; i < data.length; i += 4) {
    const rr = data[i]
    const gg = data[i + 1]
    const bb = data[i + 2]
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    const sat = max === 0 ? 0 : (max - min) / max
    const lum = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255

    let weight = 0.45 + sat * 1.7
    if (lum > 0.82) weight *= 0.38
    if (lum < 0.1) weight *= 0.7

    r += rr * weight
    g += gg * weight
    b += bb * weight
    weightSum += weight
  }

  if (weightSum <= 0) return null
  return normalizeTint({ r: r / weightSum, g: g / weightSum, b: b / weightSum })
}
