'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

export function SortSelect({
  sortKey,
  onChange,
  options,
}: {
  sortKey: string
  onChange: (key: string) => void
  options: SortOption[]
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 4 })
    }
  }, [open])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node
    const overlay = document.getElementById('overlay-root')
    if (triggerRef.current && !triggerRef.current.contains(target)) {
      if (panelRef.current && !panelRef.current.contains(target)) {
        if (overlay && overlay.contains(target)) return
        setOpen(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="flex md:h-9 h-7 items-center gap-1 rounded border border-line bg-paper-card/60 md:px-3 px-2 md:text-sm text-[11px] text-ink transition-colors hover:border-line-hover"
      >
        <span>{getSortLabel(options, sortKey)}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex flex-col rounded-md border border-line bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5 pointer-events-auto"
              style={{ left: pos.x, top: pos.y }}
            >
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
                      : 'text-ink hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>,
            document.getElementById('overlay-root')!,
          )
        : null}
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
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          viewMode === 'grid' ? 'text-ink bg-black/5 dark:bg-white/5' : 'text-ink-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5'
        }`}
        title="网格视图"
      >
        <LayoutGrid size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          viewMode === 'list' ? 'text-ink bg-black/5 dark:bg-white/5' : 'text-ink-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5'
        }`}
        title="列表视图"
      >
        <List size={16} strokeWidth={2} />
      </button>
    </>
  )
}
