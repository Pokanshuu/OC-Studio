'use client'

import { Calendar, CornerDownRight, Flag, ImageDown, Minus, Plus, RefreshCw, Spline, Users } from 'lucide-react'
import { Panel } from '@xyflow/react'
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from '@/lib/edge-style'
import { MIN_ZOOM } from './relation-graph-utils'

interface RelationControlsProps {
  showCharacters: boolean
  showEvents: boolean
  showCountries: boolean
  onToggleCharacters: () => void
  onToggleEvents: () => void
  onToggleCountries: () => void
  zoom: number
  onZoomChange: (value: number) => void
  /** 重跑力导向布局（并把新坐标写回实体；桌面会带一次「撤销」） */
  onRelayout: () => void
  /** 当前边型（应用设置里的展示偏好） */
  edgeStyle: EdgeStyle
  onEdgeStyleChange: (value: EdgeStyle) => void
  /** 把当前整张图重绘成 PNG（桌面走保存对话框，浏览器走下载） */
  onExport: () => void
  exporting: boolean
  /** 把当前所有节点坐标批量写回实体（桌面工具栏；拖动本身已经逐点保存） */
  onSaveLayout: () => void
  savingLayout: boolean
}

type FilterProps = Pick<
  RelationControlsProps,
  | 'showCharacters'
  | 'showEvents'
  | 'showCountries'
  | 'onToggleCharacters'
  | 'onToggleEvents'
  | 'onToggleCountries'
>

function RelationFilterButtons({
  showCharacters, showEvents, showCountries,
  onToggleCharacters, onToggleEvents, onToggleCountries,
}: FilterProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onToggleCharacters}
        className={`flex items-center gap-1 md:px-2 px-1.5 md:py-0.5 py-0 rounded-item text-[11px] md:text-xs transition-colors h-7 md:h-auto ${
          showCharacters ? 'bg-[var(--oc-hover)] border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <Users size={14} strokeWidth={2} />
        <span>角色</span>
      </button>
      <button
        onClick={onToggleEvents}
        className={`flex items-center gap-1 md:px-2 px-1.5 md:py-0.5 py-0 rounded-item text-[11px] md:text-xs transition-colors h-7 md:h-auto ${
          showEvents ? 'bg-[var(--oc-hover)] border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <Calendar size={14} strokeWidth={2} />
        <span>事件</span>
      </button>
      <button
        onClick={onToggleCountries}
        className={`flex items-center gap-1 md:px-2 px-1.5 md:py-0.5 py-0 rounded-item text-[11px] md:text-xs transition-colors h-7 md:h-auto ${
          showCountries ? 'bg-[var(--oc-hover)] border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <Flag size={14} strokeWidth={2} />
        <span>国家</span>
      </button>
    </div>
  )
}

function ZoomSlider({
  zoom,
  onZoomChange,
  compact = false,
}: {
  zoom: number
  onZoomChange: (value: number) => void
  compact?: boolean
}) {
  const zoomValue = Math.round(zoom * 100)

  const handleZoom = (value: number) => {
    const min = Math.round(MIN_ZOOM * 100)
    const clamped = Math.max(min, Math.min(200, value))
    onZoomChange(clamped)
  }

  return (
    <div className="flex items-center gap-1">
      {compact ? null : (
        <button
          onClick={() => handleZoom(zoomValue - 10)}
          aria-label="缩小"
          className="h-6 w-6 flex items-center justify-center rounded-item text-ink-faint hover:text-ink transition-colors"
        >
          <Minus size={14} strokeWidth={2} />
        </button>
      )}
      <input
        type="range"
        aria-label="缩放"
        min={Math.round(MIN_ZOOM * 100)}
        max={200}
        step={1}
        value={zoomValue}
        onChange={(e) => handleZoom(Number(e.target.value))}
        className={`${compact ? 'w-16' : 'w-24'} h-6 cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted
          [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line
          [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line
          [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0`}
      />
      {compact ? null : (
        <button
          onClick={() => handleZoom(zoomValue + 10)}
          aria-label="放大"
          className="h-6 w-6 flex items-center justify-center rounded-item text-ink-faint hover:text-ink transition-colors"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

/** 桌面：正交 / 曲线两档文字切换（选中 = 浅底块，与筛选按钮同语法） */
function EdgeStyleSwitcher({ value, onChange }: { value: EdgeStyle; onChange: (v: EdgeStyle) => void }) {
  return (
    <div className="flex items-center gap-1">
      {EDGE_STYLE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`h-7 px-1.5 rounded-item text-[12px] transition-colors ${
            value === opt.value ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function MobileRelationControls(props: RelationControlsProps) {
  return (
    <div className="md:hidden fixed top-[calc(60px+var(--safe-top))] left-0 right-0 z-30 flex h-auto min-h-10 flex-wrap items-center justify-between gap-y-1 border-b border-line/50 bg-paper-alt/85 px-4 py-1 backdrop-blur-lg">
      <div className="flex items-center gap-1">
        <RelationFilterButtons {...props} />
        <button
          onClick={props.onRelayout}
          aria-label="重新布局"
          title="重新布局"
          className="flex h-7 w-7 items-center justify-center rounded-item text-ink-faint transition-colors hover:text-ink"
        >
          <RefreshCw size={14} strokeWidth={2} />
        </button>
        {/* 手机上一个图标按钮切边型（桌面用文字两档）：图标即当前线型 */}
        <button
          onClick={() => props.onEdgeStyleChange(props.edgeStyle === 'orthogonal' ? 'curve' : 'orthogonal')}
          aria-label={`连线样式：${props.edgeStyle === 'orthogonal' ? '正交' : '曲线'}`}
          title={`连线样式：${props.edgeStyle === 'orthogonal' ? '正交' : '曲线'}`}
          className={`flex h-7 w-7 items-center justify-center rounded-item transition-colors hover:text-ink ${
            props.edgeStyle === 'curve' ? 'text-ink' : 'text-ink-faint'
          }`}
        >
          {props.edgeStyle === 'curve' ? <Spline size={14} strokeWidth={2} /> : <CornerDownRight size={14} strokeWidth={2} />}
        </button>
        <button
          onClick={props.onExport}
          disabled={props.exporting}
          aria-label="导出 PNG"
          title="导出 PNG"
          className="flex h-7 w-7 items-center justify-center rounded-item text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
        >
          <ImageDown size={14} strokeWidth={2} />
        </button>
      </div>
      <ZoomSlider zoom={props.zoom} onZoomChange={props.onZoomChange} compact />
    </div>
  )
}

export function DesktopRelationPanel(props: RelationControlsProps) {
  return (
    <Panel position="top-left" className="max-md:hidden flex items-center gap-3 bg-paper/85 backdrop-blur-lg border border-line rounded-control px-3 py-2 m-3 float-shadow">
      <RelationFilterButtons {...props} />
      <ZoomSlider zoom={props.zoom} onZoomChange={props.onZoomChange} />
      <EdgeStyleSwitcher value={props.edgeStyle} onChange={props.onEdgeStyleChange} />
      <button
        onClick={props.onRelayout}
        aria-label="重新布局"
        title="重新布局"
        className="flex h-7 w-7 items-center justify-center rounded-item text-ink-faint transition-colors hover:text-ink md:h-6 md:w-6"
      >
        <RefreshCw size={14} strokeWidth={2} />
      </button>
      <button
        onClick={props.onSaveLayout}
        disabled={props.savingLayout}
        className="h-7 px-1.5 rounded-item text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
      >
        保存布局
      </button>
      <button
        onClick={props.onExport}
        disabled={props.exporting}
        aria-label="导出 PNG"
        title="导出 PNG"
        className="flex h-7 w-7 items-center justify-center rounded-item text-ink-faint transition-colors hover:text-ink disabled:opacity-40"
      >
        <ImageDown size={14} strokeWidth={2} />
      </button>
    </Panel>
  )
}
