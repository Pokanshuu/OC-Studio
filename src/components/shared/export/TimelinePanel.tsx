'use client'

/**
 * 导出中心 · 时间线页签。
 *
 * 一张图 = 整条时间线（逐年排布，不聚合）：`features/timeline/export-timeline` 离线重绘，
 * 泳道、年份刻度、时期色板全部与页面同源。预览就是刚画出来的那张位图。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { getTimelineEvents } from '@/features/timeline/services'
import {
  renderTimelineCanvas,
  TIMELINE_DENSITY_OPTIONS,
  type TimelineExportDensity,
} from '@/features/timeline/export-timeline'
import type { TimelineEvent } from '@/features/timeline/types'
import type { Period } from '@/types'
import { db } from '@/lib/db'
import { downloadMediaFile } from '@/lib/media-download'
import { BTN_PRIMARY, INPUT_LINE, ROUND_CONTROL } from '@/lib/ui-tokens'
import { ExportRow, ExportSection, Segmented } from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

interface Figure {
  url: string
  width: number
  height: number
  events: number
  periods: number
  span: string
}

function stamp(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export function TimelinePanel() {
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [worldName, setWorldName] = useState('')
  const [density, setDensity] = useState<TimelineExportDensity>('normal')
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [loaded, setLoaded] = useState(false)
  const [figure, setFigure] = useState<Figure | null>(null)
  const [status, setStatus] = useState<'loading' | 'busy' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const defaultTitle = worldName === '' ? '时间线' : `${worldName} · 时间线`
  const title = titleOverride ?? defaultTitle

  useEffect(() => {
    void Promise.all([getTimelineEvents(), db.periods.toArray(), db.meta.get(1)])
      .then(([eventRows, periodRows, meta]) => {
        setEvents(eventRows)
        setPeriods(periodRows.filter((period) => !period.deleted))
        setWorldName((meta?.worldName ?? '').trim())
        setLoaded(true)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus('error')
        setLoaded(true)
      })
  }, [])

  useEffect(() => {
    if (!loaded) return
    let alive = true
    void (async () => {
      try {
        setStatus('busy')
        const canvas = await renderTimelineCanvas({ events, periods, title, density })
        if (!alive) return
        canvasRef.current = canvas
        const years = events
          .map((event) => Number(/^-?\d+/.exec(event.time)?.[0] ?? NaN))
          .filter((year) => Number.isFinite(year))
        const span =
          years.length > 0 ? `${Math.min(...years)} – ${Math.max(...years)}` : '—'
        setFigure({
          url: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
          events: events.filter((event) => /^-?\d+/.test(event.time)).length,
          periods: periods.length,
          span,
        })
        setError('')
        setStatus('ready')
      } catch (reason) {
        if (!alive) return
        canvasRef.current = null
        setFigure(null)
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [loaded, events, periods, title, density])

  const fileName = useMemo(() => `OC时间线-${stamp()}.png`, [])
  const sizeLabel = figure === null ? '—' : `${figure.width} × ${figure.height}`

  const exportPng = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (canvas === null || busy) return
    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob === null) throw new Error('生成图片失败')
      const saved = await downloadMediaFile(URL.createObjectURL(blob), fileName)
      if (saved === null) return
      toast.success('时间线已导出', { description: saved })
    } catch (reason) {
      toast.error('导出失败', {
        description: reason instanceof Error ? reason.message : String(reason),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ExportPanelLayout
      previewClassName="p-4"
      preview={
        <>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-[11px] text-ink-faint">
            <span className="truncate">
              {figure === null
                ? status === 'error'
                  ? error
                  : '正在生成…'
                : `${figure.events} 个事件 · ${figure.periods} 个时期 · ${figure.span}`}
            </span>
            <span className="shrink-0 tabular-nums">{sizeLabel}</span>
          </div>
          <div
            className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto border border-line p-2 bg-paper-alt ${ROUND_CONTROL}`}
          >
            {figure === null ? (
              <span className="max-w-full px-4 text-center text-[12px] text-ink-faint">
                {status === 'error' ? error : '正在生成…'}
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 预览的是刚生成好的位图，不走 next/image
              <img src={figure.url} alt="时间线预览" className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </>
      }
      config={
        <>
          <ExportSection title="图">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-ink-muted">标题</span>
              <input
                value={title}
                onChange={(event) => setTitleOverride(event.target.value)}
                maxLength={40}
                placeholder="时间线"
                className={`${INPUT_LINE} h-8`}
              />
            </label>
            <ExportRow label="浓度">
              <Segmented
                value={density}
                ariaLabel="时间线浓度"
                options={TIMELINE_DENSITY_OPTIONS}
                onChange={(value: TimelineExportDensity) => setDensity(value)}
              />
            </ExportRow>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              逐年排布，不聚成桶；太长的轴会压缩像素密度，保证事件都在这张图上。
            </p>
          </ExportSection>

          <ExportSection title="内容">
            <ExportRow label="跨度">
              <span className="tabular-nums text-[12px] text-ink">{figure?.span ?? '—'}</span>
            </ExportRow>
            <ExportRow label="事件">
              <span className="tabular-nums text-[12px] text-ink">{figure?.events ?? '—'}</span>
            </ExportRow>
            <ExportRow label="时期">
              <span className="tabular-nums text-[12px] text-ink">{figure?.periods ?? '—'}</span>
            </ExportRow>
          </ExportSection>
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">PNG · {sizeLabel}</span>
          <button
            type="button"
            onClick={() => void exportPng()}
            disabled={figure === null || busy}
            className={`${BTN_PRIMARY} ${figure === null || busy ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            {busy ? '正在导出…' : '导出 PNG'}
          </button>
        </>
      }
    />
  )
}
