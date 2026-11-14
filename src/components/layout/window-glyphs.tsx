'use client'

/**
 * 窗口按钮的系统字形（最小化 / 最大化 / 还原 / 关闭）。
 *
 * **这是「只用 lucide」的唯一例外**（已在 `oc-studio-design` §4 登记）：
 * lucide 的 `Minimize2` / `Maximize2` 是「两个斜向箭头」，语义是「全屏 / 退出全屏」；
 * Windows 的最大化是一个**方框**、还原是**两个叠起来的方框**。用斜箭头一眼就能看出
 * 这不是系统窗口画出来的。
 *
 * 版式照 Windows 11：10×10 画布、1px 描边、`shape-rendering="crispEdges"`
 * （系统字形是像素对齐的，抗锯齿会糊）。颜色一律 `currentColor`，由按钮决定。
 */

const SVG_PROPS = {
  width: 10,
  height: 10,
  viewBox: '0 0 10 10',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1,
  shapeRendering: 'crispEdges',
  'aria-hidden': true,
  focusable: false,
} as const

/** 最小化：一条横线 */
export function MinimizeGlyph() {
  return (
    <svg {...SVG_PROPS}>
      <line x1="0.5" y1="5.5" x2="9.5" y2="5.5" />
    </svg>
  )
}

/** 最大化：一个方框 */
export function MaximizeGlyph() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  )
}

/** 还原：两个错位叠放的方框（后面那个只画露出来的三条边） */
export function RestoreGlyph() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="0.5" y="3.5" width="6" height="6" />
      <path d="M3.5 3.5V0.5H9.5V6.5H7.5" />
    </svg>
  )
}

/** 关闭：一个 X */
export function CloseGlyph() {
  return (
    <svg {...SVG_PROPS}>
      <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
      <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
    </svg>
  )
}
