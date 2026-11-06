'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, GalleryHorizontalEnd, LayoutGrid, List } from 'lucide-react'
import { FILTER_TRIGGER, MENU, MENU_ITEM_BASE, ROUND_ITEM } from '@/lib/ui-tokens'

export interface SortOption {
  label: string
  value: string
}

/**
 * 三种视图（三种列表页共用，偏好各存各的 key）：
 * - `grid`    卡片：封面卡网格
 * - `gallery` 画廊：一排封面左右翻页（Cover Flow）
 * - `list`    列表：目录行
 */
export type ViewMode = 'grid' | 'gallery' | 'list'

/** localStorage 里可能是旧值 / 脏值，读出来一律过这一道 */
export function normalizeViewMode(raw: unknown): ViewMode {
  return raw === 'gallery' || raw === 'list' ? raw : 'grid'
}

function getSortLabel(options: SortOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value
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

  // 位置必须和「打开」在同一次更新里算好：先按 (0,0) 渲染、再在 effect 里量真实坐标，
  // 面板会先在左上角画一帧再跳回来（下拉「闪现再归位」）。
  const toggle = useCallback(() => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ x: rect.left, y: rect.bottom + 4 })
    setOpen(true)
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
        onClick={toggle}
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

/** 视图切换：卡片 / 画廊 / 列表，当前项用墨色，其余淡出 */
export function ViewToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  return (
    <div className="flex items-center">
      <button
        onClick={() => onViewModeChange('grid')}
        aria-label="卡片视图"
        title="卡片"
        className={`flex h-8 w-8 items-center justify-center ${ROUND_ITEM} transition-colors ${
          viewMode === 'grid' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <LayoutGrid size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('gallery')}
        aria-label="画廊视图"
        title="画廊"
        className={`flex h-8 w-8 items-center justify-center ${ROUND_ITEM} transition-colors ${
          viewMode === 'gallery' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <GalleryHorizontalEnd size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => onViewModeChange('list')}
        aria-label="列表视图"
        title="列表"
        className={`flex h-8 w-8 items-center justify-center ${ROUND_ITEM} transition-colors ${
          viewMode === 'list' ? 'text-ink' : 'text-ink-faint hover:text-ink-muted'
        }`}
      >
        <List size={16} strokeWidth={2} />
      </button>
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
      <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
    </>
  )
}
