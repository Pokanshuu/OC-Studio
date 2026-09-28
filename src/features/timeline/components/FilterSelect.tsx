'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { MENU } from '@/lib/ui-tokens'
import type { FilterOption } from '../types'

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: FilterOption[]
  placeholder: string
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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="touch-feedback flex h-7 items-center gap-1 px-2 text-[12px] text-ink transition-colors hover:bg-[var(--oc-hover)] md:h-8 md:px-2 md:text-[13px]"
      >
        <span className="max-w-[120px] truncate">{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
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
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                value === opt.value
                  ? 'bg-black/5 dark:bg-white/5 text-ink'
                  : 'text-ink hover:bg-[var(--oc-hover)]'
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



