'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export interface CountryOption {
  value: number | 'all'
  label: string
}

/** 国家筛选下拉（触发按钮 + portal 到 #overlay-root 的面板） */
export function CountryFilterSelect({
  value,
  onChange,
  options,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: CountryOption[]
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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? '全部国家'

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="touch-feedback flex md:h-9 h-7 items-center gap-1 px-2 text-[11px] text-ink transition-colors hover:bg-[var(--oc-hover)] md:px-3 md:text-[13px]"
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto border border-line bg-paper/85 backdrop-blur-lg p-1 shadow-none pointer-events-auto"
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
                  : 'text-ink hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]'
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
