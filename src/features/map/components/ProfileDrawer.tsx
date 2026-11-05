'use client'

/**
 * 地形剖面抽屉（`docs/地图.md` §10「剖面」）。
 *
 * 只负责画：采样是 `renderMapProfile()` 的事，它把一条归一化直线变成
 * `ProfilePoint[]`（高程 / 生物群系 / 水体 / 距离）。这里不碰数据层。
 *
 * 版式：底边 160px 抽屉，上面一条折线（高程），下面一条生物群系色带 ——
 * 色带用的就是渲染器那张 `BIOME_COLORS`，和地图上的颜色一一对应。
 * 抽屉是**底图之外的第二块画布**，所以它不进视图条（视图条切的是底图）。
 */
import { X } from 'lucide-react'
import { BIOME_COLORS, profileExtremes, type ProfilePoint } from '@/plugins/map-generator'
import { ICON_BTN, LOADING_TEXT, ROUND_ITEM } from '@/lib/ui-tokens'

export interface ProfileDrawerProps {
  points: readonly ProfilePoint[]
  lengthKm: number
  loading?: boolean
  /** 采样进度：Worker 的 stage + 0–1 */
  progress?: { stage: string; value: number } | null
  error?: string | null
  onClose: () => void
}

const BAND_HEIGHT = 10

export function ProfileDrawer({ points, lengthKm, loading, progress, error, onClose }: ProfileDrawerProps) {
  const extremes = profileExtremes([...points])
  const span = Math.max(1, extremes.max - extremes.min)

  return (
    <div className="flex h-40 shrink-0 flex-col border-t border-line bg-paper px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] tabular-nums text-ink-muted">
          {points.length > 0 ? `${Math.round(lengthKm)} km` : ''}
        </span>
        <button type="button" onClick={onClose} className={`${ICON_BTN} hover:text-ink`} aria-label="关闭剖面">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col justify-center gap-2 px-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-ink-muted transition-[width] duration-150"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, progress?.value ?? 0)) * 100)}%` }}
            />
          </div>
          <span className={`text-center ${LOADING_TEXT}`}>{progress?.stage ?? '采样中…'}</span>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-error">{error}</span>
        </div>
      ) : points.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-ink-faint">在图上拖一条线</span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <svg
            className={`min-h-0 w-full flex-1 text-ink ${ROUND_ITEM}`}
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="地形剖面"
          >
            <polyline
              points={points
                .map((point, index) => {
                  const x = (index / Math.max(1, points.length - 1)) * 1000
                  const y = 100 - ((point.elevation - extremes.min) / span) * 100
                  return `${x.toFixed(2)},${y.toFixed(2)}`
                })
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <svg
            className="w-full shrink-0"
            height={BAND_HEIGHT}
            viewBox="0 0 1000 1"
            preserveAspectRatio="none"
            aria-hidden
          >
            {points.map((point, index) => (
              <rect
                key={`${point.x}-${point.y}-${index}`}
                x={(index / Math.max(1, points.length - 1)) * 1000}
                y={0}
                width={1000 / Math.max(1, points.length - 1) + 0.5}
                height={1}
                fill={BIOME_COLORS[point.biome] ?? 'transparent'}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}
