'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, LayoutGrid, List } from 'lucide-react'
import { FILTER_TRIGGER, MENU, MENU_ITEM_BASE, ROUND_ITEM } from '@/lib/ui-tokens'

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
        className={FILTER_TRIGGER}
      >
        <span>{getSortLabel(options, sortKey)}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className={`fixed z-30 mt-1 flex flex-col ${MENU} pointer-events-auto`}
              style={{ left: pos.x, top: pos.y }}
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`${MENU_ITEM_BASE} ${
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
      {/* 视图切换：图标（画廊 / 目录），当前项用墨色，另一项淡出 */}
      <div className="flex items-center">
        <button
          onClick={() => onViewModeChange('grid')}
          aria-label="画廊视图"
          title="画廊"
          className={`flex h-8 w-8 items-center justify-center ${ROUND_ITEM} transition-colors ${
            viewMode === 'grid' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
          }`}
        >
          <LayoutGrid size={16} strokeWidth={2} />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          aria-label="目录视图"
          title="目录"
          className={`flex h-8 w-8 items-center justify-center ${ROUND_ITEM} transition-colors ${
            viewMode === 'list' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
          }`}
        >
          <List size={16} strokeWidth={2} />
        </button>
      </div>
    </>
  )
}
