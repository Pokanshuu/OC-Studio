'use client'

/**
 * 右下：视口（docs/关系图.md §10）。
 *
 * 与地图右下那条缩放条同一形状：`− 85% +`，后面一枚**全景**。
 * 全景允许缩到 `MIN_ZOOM`（0.2）：整图一眼看完是「排位」时的基本需求，
 * 那一刻不需要读名字 —— 名字在低于 `LABEL_ZOOM` 时已经整批淡出。
 */
import { Minus, Plus, Scan } from 'lucide-react'
import { FLOAT_BAR, FLOAT_BAR_ICON } from '@/lib/ui-tokens'

export function RelationZoomBar({
  zoom,
  onZoomChange,
  onFit,
}: {
  zoom: number
  onZoomChange: (percent: number) => void
  onFit: () => void
}) {
  const percent = Math.round(zoom * 100)
  return (
    <div className={`pointer-events-auto ${FLOAT_BAR}`}>
      <button
        type="button"
        onClick={() => onZoomChange(percent - 10)}
        className={FLOAT_BAR_ICON}
        aria-label="缩小"
        title="缩小"
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <span className="w-9 text-center text-[11px] tabular-nums text-ink-faint">{percent}%</span>
      <button
        type="button"
        onClick={() => onZoomChange(percent + 10)}
        className={FLOAT_BAR_ICON}
        aria-label="放大"
        title="放大"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />
      <button
        type="button"
        onClick={onFit}
        className={FLOAT_BAR_ICON}
        aria-label="全景"
        title="全景"
      >
        <Scan size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
