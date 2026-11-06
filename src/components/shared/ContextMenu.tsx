'use client'

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { Separator } from '@/components/ui/separator'
import { MENU } from '@/lib/ui-tokens'
import { adjustContextMenuPosition } from '@/lib/menu-utils'
import { ContextMenuButton } from './context-menu/ContextMenuButton'
import { ContextSubMenu } from './context-menu/ContextSubMenu'
import type { ContextMenuProps, ContextMenuItem } from './context-menu/context-menu-types'

export type { ContextMenuItem, ContextMenuProps }

interface SelectionSnapshot {
  startContainer: Node | null
  startOffset: number
  endContainer: Node | null
  endOffset: number
}

/**
 * 右键菜单：长按/右键弹出，位置自动贴边；带子菜单；选区变化时自动收起。
 * 分层：`context-menu/`（`context-menu-types` · `ContextMenuButton` · `ContextSubMenu`）。
 *
 * 与 `menu/MenuSurface` 的边界：这里只服务编辑器正文 / 选区的右键 —— 子菜单要再 Portal 一层、
 * 选区一变就收、150ms 淡入淡出与冷却计时都在本文件里；按点击坐标弹出的通用菜单
 * （媒体 / 文件夹 / 边样式 / 图片 ⋯）一律走 `MenuSurface`，不要再复制这里的 effect。
 */
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
    if (menuRef.current && !menuRef.current.contains(target)) {
      /*
       * 子菜单 Portal 到 `#overlay-root`：点它不能先把父菜单关掉 ——
       * pointerdown 先于 click，父菜单一卸载，子菜单项的 click 就永远到不了。
       * **只放过子菜单**：以前这里放宽成「overlay-root 里的点击都算里面」，
       * 结果同样挂在 overlay-root 的浮层（灵感便签）里点空白处也收不掉菜单。
       */
      if (target instanceof Element && target.closest('[data-context-submenu]') !== null) return
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
            className={`pointer-events-auto absolute flex flex-col ${MENU} context-menu-fade ${visible ? 'context-menu-visible' : ''}`}
            style={{
              left: adjPosition.x,
              top: adjPosition.y,
            }}
          >
            {items.map((item, i) => {
              if (item.separator) {
                return (
                  <Separator key={i} className="mx-2 my-1" />
                )
              }

              if (item.children && item.children.length > 0) {
                return <ContextSubMenu key={i} item={item} onCloseParent={close} />
              }

              return (
                <ContextMenuButton key={i} item={item} onSelect={close} />
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
