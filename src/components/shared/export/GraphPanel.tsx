'use client'

/**
 * 导出中心 · 关系图页签。
 *
 * 三件事：把图读出来（**可以只挑几条**）、按当前坐标离线重绘成一张 PNG、把它卖出去。
 * 重绘用的是画布自己的渲染器（`features/relations/export-graph`），和页面里「导出图片」
 * 同一个实现 —— 导出的是收敛后的构图，不是屏幕截图，所以视口怎么滚都不影响。
 *
 * 「范围」是这个页签的重点：`buildGraphData()` 给的是整张图，但导出通常只要**某个人和他的关系**。
 * 选中若干实体后默认带上一度邻居（他的关系人 / 参与的事件 / 所属国家），
 * 边只保留一端落在选中集合里的那些 —— 子图才是能拿出去看的那张图。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Check } from 'lucide-react'
import { toast } from 'sonner'
import { buildGraphData } from '@/features/relations/services'
import { renderRelationGraphCanvas } from '@/features/relations/export-graph'
import { resolveGraphPositions } from '@/features/relations/layout'
import {
  DEFAULT_GRAPH_STYLE,
  GRAPH_NODE_OPTIONS,
  GRAPH_PADDING_OPTIONS,
  GRAPH_PAPER_OPTIONS,
  GRAPH_SCALE_OPTIONS,
  GRAPH_STYLE_OPTIONS,
  GRAPH_STYLE_PRESETS,
  GRAPH_WIDTH_OPTIONS,
  graphPresetIdOf,
  normalizeGraphStyle,
  type GraphExportStyle,
  type GraphNodeShape,
  type GraphPaper,
  type GraphStylePresetId,
} from '@/features/relations/export-options'
import type { GraphEdge, GraphNode, RelationNodeType } from '@/features/relations/types'
import { NODE_TYPE_LABELS, NODE_TYPE_ORDER } from '@/features/relations/components/node-type-icon'
import { EDGE_STYLE_OPTIONS, normalizeEdgeStyle, type EdgeStyle } from '@/lib/edge-style'
import { db } from '@/lib/db'
import { downloadMediaFile } from '@/lib/media-download'
import { useSettings } from '@/lib/settings'
import { BTN_PRIMARY, INPUT_LINE, ROUND_ITEM } from '@/lib/ui-tokens'
import { ExportRow, ExportSection, Segmented, Toggle } from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

interface Figure {
  url: string
  width: number
  height: number
  nodes: number
  edges: number
}

const TEXT_BTN = `h-6 shrink-0 px-1.5 text-[11px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink ${ROUND_ITEM}`

type TypeFilter = 'all' | RelationNodeType

/** 类型筛选与行内小标签都取关系图那张表（`node-type-icon`），导出面板里不另抄一份 */
const TYPE_FILTERS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  ...NODE_TYPE_ORDER.map((type) => ({ value: type, label: NODE_TYPE_LABELS[type] })),
]

function stamp(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function nodeTypeOf(node: GraphNode): RelationNodeType {
  const value = node.data?.entityType
  return value === 'event' || value === 'country' || value === 'world' ? value : 'character'
}

export function GraphPanel() {
  const { settings, updateSetting } = useSettings()
  // 标题默认跟着世界名走；用户改过就一直在用他改的那个（`null` = 还没改过）
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [worldName, setWorldName] = useState('')
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [style, setStyle] = useState<GraphExportStyle>(DEFAULT_GRAPH_STYLE)
  const [selected, setSelected] = useState<string[]>([])
  const [expand, setExpand] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
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
        const next = await buildGraphData()
        if (!alive) return
        setData(next)
      } catch (reason) {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setStatus('error')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /**
   * 选中的节点可能因为刷新 / 删条目而不在图里了 —— **不在 effect 里改 state**，
   * 而是在这里就地滤掉（派生态）。这样「刷新后选择自己变干净」，又不会多一轮渲染。
   */
  const liveSelected = useMemo(() => {
    if (data === null) return selected
    const ids = new Set(data.nodes.map((node) => node.id))
    return selected.filter((id) => ids.has(id))
  }, [data, selected])
  const chosenIds = useMemo(() => new Set(liveSelected), [liveSelected])

  /** 导出范围：没选就是整张图；选了就取「选中 + 一度邻居」，边只留沾着选中的那些 */
  const subset = useMemo(() => {
    if (data === null) return null
    if (liveSelected.length === 0) return { nodes: data.nodes, edges: data.edges }
    const keepNodes = new Set(chosenIds)
    if (expand) {
      for (const edge of data.edges) {
        if (chosenIds.has(edge.source)) keepNodes.add(edge.target)
        if (chosenIds.has(edge.target)) keepNodes.add(edge.source)
      }
    }
    const edges = data.edges.filter((edge) =>
      expand
        ? chosenIds.has(edge.source) || chosenIds.has(edge.target)
        : chosenIds.has(edge.source) && chosenIds.has(edge.target),
    )
    for (const edge of edges) {
      keepNodes.add(edge.source)
      keepNodes.add(edge.target)
    }
    return { nodes: data.nodes.filter((node) => keepNodes.has(node.id)), edges }
  }, [data, liveSelected, chosenIds, expand])

  /**
   * 没摆过的节点先补一份力导向 —— 与画布**同一个函数**（`layout.ts#resolveGraphPositions`）。
   * `buildGraphData()` 给没存过坐标的节点一律 `(0, 0)`，不补的话导出的就是「卡片全叠在
   * 原点、名字连成一串」。放在这里（而不是渲染器里）算，是为了让版式微调（纸面 / 线宽）
   * 不用把布局再跑一遍 —— 布局只跟 `subset` 有关。
   */
  const placed = useMemo(() => {
    if (subset === null) return null
    return { nodes: resolveGraphPositions(subset.nodes, subset.edges), edges: subset.edges }
  }, [subset])

  // 重画：参数每敲一个字都重画会卡（还要等图片解码），停 200ms 再画
  useEffect(() => {
    if (placed === null) return
    let alive = true
    const timer = window.setTimeout(() => {
      void (async () => {
        setStatus('busy')
        try {
          const canvas = await renderRelationGraphCanvas({
            nodes: placed.nodes,
            edges: placed.edges,
            edgeStyle,
            title: title.trim(),
            style,
          })
          if (!alive) return
          canvasRef.current = canvas
          setFigure({
            url: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
            nodes: placed.nodes.length,
            edges: placed.edges.length,
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
    }, 200)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [placed, edgeStyle, title, style])

  const patchStyle = (patch: Partial<GraphExportStyle>): void => {
    setStyle((current) => normalizeGraphStyle({ ...current, ...patch }))
  }

  const applyPreset = (id: GraphStylePresetId): void => {
    const preset = GRAPH_STYLE_PRESETS.find((item) => item.id === id)
    if (preset) setStyle(preset.style)
  }

  const activePreset = graphPresetIdOf(style)
  const presetHint = activePreset
    ? GRAPH_STYLE_PRESETS.find((preset) => preset.id === activePreset)?.hint ?? ''
    : '已微调'

  const typeCounts = useMemo(() => {
    const counts: Record<RelationNodeType, number> = { character: 0, event: 0, country: 0, world: 0 }
    for (const node of data?.nodes ?? []) counts[nodeTypeOf(node)] += 1
    return counts
  }, [data])

  const candidates = useMemo(() => {
    const rows = (data?.nodes ?? []).filter((node) => typeFilter === 'all' || nodeTypeOf(node) === typeFilter)
    const keyword = query.trim().toLowerCase()
    const matched = keyword === ''
      ? rows
      : rows.filter((node) => String(node.data?.label ?? '').toLowerCase().includes(keyword))
    return [...matched].sort((a, b) => {
      const order = NODE_TYPE_ORDER.indexOf(nodeTypeOf(a)) - NODE_TYPE_ORDER.indexOf(nodeTypeOf(b))
      if (order !== 0) return order
      return String(a.data?.label ?? '').localeCompare(String(b.data?.label ?? ''), 'zh-Hans-CN')
    })
  }, [data, query, typeFilter])

  const toggleNode = (id: string): void => {
    setSelected(chosenIds.has(id) ? liveSelected.filter((item) => item !== id) : [...liveSelected, id])
  }

  const selectVisible = (): void => {
    const next = new Set(liveSelected)
    for (const node of candidates) next.add(node.id)
    setSelected([...next])
  }

  const fileName = useMemo(() => `OC关系图-${stamp()}.png`, [])

  /**
   * 一个节点都没有时导出的是一张空图。与文档 / 时间线面板同一口径：没内容就不给导。
   * （只剩孤立节点也算有内容：用户可能就是要把「名单」导出成图。）
   */
  const isEmpty = figure !== null && figure.nodes === 0
  const exportDisabled = figure === null || busy || isEmpty

  const exportPng = async (): Promise<void> => {
    const canvas = canvasRef.current
    if (canvas === null || busy || isEmpty) return
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
  const pendingLabel = status === 'loading' ? '正在读取…' : '正在生成…'
  const scopeLabel =
    liveSelected.length === 0 ? '整张图' : expand ? `选中 ${liveSelected.length} 个 + 关系` : `选中 ${liveSelected.length} 个`

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
                  : pendingLabel
                : `${figure.nodes} 个节点 · ${figure.edges} 条连线`}
            </span>
            <span className="shrink-0 tabular-nums">{sizeLabel}</span>
          </div>
          <div
            className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto border border-line bg-paper-alt p-2 ${ROUND_ITEM}`}
          >
            {figure === null ? (
              <span className="text-[12px] text-ink-faint">{status === 'error' ? error : pendingLabel}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 预览的是刚生成好的位图，不走 next/image
              <img src={figure.url} alt="关系图预览" className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </>
      }
      config={
        <>
          <ExportSection title="版式">
            <Segmented
              value={(activePreset ?? '') as GraphStylePresetId}
              ariaLabel="版式"
              options={GRAPH_STYLE_OPTIONS}
              onChange={(value: GraphStylePresetId) => applyPreset(value)}
            />
            <p className="text-[11px] text-ink-faint">{presetHint}</p>
            <ExportRow label="纸面">
              <Segmented
                value={style.paper}
                ariaLabel="纸面"
                options={GRAPH_PAPER_OPTIONS}
                onChange={(value: GraphPaper) => patchStyle({ paper: value })}
              />
            </ExportRow>
            <ExportRow label="节点">
              <Segmented
                value={style.nodeShape}
                ariaLabel="节点"
                options={GRAPH_NODE_OPTIONS}
                onChange={(value: GraphNodeShape) => patchStyle({ nodeShape: value })}
              />
            </ExportRow>
            <ExportRow label="留白">
              <Segmented
                value={style.padding}
                ariaLabel="留白"
                options={GRAPH_PADDING_OPTIONS}
                onChange={(value: number) => patchStyle({ padding: value })}
              />
            </ExportRow>
            <ExportRow label="清晰度">
              <Segmented
                value={style.scale}
                ariaLabel="清晰度"
                options={GRAPH_SCALE_OPTIONS}
                onChange={(value: number) => patchStyle({ scale: value })}
              />
            </ExportRow>
          </ExportSection>

          <ExportSection title="连线">
            <ExportRow label="线型">
              <Segmented
                value={edgeStyle}
                ariaLabel="线型"
                options={EDGE_STYLE_OPTIONS}
                onChange={(value: EdgeStyle) => updateSetting('edgeStyle', value)}
              />
            </ExportRow>
            <ExportRow label="粗细">
              <Segmented
                value={style.edgeWidth}
                ariaLabel="线宽"
                options={GRAPH_WIDTH_OPTIONS}
                onChange={(value: number) => patchStyle({ edgeWidth: value })}
              />
            </ExportRow>
            <ExportRow label="关系名">
              <Toggle
                checked={style.edgeLabels}
                ariaLabel="画关系名"
                onChange={(next) => patchStyle({ edgeLabels: next })}
              />
            </ExportRow>
            <ExportRow label="单色">
              <Toggle
                checked={style.monochrome}
                ariaLabel="单色墨线"
                onChange={(next) => patchStyle({ monochrome: next })}
              />
            </ExportRow>
          </ExportSection>

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
            <ExportRow label="日期">
              <Toggle
                checked={style.showDate}
                ariaLabel="图上写导出日期"
                onChange={(next) => patchStyle({ showDate: next })}
              />
            </ExportRow>
          </ExportSection>

          <ExportSection title="范围">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-ink-faint">{scopeLabel}</span>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={selectVisible} className={TEXT_BTN}>
                  全选
                </button>
                <button type="button" onClick={() => setSelected([])} className={TEXT_BTN}>
                  清空
                </button>
              </div>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名字"
              className={`${INPUT_LINE} h-8`}
            />
            <div className="flex flex-wrap items-center gap-0.5">
              {TYPE_FILTERS.map((option) => {
                const active = typeFilter === option.value
                const count = option.value === 'all' ? data?.nodes.length ?? 0 : typeCounts[option.value]
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTypeFilter(option.value)}
                    className={`${ROUND_ITEM} h-6 px-1.5 text-[11px] tabular-nums transition-colors ${
                      active
                        ? 'bg-ink font-medium text-paper'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    {option.label}
                    <span className="ml-1 text-ink-faint">{count}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="px-1.5 py-2 text-[11px] text-ink-faint">
                  {status === 'loading' ? '正在读取…' : '没有匹配的实体'}
                </p>
              ) : (
                candidates.map((node) => {
                  const on = chosenIds.has(node.id)
                  return (
                    <button
                      key={node.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleNode(node.id)}
                      className={`flex h-7 shrink-0 items-center gap-1.5 px-1.5 text-left transition-colors ${ROUND_ITEM} ${
                        on ? 'text-ink' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${ROUND_ITEM} ${
                          on ? 'border-ink text-ink' : 'border-line text-transparent'
                        }`}
                      >
                        <Check size={10} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px]">{String(node.data?.label ?? '')}</span>
                      <span className="shrink-0 text-[10px] text-ink-faint">{NODE_TYPE_LABELS[nodeTypeOf(node)]}</span>
                    </button>
                  )
                })
              )}
            </div>
            <ExportRow label="带上一度关系">
              <Toggle
                checked={expand}
                ariaLabel="带上选中实体的一度关系"
                onChange={(next) => setExpand(next)}
              />
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
            disabled={exportDisabled}
            className={`${BTN_PRIMARY} ${exportDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            {busy ? '正在导出…' : '导出 PNG'}
          </button>
        </>
      }
    />
  )
}
