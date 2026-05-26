'use client'

import { Minus, Plus, Users, Calendar, Flag } from 'lucide-react'
import { Panel } from '@xyflow/react'

interface RelationControlsProps {
  showCharacters: boolean
  showEvents: boolean
  showCountries: boolean
  onToggleCharacters: () => void
  onToggleEvents: () => void
  onToggleCountries: () => void
  zoom: number
  onZoomChange: (value: number) => void
}

function RelationFilterButtons({
  showCharacters, showEvents, showCountries,
  onToggleCharacters, onToggleEvents, onToggleCountries,
}: Omit<RelationControlsProps, 'zoom' | 'onZoomChange'>) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onToggleCharacters}
        className={`flex items-center gap-1 md:px-2 px-1.5 md:py-0.5 py-0 rounded text-[11px] md:text-xs transition-colors h-7 md:h-auto ${
          showCharacters ? 'bg-paper-card border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <Users size={14} strokeWidth={2} />
        <span>角色</span>
      </button>
      <button
        onClick={onToggleEvents}
        className={`flex items-center gap-1 md:px-2 px-1.5 md:py-0.5 py-0 rounded text-[11px] md:text-xs transition-colors h-7 md:h-auto ${
          showEvents ? 'bg-paper-card border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <Calendar size={14} strokeWidth={2} />
        <span>事件</span>
      </button>
      <button
        onClick={onToggleCountries}
        className={`flex items-center gap-1 md:px-2 px-1.5 md:py-0.5 py-0 rounded text-[11px] md:text-xs transition-colors h-7 md:h-auto ${
          showCountries ? 'bg-paper-card border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <Flag size={14} strokeWidth={2} />
        <span>国家</span>
      </button>
    </div>
  )
}

function ZoomSlider({ zoom, onZoomChange }: { zoom: number; onZoomChange: (value: number) => void }) {
  const zoomValue = Math.round(zoom * 100)

  const handleZoom = (value: number) => {
    const clamped = Math.max(10, Math.min(200, value))
    onZoomChange(clamped)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleZoom(zoomValue - 10)}
        className="h-6 w-6 flex items-center justify-center rounded text-ink-faint hover:text-ink transition-colors"
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <input
        type="range"
        min={10}
        max={200}
        step={1}
        value={zoomValue}
        onChange={(e) => handleZoom(Number(e.target.value))}
        className="w-24 h-6 cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded [&::-webkit-slider-runnable-track]:bg-line
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted
          [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line
          [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded [&::-moz-range-track]:bg-line
          [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0"
      />
      <button
        onClick={() => handleZoom(zoomValue + 10)}
        className="h-6 w-6 flex items-center justify-center rounded text-ink-faint hover:text-ink transition-colors"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

export function MobileRelationControls(props: RelationControlsProps) {
  return (
    <div className="md:hidden fixed top-[60px] left-0 right-0 z-30 flex h-10 items-center justify-between border-b border-line/50 bg-paper-alt/80 px-4 backdrop-blur-md">
      <RelationFilterButtons {...props} />
      <ZoomSlider zoom={props.zoom} onZoomChange={props.onZoomChange} />
    </div>
  )
}

export function DesktopRelationPanel(props: RelationControlsProps) {
  return (
    <Panel position="top-left" className="max-md:hidden flex items-center gap-4 bg-paper/70 backdrop-blur-md border border-line rounded-md px-3 py-2 m-3">
      <RelationFilterButtons {...props} />
      <ZoomSlider zoom={props.zoom} onZoomChange={props.onZoomChange} />
    </Panel>
  )
}
