'use client'

/**
 * 地图视图条 —— 压在图下方居中的一排档位（`docs/地图.md` §10）。
 *
 * 语义是「**换底图**」而不是「叠图层」：每一档都是同一份种子 + 参数渲染出来的
 * 一张完整图，切档 = 把画布换成那一张（方案 A）。所以：
 * - 只有**生成过**的地图才显示它（手传的底图没有可重画的快照）
 * - 锚点是归一化的，换底图不用重摆
 *
 * 视觉：一块浮层表面装一排等宽小键，选中用 `--oc-hover` 浅底块（不是下划线，
 * 下划线是页签的语义）；渲染中键位压暗并给一条细进度线 —— 生成一张要几百毫秒到
 * 几秒，没有反馈会让人以为点空了。
 */
import { MAP_VIEW_LABELS, type MapView } from '@/plugins/map-generator'
import { ROUND_CONTROL } from '@/lib/ui-tokens'

interface MapViewStripProps {
  /** 可切的档位（不含剖面：那是抽屉，不是底图） */
  views: readonly MapView[]
  active: string
  /** 正在渲染某一档：整条暂时不可点 */
  busy: boolean
  /** 0–1，`null` = 没有进度可报 */
  progress: number | null
  onSelect: (view: MapView) => void
}

export function MapViewStrip({ views, active, busy, progress, onSelect }: MapViewStripProps) {
  return (
    <div
      className={`pointer-events-auto flex flex-col gap-1 border border-line bg-paper/85 p-1 backdrop-blur-lg float-shadow ${ROUND_CONTROL}`}
      role="group"
      aria-label="地图视图"
    >
      <div className="flex items-center gap-0.5">
        {views.map((view) => {
          const selected = active === view
          return (
            <button
              key={view}
              type="button"
              onClick={() => onSelect(view)}
              disabled={busy}
              aria-pressed={selected}
              className={`h-6 rounded-item px-2 text-[12px] transition-colors disabled:opacity-50 ${
                selected
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
              }`}
            >
              {MAP_VIEW_LABELS[view]}
            </button>
          )
        })}
      </div>

      {busy ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((progress ?? 0) * 100)}
          className="h-0.5 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-ink-muted transition-[width] duration-150"
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
