'use client'

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Separator } from '@/components/ui/separator'
import { adjustSubMenuPosition } from '@/lib/menu-utils'
import { ContextMenuButton } from './ContextMenuButton'
import type { ContextMenuItem } from './context-menu-types'

/** 带子菜单的菜单项：悬停展开（移动出 200ms 后收起） */
export function ContextSubMenu({ item, onCloseParent }: { item: ContextMenuItem; onCloseParent: () => void }) {
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
        className={`flex w-full items-center gap-3 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
          item.disabled ? 'text-ink-faint' : 'text-ink hover:bg-[var(--oc-hover)]'
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
              className="fixed z-50 ml-1 flex min-w-[140px] flex-col border border-line bg-paper/85 p-1 shadow-none backdrop-blur-lg pointer-events-auto dark:bg-paper/85"
              style={subStyle}
            >
          {children.map((child, i) => {
            if (child.separator) {
              return <Separator key={i} className="my-1" />
            }
            return (
              <ContextMenuButton key={i} item={child} onSelect={onCloseParent} />
            )
          })}
        </div>,
        document.getElementById('overlay-root')!,
      ) : null}
    </div>
  )
}
