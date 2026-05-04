'use client'

import { useState, useRef, useEffect } from 'react'
import { LayoutGrid, List, ChevronDown } from 'lucide-react'

export interface SortOption {
  label: string
  value: string
}

export type ViewMode = 'grid' | 'list'

const SORT_LABEL_MAP: Record<string, string> = {}

function getSortLabel(options: SortOption[], value: string): string {
  if (SORT_LABEL_MAP[value]) return SORT_LABEL_MAP[value]
  const found = options.find((o) => o.value === value)
  if (found) {
    SORT_LABEL_MAP[value] = found.label
  }
  return SORT_LABEL_MAP[value] ?? value
}

function SortSelect({
  sortKey,
  onChange,
  options,
}: {
  sortKey: string
  onChange: (key: string) => void
  options: SortOption[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1 rounded border border-line bg-paper-card px-3 text-sm text-ink transition-colors hover:border-line-hover"
      >
        <span>{getSortLabel(options, sortKey)}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 flex flex-col rounded-md border border-line bg-paper p-1 shadow-none ring-1 ring-black/5">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                sortKey === opt.value
                  ? 'bg-paper-card text-ink'
                  : 'text-ink hover:bg-paper-alt'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export interface SortViewControlsProps {
  sortKey: string
  onSortChange: (key: string) => void
  sortOptions: SortOption[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function SortViewControls({
  sortKey,
  onSortChange,
  sortOptions,
  viewMode,
  onViewModeChange,
}: SortViewControlsProps) {
  return (
    <>
      <SortSelect sortKey={sortKey} onChange={onSortChange} options={sortOptions} />
      <button
        onClick={() => onViewModeChange('grid')}
        className={`flex h-8 w-8 items-center justify-center transition-colors ${
          viewMode === 'grid' ? 'text-ink' : 'text-ink-muted hover:text-ink'
        }`}
        title="网格视图"
      >
        <LayoutGrid size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={`flex h-8 w-8 items-center justify-center transition-colors ${
          viewMode === 'list' ? 'text-ink' : 'text-ink-muted hover:text-ink'
        }`}
        title="列表视图"
      >
        <List size={16} strokeWidth={2} />
      </button>
    </>
  )
}
