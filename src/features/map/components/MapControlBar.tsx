'use client'

/**
 * 地图底部的「控制条」—— 把原来分散的两件东西合成一条：
 *
 * - 左端：`图层` 按钮（点开是面板：显示哪些锚点 + 当前档位的图例）
 * - 其余：底图档位（六档）。**只有生成过的地图才有**，手绘底图整段不渲染，
 *   这一条自己缩成一枚按钮 —— 界面按「这张图能做什么」裁剪，而不是给两种图套同一套控件。
 *
 * 语法：一条 `CONTROL` 浮条，左端图标钮 + 1px 竖线 + 每一档「图标 + 文字」；
 * 选中是浅底块（不是页签下划线：切档换的是整张底图，不是同一份内容的分页）。
 * 图标只表达「这一档看的是什么」（表在 `map-view-icons.tsx`），不承担选中态。
 *
 * 切档要几百毫秒到几秒：整条暂时禁用，当前档位压暗，浮条底边给一条 2px 进度线。
 */
import { useEffect, useState } from 'react'
import { ChevronUp, Layers } from 'lucide-react'
import { MAP_VIEW_LABELS, type MapView } from '@/plugins/map-generator'
import { CheckboxBox } from '@/components/ui/checkbox'
import {
  FLOAT_BAR,
  PANEL,
  PANEL_GROUP_LABEL,
  ROUND_ITEM,
} from '@/lib/ui-tokens'
import { MAP_LAYER_LABELS, type MapLayerKind, type MapLayerState } from '../types'
import { MAP_VIEW_ICONS } from './map-view-icons'
import { MapLegend } from './MapLegend'

interface MapControlBarProps {
  /** 可切的底图档位；空数组 = 手绘 / 导入底图，没有档位 */
  views: readonly MapView[]
  activeView: string
  /** 正在重画某一档 */
  busy: boolean
  /** 0–1，`null` = 没有进度可报 */
  progress: number | null
  onSelectView: (view: MapView) => void
  layers: readonly MapLayerState[]
  onToggleLayer: (kind: MapLayerKind) => void
  /** 图例要按哪一档配；`null` = 不显示（手绘底图没有地形色阶） */
  legendView: string | null
}

export function MapControlBar({
  views,
  activeView,
  busy,
  progress,
  onSelectView,
  layers,
  onToggleLayer,
  legendView,
}: MapControlBarProps) {
  const [open, setOpen] = useState(false)

  // Esc 收起面板（画线中按 Esc 是取消绘制，两件事互斥，不会同时发生）
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="pointer-events-auto flex flex-col items-start gap-2">
      {open ? (
        <div className={`w-[248px] p-2 ${PANEL}`} role="group" aria-label="图层与图例">
          <p className={PANEL_GROUP_LABEL}>显示</p>
          <div className="flex flex-col">
            {layers.map((layer) => (
              <button
                key={layer.kind}
                type="button"
                role="checkbox"
                aria-checked={layer.visible}
                onClick={() => onToggleLayer(layer.kind)}
                className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-[12px] text-ink transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM}`}
              >
                <CheckboxBox checked={layer.visible} />
                <span className="min-w-0 flex-1 truncate">{MAP_LAYER_LABELS[layer.kind]}</span>
              </button>
            ))}
          </div>

          {legendView !== null ? (
            <>
              <div className="mx-1 my-1.5 h-px bg-line" />
              <p className={PANEL_GROUP_LABEL}>图例</p>
              <div className="px-1.5 pb-0.5">
                <MapLegend view={legendView} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className={`relative ${FLOAT_BAR}`}>
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          aria-label="图层"
          className={`flex h-6 shrink-0 items-center gap-1 px-1.5 text-[12px] transition-colors ${ROUND_ITEM} ${
            open
              ? 'bg-[var(--oc-hover)] text-ink'
              : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
          }`}
        >
          <Layers size={13} strokeWidth={2} />
          图层
          <ChevronUp
            size={12}
            strokeWidth={2}
            className={`shrink-0 text-ink-faint transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {views.length > 0 ? (
          <>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />
            <div className="flex items-center gap-0.5 max-md:hidden">
              {views.map((view) => {
                const selected = activeView === view
                const Icon = MAP_VIEW_ICONS[view]
                return (
                  <button
                    key={view}
                    type="button"
                    onClick={() => onSelectView(view)}
                    disabled={busy}
                    aria-pressed={selected}
                    className={`flex h-6 shrink-0 items-center gap-1 px-1.5 text-[12px] transition-colors disabled:opacity-50 ${ROUND_ITEM} ${
                      selected
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    <Icon size={12} strokeWidth={2} className="shrink-0" />
                    {MAP_VIEW_LABELS[view]}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}

        {busy ? (
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress ?? 0) * 100)}
            className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 overflow-hidden rounded-full bg-line"
          >
            <span
              className="block h-full rounded-full bg-ink-muted transition-[width] duration-fast"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </span>
        ) : null}
      </div>

      {busy ? (
        <span className="sr-only" role="status">
          正在重画底图
        </span>
      ) : null}
    </div>
  )
}
