/**
 * 画布取色的公共入口（关系图 / 时间线的 PNG 导出共用）。
 *
 * 设计令牌是唯一源（`globals.css`），但 canvas 认不了 `var()` —— 只能把值读出来再画。
 * 读不到就**报错**而不是猜一个色：猜出来的颜色在换主题后会跟前端不一致。
 */

export function cssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 必须存在的令牌；缺了说明样式还没加载 */
export function token(name: string): string {
  const value = cssVar(name)
  if (!value) throw new Error(`读取不到界面令牌 ${name}`)
  return value
}

/** `var(--oc-accent-3)` → `#6A7A4C`（canvas 认不了 var()） */
export function resolveColor(cssColor: string): string {
  const match = /^var\(\s*(--[\w-]+)\s*\)$/.exec(cssColor.trim())
  return match ? token(match[1]) : cssColor
}

/** 给令牌色加透明度（标签描边、点阵都要半透明；`#RRGGBB` / `rgb()` 都认） */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    let value = hex[1]
    if (value.length === 3) value = value.split('').map((c) => c + c).join('')
    const numeric = parseInt(value, 16)
    const r = (numeric >> 16) & 255
    const g = (numeric >> 8) & 255
    const b = numeric & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim())
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
  }
  return color
}

/** 圆角矩形路径（只建路径，不填不描） */
export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

/** 超出宽度就截断并加省略号（画布不会自动换行） */
export function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}
