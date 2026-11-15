'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { PointMenu, type PointMenuItem } from './menu/PointMenu'
import type { ContextMenuProps, ContextMenuItem } from './context-menu/context-menu-types'

export type { ContextMenuItem, ContextMenuProps }

interface SelectionSnapshot {
  startContainer: Node | null
  startOffset: number
  endContainer: Node | null
  endOffset: number
}

/** 调用点的 `ContextMenuItem[]` → `PointMenu` 的 items（`onClick` → `onSelect`、`children` → `submenu`） */
function toPointItems(items: ContextMenuItem[]): PointMenuItem[] {
  return items.map((item) =>
    item.separator
      ? { separator: true }
      : {
          label: item.label,
          shortcut: item.shortcut,
          danger: item.danger,
          disabled: item.disabled,
          onSelect: item.onClick,
          submenu: item.children && item.children.length > 0 ? toPointItems(item.children) : undefined,
        },
  )
}

/**
 * 右键菜单：长按/右键弹出，位置自动贴边；带子菜单；选区变化时自动收起。
 *
 * 布局 / 键盘 / 子菜单 / 点外关闭都归 `PointMenu`（Base UI Menu + 虚拟锚点）——
 * 子菜单现在能键盘进（→ / ← / Esc 逐层关 / Enter 确认）。
 * 这个文件只剩**编辑器右键特有的行为**：选区快照与「选区一变就收」的 100 / 300ms 冷却。
 */
export function ContextMenu({ children, items }: ContextMenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const initialSelRef = useRef<SelectionSnapshot | null>(null)
  const openedAtRef = useRef(0)
  const cooldownUntilRef = useRef(0)

  /** 淡出由 PointMenu 负责，它播完才回调这里 */
  const close = useCallback(() => setOpen(false), [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (Date.now() < cooldownUntilRef.current) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    // 坐标在「打开」的同一次更新里量好，不会先在左上角闪一帧
    setPosition({ x: e.clientX, y: e.clientY })
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
        // 选区已经变了：立刻收（不等淡出，菜单不该停在旧选区旁边）
        setOpen(false)
      }
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [open])

  return (
    <div onContextMenu={handleContextMenu}>
      {children}

      {open ? (
        <PointMenu at={position} items={toPointItems(items)} onClose={close} minWidth={160} ariaLabel="右键菜单" />
      ) : null}
    </div>
  )
}
