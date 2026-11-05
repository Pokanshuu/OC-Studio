'use client'

/**
 * 政治标注的渲染层：国界（闭合面）与道路（折线）。
 *
 * 为什么是 SVG 而不是 canvas：标注是**矢量**，跟着 stage 一起缩放，还要能
 * 逐条命中（右键删除）。用 SVG 就是一根 `<polygon>` / `<polyline>`，
 * 坐标直接给归一化值，`viewBox="0 0 1 1"` 下面不用换算。
 *
 * 颜色全部走 `currentColor` + 令牌类（`text-ink` / `text-ink-faint`），
 * 主题切换自动跟；描边宽度用 `vector-effect` 锁成屏幕像素，放大后不变粗。
 */
import { relationColorValue } from '@/lib/relation-colors'
import { ANNOTATION_LABELS, type MapAnnotation, type AnnotationPoint } from '../annotations'

interface AnnotationLayerProps {
  items: readonly MapAnnotation[]
  /** 正在画的那条（点还在增加） */
  draft: { kind: MapAnnotation['kind']; points: AnnotationPoint[] } | null
}

function toPoints(points: readonly AnnotationPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function AnnotationLayer({ items, draft }: AnnotationLayerProps) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {items.map((item) =>
        item.kind === 'border' ? (
          <polygon
            key={item.id}
            points={toPoints(item.points)}
            className="text-ink"
            fill={item.fill ? relationColorValue(item.fill) : 'currentColor'}
            fillOpacity={item.fill ? 0.22 : 0.07}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          >
            <title>{ANNOTATION_LABELS[item.kind]}</title>
          </polygon>
        ) : (
          <polyline
            key={item.id}
            points={toPoints(item.points)}
            className="text-ink"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 3"
            vectorEffect="non-scaling-stroke"
          >
            <title>{ANNOTATION_LABELS[item.kind]}</title>
          </polyline>
        ),
      )}

      {draft && draft.points.length > 0 ? (
        <>
          {draft.kind === 'border' ? (
            <polygon
              points={toPoints(draft.points)}
              className="text-ink-faint"
              fill="currentColor"
              fillOpacity={0.04}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <polyline
              points={toPoints(draft.points)}
              className="text-ink-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {draft.points.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={0.004}
              className="text-ink-faint"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      ) : null}
    </svg>
  )
}
