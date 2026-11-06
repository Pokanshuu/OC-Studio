'use client'

/**
 * 政治标注的渲染层：国界（闭合面）与道路（折线）。
 *
 * 为什么是 SVG 而不是 canvas：标注是**矢量**，跟着 stage 一起缩放，还要能
 * 逐条命中（右键删除）。用 SVG 就是一根 `<polygon>` / `<polyline>`。
 *
 * **坐标系是 stage 的像素，不是 0–1 的方框**。以前用 `viewBox="0 0 1 1"` +
 * `preserveAspectRatio="none"`，在 2:1 的世界地图上圆点会被横向拉成椭圆、
 * 虚线也会被拉长（「扁扁的」就是这么来的）。改成 `viewBox="0 0 stageWidth stageHeight"`
 * 之后，圆就是圆、虚线就是虚线，位置仍是归一化坐标乘出来的。
 *
 * 颜色：
 * - 线条色取标注自己的 `color`（色板中文名），没选就用**固定深墨**（`--oc-ink-fixed`）。
 *   不用主题的 `ink`：底图是用户内容，暗色主题下 `ink` 是浅灰，铺在浅色地图上基本看不见。
 * - 每条线下面垫一道**纸色外壳**：深色海面 / 深色底图上，深色线不会糊进去。
 * - 描边宽度用 `vector-effect` 锁成屏幕像素，放大后不变粗；顶点反过来按 `1/scale` 缩，
 *   放大地图时圆点不会跟着长成一大坨。
 */
import { relationColorValue } from '@/lib/relation-colors'
import { ANNOTATION_LABELS, type MapAnnotation, type AnnotationPoint } from '../annotations'

interface AnnotationLayerProps {
  items: readonly MapAnnotation[]
  /** 正在画的那条（点还在增加） */
  draft: { kind: MapAnnotation['kind']; points: AnnotationPoint[] } | null
  /** stage 的**未缩放**像素宽高（与底图等比） */
  width: number
  height: number
  /** stage 的缩放倍率：顶点按屏幕像素给大小 */
  scale: number
}

/** 没选颜色时的线条色：固定深墨，不跟主题翻 */
const DEFAULT_INK = 'var(--oc-ink-fixed)'
/** 线下的纸色外壳 */
const HALO = 'var(--oc-paper-fixed)'
const HALO_WIDTH = 4
const CORE_WIDTH = 1.75
/** 顶点半径（屏幕像素） */
const VERTEX_RADIUS = 4

function toPoints(points: readonly AnnotationPoint[], width: number, height: number): string {
  return points.map((point) => `${point.x * width},${point.y * height}`).join(' ')
}

export function AnnotationLayer({ items, draft, width, height, scale }: AnnotationLayerProps) {
  // 还没量到尺寸：画出来只会是一团 0×0 的东西
  if (width <= 0 || height <= 0) return null
  const vertexRadius = VERTEX_RADIUS / Math.max(scale, 0.5)

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {items.map((item) => {
        const points = toPoints(item.points, width, height)
        const stroke = item.color ? relationColorValue(item.color) : DEFAULT_INK
        const dash = item.kind === 'road' ? '6 4' : undefined

        if (item.kind === 'border') {
          const fill = item.fill ? relationColorValue(item.fill) : DEFAULT_INK
          return (
            <g key={item.id}>
              <polygon
                points={points}
                fill="none"
                stroke={HALO}
                strokeOpacity={0.55}
                strokeWidth={HALO_WIDTH}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points={points}
                fill={fill}
                fillOpacity={item.fill ? 0.24 : 0.06}
                stroke={stroke}
                strokeWidth={CORE_WIDTH}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              >
                <title>{ANNOTATION_LABELS[item.kind]}</title>
              </polygon>
            </g>
          )
        }

        return (
          <g key={item.id}>
            <polyline
              points={points}
              fill="none"
              stroke={HALO}
              strokeOpacity={0.55}
              strokeWidth={HALO_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={points}
              fill="none"
              stroke={stroke}
              strokeWidth={CORE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
            >
              <title>{ANNOTATION_LABELS[item.kind]}</title>
            </polyline>
          </g>
        )
      })}

      {draft && draft.points.length > 0 ? (
        <>
          {draft.kind === 'border' ? (
            <polygon
              points={toPoints(draft.points, width, height)}
              className="text-ink-fixed"
              fill="currentColor"
              fillOpacity={0.05}
              stroke="currentColor"
              strokeWidth={CORE_WIDTH}
              strokeDasharray="5 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <polyline
              points={toPoints(draft.points, width, height)}
              className="text-ink-fixed"
              fill="none"
              stroke="currentColor"
              strokeWidth={CORE_WIDTH}
              strokeDasharray="5 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* 顶点：屏幕像素大小的圆点（纸色外壳 + 墨心），放大地图也不会变扁 */}
          {draft.points.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x * width}
              cy={point.y * height}
              r={vertexRadius}
              fill={DEFAULT_INK}
              stroke={HALO}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      ) : null}
    </svg>
  )
}
