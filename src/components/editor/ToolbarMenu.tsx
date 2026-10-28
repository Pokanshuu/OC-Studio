'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { MENU, MENU_GROUP_LABEL, MENU_ITEM_BASE } from '@/lib/ui-tokens'
import { cn } from '@/lib/utils'

export interface ToolbarMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  active?: boolean
  onClick: () => void
}

export interface ToolbarMenuGroup {
  label?: string
  items: ToolbarMenuItem[]
}

interface ToolbarMenuProps {
  anchor: HTMLElement
  groups: ToolbarMenuGroup[]
  onClose: () => void
}

/**
 * 工具栏的下拉 / 溢出菜单。
 *
 * - 容器 `MENU`（py-1、无左右内边距）+ 行 `MENU_ITEM_BASE`（px-3），hover 横向铺满；
 * - 挂在 `#overlay-root` 上，必须自带 `pointer-events-auto`（根节点是 none）；
 * - 点外 / Esc 关闭；点击触发按钮本身不关闭。
 */
export function ToolbarMenu({ anchor, groups, onClose }: ToolbarMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return
      if (ref.current?.contains(e.target) || anchor.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  const rect = anchor.getBoundingClientRect()
  const width = 236
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
  const top = rect.bottom + 4
  const maxHeight = Math.max(160, window.innerHeight - top - 8)

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={cn('fixed z-[80] overflow-y-auto', MENU, 'pointer-events-auto')}
      style={{ left, top, width, maxHeight }}
    >
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? <div className={MENU_GROUP_LABEL}>{group.label}</div> : null}
          {group.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                item.onClick()
                onClose()
              }}
              className={cn(
                MENU_ITEM_BASE,
                'text-ink hover:bg-[var(--oc-hover)]',
                item.active && 'bg-[var(--oc-hover)]',
              )}
            >
              {item.icon ? <span className="shrink-0 text-ink-muted">{item.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              {item.shortcut ? <span className="shrink-0 text-[11px] text-ink-faint">{item.shortcut}</span> : null}
              {item.active ? <Check size={13} strokeWidth={2} className="shrink-0 text-ink-muted" /> : null}
            </button>
          ))}
        </div>
      ))}
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}
