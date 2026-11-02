'use client'

import type { ReactNode } from 'react'
import { Minus, Plus, Users, CalendarDays, Flag, Shapes, PlusCircle } from 'lucide-react'
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
  sections: Array<{ id: string; name: string }>
  hiddenSectionIds: Set<string>
  onToggleSection: (id: string) => void
  onCreateSection: () => void
}

function CategoryChip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] transition-all duration-150 active:rotate-3 active:scale-95 ${
        active
          ? 'border-line-hover bg-black/5 text-ink dark:bg-white/5'
          : 'border-transparent text-ink-faint hover:-translate-y-0.5 hover:border-line hover:text-ink-muted'
      }`}
    >
      {icon}
      <span className="max-w-[88px] truncate">{label}</span>
    </button>
  )
}

function RelationFilterButtons({
  showCharacters,
  showEvents,
  showCountries,
  onToggleCharacters,
  onToggleEvents,
  onToggleCountries,
  sections,
  hiddenSectionIds,
  onToggleSection,
  onCreateSection,
}: Omit<RelationControlsProps, 'zoom' | 'onZoomChange'>) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      <CategoryChip
        icon={<Users size={14} strokeWidth={2} />}
        label="角色"
        active={showCharacters}
        onClick={onToggleCharacters}
      />
      <CategoryChip
        icon={<CalendarDays size={14} strokeWidth={2} />}
        label="事件"
        active={showEvents}
        onClick={onToggleEvents}
      />
      <CategoryChip
        icon={<Flag size={14} strokeWidth={2} />}
        label="国家"
        active={showCountries}
        onClick={onToggleCountries}
      />
      {sections.map((section) => (
        <CategoryChip
          key={section.id}
          icon={<Shapes size={14} strokeWidth={2} />}
          label={section.name}
          active={!hiddenSectionIds.has(section.id)}
          onClick={() => onToggleSection(section.id)}
        />
      ))}
      <button
        onClick={onCreateSection}
        className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dashed border-line px-2 text-[11px] text-ink-faint transition-all duration-150 hover:-translate-y-0.5 hover:border-line-hover hover:text-ink active:rotate-3 active:scale-95"
      >
        <PlusCircle size={14} strokeWidth={2} />
        新建分类
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
    <div className="md:hidden fixed top-[calc(60px+var(--safe-top))] left-0 right-0 z-30 flex h-10 items-center justify-between border-b border-line/50 bg-paper-alt/85 px-4 backdrop-blur-lg">
      <RelationFilterButtons {...props} />
      <ZoomSlider zoom={props.zoom} onZoomChange={props.onZoomChange} />
    </div>
  )
}

export function DesktopRelationPanel(props: RelationControlsProps) {
  return (
    <Panel position="top-left" className="max-md:hidden flex max-w-[calc(100vw-2rem)] min-w-0 flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/85 px-3 py-2 m-3 backdrop-blur-lg">
      <RelationFilterButtons {...props} />
      <ZoomSlider zoom={props.zoom} onZoomChange={props.onZoomChange} />
    </Panel>
  )
}
