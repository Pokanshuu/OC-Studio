'use client'

/**
 * 导出中心 · 关系图页签。
 *
 * 只管三件事：把图读出来、按当前坐标**离线重绘**成一张 PNG、把它卖出去。
 * 重绘用的是画布自己的渲染器（`features/relations/export-graph`），和编辑器里
 * 「导出图片」同一个实现 —— 导出的是收敛后的构图，不是屏幕截图，所以视口怎么滚都不影响。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { buildGraphData } from '@/features/relations/services'
import { renderRelationGraphCanvas } from '@/features/relations/export-graph'
import { EDGE_STYLE_OPTIONS, normalizeEdgeStyle, type EdgeStyle } from '@/lib/edge-style'
import { db } from '@/lib/db'
import { downloadMediaFile } from '@/lib/media-download'
import { useSettings } from '@/lib/settings'
import { BTN_PRIMARY, INPUT_LINE, ROUND_CONTROL } from '@/lib/ui-tokens'
import { ExportRow, ExportSection, Segmented } from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

interface Figure {
  url: string
  width: number
  height: number
  nodes: number
  edges: number
}

function stamp(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

export function GraphPanel() {
  const { settings, updateSetting } = useSettings()
  // 标题默认跟着世界名走；用户改过就一直在用他改的那个（`null` = 还没改过）
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [worldName, setWorldName] = useState('')
  const [figure, setFigure] = useState<Figure | null>(null)
  const [status, setStatus] = useState<'loading' | 'busy' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const edgeStyle = normalizeEdgeStyle(settings.edgeStyle)
  const defaultTitle = worldName === '' ? '关系图' : `${worldName} · 关系图`
  const title = titleOverride ?? defaultTitle

  useEffect(() => {
    void db.meta
      .get(1)
      .then((meta) => setWorldName((meta?.worldName ?? '').trim()))
      .catch(() => setWorldName(''))
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await buildGraphData()
        if (!alive) return
        // 重画可能有点慢（大图），先让界面知道在算 —— 放在 await 之后，不在 effect 体里同步 setState
        setStatus('busy')
        const canvas = await renderRelationGraphCanvas({
          nodes: data.nodes,
          edges: data.edges,
          edgeStyle,
          title: title.trim(),
        })
        if (!alive) return
        canvasRef.current = canvas
        setFigure({
          url: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
          nodes: data.nodes.length,
          edges: data.edges.length,
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
  }, [edgeStyle, title])

  const changedEdgeStyle = edgeStyle !== settings.edgeStyle

  const fileName = useMemo(() => `OC关系图-${stamp()}.png`, [])

  const exportPng = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (canvas === null || busy) return
    setBusy(true)
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob === null) throw new Error('生成图片失败')
      const saved = await downloadMediaFile(URL.createObjectURL(blob), fileName)
      // 用户取消保存对话框：不弹「已导出」
      if (saved === null) return
      toast.success('关系图已导出', { description: saved })
    } catch (reason) {
      toast.error('导出失败', {
        description: reason instanceof Error ? reason.message : String(reason),
      })
    } finally {
      setBusy(false)
    }
  }

  const sizeLabel = figure === null ? '—' : `${figure.width} × ${figure.height}`

  return (
    <ExportPanelLayout
      previewClassName="p-4"
      preview={
        <>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-[11px] text-ink-faint">
            <span className="truncate">
              {figure === null ? (status === 'error' ? error : '正在生成…') : `${figure.nodes} 个节点 · ${figure.edges} 条连线`}
            </span>
            <span className="shrink-0 tabular-nums">{sizeLabel}</span>
          </div>
          <div
            className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 ${ROUND_CONTROL} border border-line bg-paper-alt`}
          >
            {figure === null ? (
              <span className="text-[12px] text-ink-faint">{status === 'error' ? error : '正在生成…'}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 预览的是刚生成好的位图，不走 next/image
              <img src={figure.url} alt="关系图预览" className="max-h-full max-w-full object-contain" />
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
                placeholder="关系图"
                className={`${INPUT_LINE} h-8`}
              />
            </label>
            <ExportRow label="线型">
              <Segmented
                value={edgeStyle}
                ariaLabel="线型"
                options={EDGE_STYLE_OPTIONS}
                onChange={(value: EdgeStyle) => updateSetting('edgeStyle', value)}
              />
            </ExportRow>
            {changedEdgeStyle ? (
              <p className="text-[11px] text-ink-faint">线型已改，与设置里的默认值不一致</p>
            ) : null}
          </ExportSection>

          <ExportSection title="内容">
            <ExportRow label="节点">
              <span className="tabular-nums text-[12px] text-ink">{figure?.nodes ?? '—'}</span>
            </ExportRow>
            <ExportRow label="连线">
              <span className="tabular-nums text-[12px] text-ink">{figure?.edges ?? '—'}</span>
            </ExportRow>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              按画布上的坐标重绘，只含当前导出范围内的角色 / 事件 / 国家 / 词条。
            </p>
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
