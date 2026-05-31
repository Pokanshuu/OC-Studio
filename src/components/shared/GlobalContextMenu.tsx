'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { tauriReadClipboard } from '@/lib/tauri-clipboard'
import { createPortal } from 'react-dom'
import { Separator } from '@/components/ui/separator'
import { adjustContextMenuPosition } from '@/lib/menu-utils'

interface SelectionSnapshot {
  startContainer: Node | null
  startOffset: number
  endContainer: Node | null
  endOffset: number
}

export function GlobalContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [adjPosition, setAdjPosition] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const initialSelRef = useRef<SelectionSnapshot | null>(null)
  const openedAtRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const openMenuAt = useCallback((target: HTMLElement, x: number, y: number) => {
    targetRef.current = target
    target.focus()
    setPosition({ x, y })
    setVisible(false)
    setOpen(true)

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0)
      initialSelRef.current = {
        startContainer: r.startContainer,
        startOffset: r.startOffset,
        endContainer: r.endContainer,
        endOffset: r.endOffset,
      }
    } else {
      initialSelRef.current = null
    }
    openedAtRef.current = Date.now()
  }, [])

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (Date.now() < cooldownUntilRef.current) {
      e.preventDefault()
      return
    }
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
    openMenuAt(target, e.clientX, e.clientY)
  }, [openMenuAt])

  useEffect(() => {
    if (!open || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const adjusted = adjustContextMenuPosition(position.x, position.y, rect.width, rect.height)
    setAdjPosition(adjusted)
    setVisible(true)
  }, [open, position])

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [handleContextMenu])

  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = () => {
      if (Date.now() - openedAtRef.current < 100) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      if (sel.rangeCount === 0 || !initialSelRef.current) return
      const r = sel.getRangeAt(0)
      const init = initialSelRef.current
      if (
        r.startContainer !== init.startContainer ||
        r.startOffset !== init.startOffset ||
        r.endContainer !== init.endContainer ||
        r.endOffset !== init.endOffset
      ) {
        if (cooldownUntilRef.current < Date.now()) {
          cooldownUntilRef.current = Date.now() + 300
        }
        closeImmediate()
      }
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [open])

  const close = () => {
    setVisible(false)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setOpen(false), 150)
  }
  const closeImmediate = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpen(false)
    setVisible(false)
  }

  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }
  }, [])

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

  const handlePaste = useCallback(async () => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
      try {
        const text = await tauriReadClipboard()
        const start = el.selectionStart ?? 0
        const end = el.selectionEnd ?? 0
        el.setRangeText(text, start, end, 'end')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      } catch { /* clipboard unavailable */ }
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
        className={`pointer-events-auto absolute flex flex-col rounded-md border border-line bg-paper/85 dark:bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 context-menu-fade ${visible ? 'context-menu-visible' : ''}`}
        style={{
          left: adjPosition.x,
          top: adjPosition.y,
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
