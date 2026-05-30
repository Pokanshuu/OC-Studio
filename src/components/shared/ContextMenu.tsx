'use client'

import { useState, useRef, useEffect, useCallback, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Separator } from '@/components/ui/separator'
import { adjustContextMenuPosition, adjustSubMenuPosition } from '@/lib/menu-utils'

interface ContextMenuProps {
  children: ReactNode
  items: ContextMenuItem[]
}

export interface ContextMenuItem {
  label: string
  shortcut?: string
  danger?: boolean
  onClick?: () => void
  separator?: boolean
  disabled?: boolean
  children?: ContextMenuItem[]
}

function SubMenu({ item, onCloseParent }: { item: ContextMenuItem; onCloseParent: () => void }) {
  const [subOpen, setSubOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const [subStyle, setSubStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    if (!subOpen) return

    const h = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      if (!closeTimeoutRef.current || !subRef.current) return
      const rect = subRef.current.getBoundingClientRect()
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      ) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
    }

    document.addEventListener('mousemove', h, true)
    return () => document.removeEventListener('mousemove', h, true)
  }, [subOpen])

  const handleMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    setSubOpen(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setSubOpen(false)
    }, 200)
  }, [])

  useLayoutEffect(() => {
    if (!subOpen || !itemRef.current || !subRef.current) return
    const parentRect = itemRef.current.getBoundingClientRect()
    const subRect = subRef.current.getBoundingClientRect()
    const offset = adjustSubMenuPosition(parentRect, subRect.width, subRect.height)
    setSubStyle({
      left: offset.xViewport,
      top: offset.yViewport,
    })
  }, [subOpen])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  const children = item.children ?? []

  return (
    <div>
      <button
        ref={itemRef}
        disabled={item.disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex w-full items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
          item.disabled ? 'text-ink-faint' : 'text-ink hover:bg-black/5 dark:hover:bg-white/5 dark:hover:bg-white/5'
        }`}
      >
        <span>{item.label}</span>
        <svg className="ml-auto h-3 w-3 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>

      {subOpen && children.length > 0
        ? createPortal(
            <div
              ref={subRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className="fixed z-50 ml-1 flex min-w-[140px] flex-col rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5 pointer-events-auto"
              style={subStyle}
            >
          {children.map((child, i) => {
            if (child.separator) {
              return <Separator key={i} className="my-1" />
            }
            return (
              <button
                key={i}
                disabled={child.disabled}
                onClick={() => {
                  child.onClick?.()
                  onCloseParent()
                }}
                className={`flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                  child.danger
                    ? 'text-error hover:bg-error-light dark:hover:bg-red-950/30'
                    : child.disabled
                      ? 'text-ink-faint'
                      : 'text-ink hover:bg-black/5 dark:hover:bg-white/5 dark:hover:bg-white/5'
                }`}
              >
                <span>{child.label}</span>
                {child.shortcut ? (
                  <span className="ml-auto text-xs text-ink-faint">{child.shortcut}</span>
                ) : null}
              </button>
            )
          })}
        </div>,
        document.getElementById('overlay-root')!,
      ) : null}
    </div>
  )
}

interface SelectionSnapshot {
  startContainer: Node | null
  startOffset: number
  endContainer: Node | null
  endOffset: number
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [adjPosition, setAdjPosition] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initialSelRef = useRef<SelectionSnapshot | null>(null)
  const openedAtRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const close = useCallback(() => {
    setVisible(false)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setOpen(false), 150)
  }, [])
  const closeImmediate = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpen(false)
    setVisible(false)
  }, [])

  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current) }
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (Date.now() < cooldownUntilRef.current) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      setPosition({ x: e.clientX, y: e.clientY })
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
    },
    [],
  )

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const adjusted = adjustContextMenuPosition(position.x, position.y, rect.width, rect.height)
    setAdjPosition(adjusted)
    setVisible(true)
  }, [open, position])

  const handleClickOutside = useCallback((e: PointerEvent) => {
    const target = e.target as Node
    const overlay = document.getElementById('overlay-root')
    if (menuRef.current && !menuRef.current.contains(target)) {
      if (overlay && overlay.contains(target)) return
      close()
    }
  }, [close])

  useEffect(() => {
    if (open) {
      document.addEventListener('pointerdown', handleClickOutside, true)
      return () => document.removeEventListener('pointerdown', handleClickOutside, true)
    }
  }, [open, handleClickOutside])

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
  }, [open, closeImmediate])

  return (
    <div onContextMenu={handleContextMenu}>
      {children}

      {open ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div
            ref={menuRef}
            className={`pointer-events-auto absolute flex flex-col rounded-md border border-line bg-paper/60 dark:bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5 context-menu-fade ${visible ? 'context-menu-visible' : ''}`}
            style={{
              left: adjPosition.x,
              top: adjPosition.y,
            }}
          >
            {items.map((item, i) => {
              if (item.separator) {
                return (
                  <Separator key={i} className="my-1" />
                )
              }

              if (item.children && item.children.length > 0) {
                return <SubMenu key={i} item={item} onCloseParent={close} />
              }

              return (
                <button
                  key={i}
                  onClick={() => {
                    item.onClick?.()
                    close()
                  }}
                  disabled={item.disabled}
                  className={`flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                    item.danger
                      ? 'text-error hover:bg-error-light dark:hover:bg-red-950/30'
                      : item.disabled
                        ? 'text-ink-faint'
                        : 'text-ink hover:bg-black/5 dark:hover:bg-white/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.shortcut ? (
                    <span className="ml-auto text-xs text-ink-faint">
                      {item.shortcut}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
