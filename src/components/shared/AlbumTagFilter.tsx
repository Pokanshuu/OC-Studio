'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { MENU } from '@/lib/ui-tokens'

export interface TagOption {
  value: number | 'all'
  label: string
}

/** 标签筛选下拉（触发按钮 + portal 到 #overlay-root 的面板） */
export function TagFilterSelect({
  value,
  onChange,
  options,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: TagOption[]
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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '全部标签'

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="touch-feedback flex h-8 items-center gap-1 px-2 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className={`fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto ${MENU} pointer-events-auto`}
              style={{ left: pos.x, top: pos.y }}
            >
              {options.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={`whitespace-nowrap px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    value === opt.value
                      ? 'bg-[var(--oc-hover)] text-ink'
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
