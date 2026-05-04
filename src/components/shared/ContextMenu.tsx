'use client'

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'

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

function SubMenu({ item }: { item: ContextMenuItem }) {
  const [subOpen, setSubOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    }, 150)
  }, [])

  const handleItemClick = useCallback(() => {
    setSubOpen(false)
  }, [])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  const children = item.children ?? []

  return (
    <div className="relative">
      <button
        ref={itemRef}
        disabled={item.disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex w-full items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
          item.disabled ? 'text-ink-faint' : 'text-ink hover:bg-paper-alt'
        }`}
      >
        <span>{item.label}</span>
        <svg className="ml-auto h-3 w-3 text-ink-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>

      {subOpen && children.length > 0 ? (
        <div
          ref={subRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="absolute left-full top-0 z-50 ml-1 flex min-w-[140px] flex-col rounded-md border border-line bg-paper p-1 shadow-none ring-1 ring-black/5"
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
                  handleItemClick()
                }}
                className={`flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                  child.danger
                    ? 'text-error hover:bg-error-light'
                    : child.disabled
                      ? 'text-ink-faint'
                      : 'text-ink hover:bg-paper-alt'
                }`}
              >
                <span>{child.label}</span>
                {child.shortcut ? (
                  <span className="ml-auto text-xs text-ink-faint">{child.shortcut}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setPosition({ x: e.clientX, y: e.clientY })
      setOpen(true)
    },
    [],
  )

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  return (
    <div onContextMenu={handleContextMenu}>
      {children}

      {open ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <div
            ref={menuRef}
            className="pointer-events-auto absolute flex flex-col rounded-md border border-line bg-paper p-1 shadow-none ring-1 ring-black/5"
            style={{ left: position.x, top: position.y }}
          >
            {items.map((item, i) => {
              if (item.separator) {
                return (
                  <Separator key={i} className="my-1" />
                )
              }

              if (item.children && item.children.length > 0) {
                return <SubMenu key={i} item={item} />
              }

              return (
                <button
                  key={i}
                  onClick={() => {
                    item.onClick?.()
                    setOpen(false)
                  }}
                  disabled={item.disabled}
                  className={`flex items-center gap-4 rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                    item.danger
                      ? 'text-error hover:bg-error-light'
                      : item.disabled
                        ? 'text-ink-faint'
                        : 'text-ink hover:bg-paper-alt'
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
