'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Separator } from '@/components/ui/separator'
import { adjustContextMenuPosition } from '@/lib/menu-utils'

export function GlobalContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [adjPosition, setAdjPosition] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest?.('.ProseMirror')) return

    const isEditable = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target.isContentEditable

    if (!isEditable) {
      e.preventDefault()
      return
    }

    e.preventDefault()
    targetRef.current = target
    target.focus()
    setPosition({ x: e.clientX, y: e.clientY })
    setVisible(false)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const adjusted = adjustContextMenuPosition(position.x, position.y, rect.width, rect.height)
    setAdjPosition(adjusted)
    setVisible(true)
  }, [open, position])

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [handleContextMenu])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setVisible(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const close = () => { setOpen(false); setVisible(false) }

  const handleCut = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
    }
    try { document.execCommand('cut') } catch { /* */ }
    close()
  }, [])

  const handleCopy = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
    }
    try { document.execCommand('copy') } catch { /* */ }
    close()
  }, [])

  const handlePaste = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
    }
    close()
  }, [])

  const handleSelectAll = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select()
    } else {
      try { document.execCommand('selectAll') } catch { /* */ }
    }
    close()
  }, [])

  const menuEl = open ? (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div
        ref={menuRef}
        className="pointer-events-auto absolute flex flex-col rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5"
        style={{
          left: adjPosition.x,
          top: adjPosition.y,
          visibility: visible ? 'visible' : 'hidden',
        }}
      >
        <button onClick={handleCut} className="flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5">
          <span>剪切</span>
          <span className="ml-auto text-xs text-ink-faint">Ctrl+X</span>
        </button>
        <button onClick={handleCopy} className="flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5">
          <span>复制</span>
          <span className="ml-auto text-xs text-ink-faint">Ctrl+C</span>
        </button>
        <button onClick={handlePaste} className="flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5">
          <span>粘贴</span>
          <span className="ml-auto text-xs text-ink-faint">Ctrl+V</span>
        </button>
        <Separator className="my-1" />
        <button onClick={handleSelectAll} className="flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm text-ink hover:bg-black/5 dark:hover:bg-white/5">
          <span>全选</span>
          <span className="ml-auto text-xs text-ink-faint">Ctrl+A</span>
        </button>
      </div>
    </div>
  ) : null

  return (
    <>
      {children}
      {open ? createPortal(menuEl, document.getElementById('overlay-root')!) : null}
    </>
  )
}
