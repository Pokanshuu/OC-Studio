'use client'

import { Lock } from 'lucide-react'
import type { MapStats, MapView } from '../types'
import { BIOME_COLORS, BIOME_NAMES } from '../types'

interface MapLegendProps {
  view: MapView
  stats: MapStats | null
  onOpenAlgorithm: () => void
}

const ELEVATION_BANDS = [
  { label: '深海', color: '#1B3543' },
  { label: '浅海', color: '#4D7A88' },
  { label: '湖泊', color: '#4E949E' },
  { label: '海岸', color: '#D3C39D' },
  { label: '平原', color: '#5F7F58' },
  { label: '丘陵', color: '#6D8250' },
  { label: '高原', color: '#A98E62' },
  { label: '山地', color: '#8B8579' },
  { label: '雪线', color: '#E1DFD7' },
]

export function MapLegend({ view, stats, onOpenAlgorithm }: MapLegendProps) {
  const biomeRows = stats
    ? stats.biomeCounts
        .map((count, id) => ({ count, id }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count)
    : []
  const landCells = stats?.landCells ?? 1

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <p className="font-serif text-sm font-bold text-ink">图例</p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          {view === 'terrain'
            ? '地形着色 · 平原/丘陵/高原/山地/雪线 · 湖泊等深线'
            : view === 'contour'
              ? '等高线 · 可调间隔'
              : view === 'temperature'
                ? '年均温 · 纬度 + 海拔 + 大陆性'
                : view === 'moisture'
                  ? '有效湿度 · 盛行风 + 雨影'
                  : view === 'biome'
                    ? 'Whittaker 温度 × 湿度分类'
                    : view === 'political'
                      ? '国家 · 城市 · 国界'
                      : '沿线段采样 · 拖动地图重画'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {view === 'terrain' ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex h-4 overflow-hidden rounded-sm border border-line">
              {ELEVATION_BANDS.map((band) => (
                <span key={band.label} className="flex-1" style={{ background: band.color }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-muted">
              {ELEVATION_BANDS.map((band) => (
                <span key={band.label} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: band.color }} />
                  {band.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-ink-faint">
              右键空白处可圈地或标记城邦；右键已有标注可直接删除。
            </p>
          </div>
        ) : null}

        {view === 'contour' ? (
          <div className="flex flex-col gap-2 text-[11px] text-ink-muted">
            <div className="flex h-3 overflow-hidden rounded-sm border border-line">
              <span className="flex-1 bg-[#EAE7D3]" />
              <span className="flex-1 bg-[#DDD3B9]" />
              <span className="flex-1 bg-[#C9B994]" />
              <span className="flex-1 bg-[#B7A17A]" />
            </div>
            <div className="flex items-center justify-between text-[10px] text-ink-faint">
              <span>低</span>
              <span>高</span>
            </div>
            <p>等高线等宽 · 陡坡自动抽稀 · 深色海岸线</p>
            <p className="text-ink-faint">等高线由 Marching Squares 从高程场实时提取，不依赖任何在线底图。</p>
          </div>
        ) : null}

        {view === 'temperature' ? (
          <div className="flex flex-col gap-2">
            <div
              className="h-4 rounded-sm border border-line"
              style={{
                background:
                  'linear-gradient(90deg, #303D67 0%, #3C5884 16%, #60909E 34%, #98AE80 52%, #CEB569 70%, #C57752 86%, #99483D 100%)',
              }}
            />
            <div className="flex justify-between text-[10px] text-ink-faint">
              <span>-30°C</span>
              <span>0</span>
              <span>20</span>
              <span>42°C</span>
            </div>
            <p className="text-[11px] text-ink-muted">
              海洋按海表温度偏暖处理；陆地每升高 1km 降温约 6.5°C。
            </p>
          </div>
        ) : null}

        {view === 'moisture' ? (
          <div className="flex flex-col gap-2">
            <div
              className="h-4 rounded-sm border border-line"
              style={{
                background:
                  'linear-gradient(90deg, #C5B27C 0%, #B2A768 20%, #94A162 40%, #679160 60%, #417F6F 80%, #2E657E 100%)',
              }}
            />
            <div className="flex justify-between text-[10px] text-ink-faint">
              <span>干旱</span>
              <span>湿润</span>
            </div>
            <p className="text-[11px] text-ink-muted">
              水汽从海洋向内陆平流，遇到迎风坡抬升降雨，背风坡形成雨影。
            </p>
          </div>
        ) : null}

        {view === 'biome' ? (
          <div className="flex flex-col gap-1.5">
            {biomeRows.slice(0, 14).map((row) => (
              <div key={row.id} className="flex items-center gap-2 text-[11px]">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                  style={{ background: BIOME_COLORS[row.id] ?? '#ccc' }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-muted">
                  {BIOME_NAMES[row.id] ?? '未知'}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                  {row.id === 0 || row.id === 1
                    ? `${((row.count / (landCells + (stats?.oceanCells ?? 0))) * 100).toFixed(1)}%`
                    : `${((row.count / Math.max(1, landCells)) * 100).toFixed(1)}%`}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {view === 'profile' ? (
          <div className="flex flex-col gap-2 text-[11px] leading-5 text-ink-muted">
            <p>在剖面视图中按住鼠标中键拖动绘制剖面；左键拖动仍然平移地图。</p>
            <p>剖面沿线段双线性采样高程，底部色带来自生物群系分类。</p>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {[
                ['高山草甸', BIOME_COLORS[13]],
                ['温带森林', BIOME_COLORS[6]],
                ['热带雨林', BIOME_COLORS[12]],
                ['荒漠', BIOME_COLORS[9]],
                ['湖泊', BIOME_COLORS[1]],
                ['海洋', BIOME_COLORS[0]],
              ].map(([label, color]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
          <div>
            <p className="text-ink-faint">陆地</p>
            <p className="font-mono text-xs text-ink">
              {stats ? `${(stats.landRatio * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-ink-faint">最高峰</p>
            <p className="font-mono text-xs text-ink">
              {stats ? `${Math.round(stats.maxElevation).toLocaleString()} m` : '—'}
            </p>
          </div>
          <div>
            <p className="text-ink-faint">河道格</p>
            <p className="font-mono text-xs text-ink">
              {stats ? stats.riverCells.toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-ink-faint">湖泊</p>
            <p className="font-mono text-xs text-ink">
              {stats ? stats.lakeCount.toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-ink-faint">生物群系</p>
            <p className="font-mono text-xs text-ink">{stats ? stats.biomeCount : '—'}</p>
          </div>
          <div>
            <p className="text-ink-faint">平均降水</p>
            <p className="font-mono text-xs text-ink">
              {stats ? `${Math.round(stats.meanPrecipitation)} mm` : '—'}
            </p>
          </div>
        </div>
        <button
          onClick={onOpenAlgorithm}
          className="mt-3 w-full rounded border border-line px-2 py-1.5 text-left text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
        >
          查看生成管线与离线说明
        </button>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-ink-faint">
          <Lock size={11} strokeWidth={2} />
          全部计算在本机 Web Worker 内完成
        </p>
      </div>
    </div>
  )
}
