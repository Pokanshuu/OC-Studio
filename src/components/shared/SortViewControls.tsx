'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

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
        className="touch-feedback flex h-7 md:h-8 items-center gap-1 px-2 text-[11px] text-ink transition-colors hover:bg-[var(--oc-hover)] md:text-[13px]"
      >
        <span>{getSortLabel(options, sortKey)}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex flex-col border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none pointer-events-auto"
              style={{ left: pos.x, top: pos.y }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    sortKey === opt.value
                      ? 'text-ink bg-[var(--oc-hover)]'
                      : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
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
      {/* 文字切换（替代图标）：默认画廊 */}
      <div className="-mx-1.5 flex items-center gap-1">
        <button
          onClick={() => onViewModeChange('grid')}
          className={`h-8 px-1.5 text-[13px] transition-colors ${
            viewMode === 'grid' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
          }`}
        >
          画廊
        </button>
        <span className="text-[13px] text-ink-faint/50">/</span>
        <button
          onClick={() => onViewModeChange('list')}
          className={`h-8 px-1.5 text-[13px] transition-colors ${
            viewMode === 'list' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
          }`}
        >
          目录
        </button>
      </div>
    </>
  )
}
