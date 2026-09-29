'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export interface FilterOption {
  value: number | 'all'
  label: string
}

interface FilterSelectProps {
  value: number | 'all'
  onChange: (value: number | 'all') => void
  options: FilterOption[]
  /** 找不到当前项时的兜底文案（通常是「全部 XX」） */
  fallbackLabel: string
  /** 触发按钮类名（各调用点样式不同，从这里传） */
  triggerClassName: string
  panelClassName?: string
  itemClassName?: string
  /** 当前项的高亮类名 */
  activeItemClassName?: string
  chevronSize?: number
  /** 面板最小高度保护（用于 max-h-64 这类滚动） */
  maxHeightClassName?: string
}

/**
 * 通用筛选下拉：触发按钮 + portal 到 `#overlay-root` 的面板 + 点外部关闭。
 * 样式由调用点传入（各列表页的触发按钮/面板密度不同），行为只有这一份实现。
 */
export function FilterSelect({
  value,
  onChange,
  options,
  fallbackLabel,
  triggerClassName,
  panelClassName = 'fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto border border-line bg-paper/85 backdrop-blur-lg p-1 pointer-events-auto',
  itemClassName = 'whitespace-nowrap px-2.5 py-1.5 text-left text-[13px] transition-colors',
  activeItemClassName = 'bg-[var(--oc-hover)] text-ink',
  chevronSize = 14,
  maxHeightClassName = 'max-h-64',
}: FilterSelectProps) {
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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? fallbackLabel

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={triggerClassName}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={chevronSize} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className={`${panelClassName} ${maxHeightClassName}`}
              style={{ left: pos.x, top: pos.y }}
            >
              {options.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`${itemClassName} ${value === opt.value ? activeItemClassName : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'}`}
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
