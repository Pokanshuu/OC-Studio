'use client'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ActionItem {
  id: string
  label: string
  icon: ReactNode
  destructive?: boolean
  onPress: () => void
}

interface MobileActionSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  actions: ActionItem[]
}

export function MobileActionSheet({ open, onClose, title, actions }: MobileActionSheetProps) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      const timer = setTimeout(() => setMounted(false), 260)
      return () => clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 touch-none overscroll-none transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
    >
      <div className="absolute inset-0 bg-black/15" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute bottom-0 left-0 right-0 bg-paper/95 backdrop-blur-xl rounded-t-xl transition-transform duration-250 ease-out"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          paddingBottom: 'var(--safe-bottom, 0px)',
        }}
      >
        {title ? (
          <h3 className="text-sm font-medium text-ink text-center pt-4 pb-2 px-4 truncate">
            {title}
          </h3>
        ) : null}

        {actions.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onClose()
              item.onPress()
            }}
            className={`touch-feedback flex w-full items-center gap-3 px-5 py-3 text-left rounded-lg active:bg-black/5 dark:active:bg-white/5 ${
              item.destructive ? 'text-error' : 'text-ink'
            }`}
          >
            <span className={item.destructive ? 'text-error' : 'text-ink-muted'}>
              {item.icon}
            </span>
            <span className="text-sm">{item.label}</span>
          </button>
        ))}

        <button
          onClick={onClose}
          className="touch-feedback w-full py-3 text-center text-sm font-medium text-ink-muted rounded-lg active:bg-black/5 dark:active:bg-white/5"
        >
          取消
        </button>
      </div>
    </div>,
    document.getElementById('overlay-root')!,
  )
}
