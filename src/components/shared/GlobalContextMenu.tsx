'use client'

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import { readClipboardText } from '@/lib/clipboard-read'
import { toast } from 'sonner'
import { PointMenu, type PointMenuItem } from './menu/PointMenu'

interface InputMenuContextValue {
  openMenuAt: (target: HTMLElement, x: number, y: number) => void
}

const InputMenuContext = createContext<InputMenuContextValue | null>(null)

export function useInputMenuContext() {
  return useContext(InputMenuContext)
}

interface SelectionSnapshot {
  startContainer: Node | null
  startOffset: number
  endContainer: Node | null
  endOffset: number
}

/**
 * 输入框 / textarea 的右键菜单（剪切 / 复制 / 粘贴 / 全选）。
 *
 * 两件事归这里，别的都归 `PointMenu`（Base UI Menu + 虚拟锚点）：
 * - **拦截系统右键菜单**：非文本区一律 `preventDefault`（WebView 的「刷新 / 另存为 / 检查」
 *   既用不上也不属于这套界面语言），文本区换成应用自己的菜单；
 * - 编辑器正文（`.ProseMirror`）放行给 `ContextMenu`。
 *
 * 菜单动作自己在执行前把焦点还给输入框（`execCommand` 作用在聚焦元素上）。
 */
export function GlobalContextMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const targetRef = useRef<HTMLElement | null>(null)
  const initialSelRef = useRef<SelectionSnapshot | null>(null)
  const openedAtRef = useRef(0)
  const cooldownUntilRef = useRef(0)

  const openMenuAt = useCallback((target: HTMLElement, x: number, y: number) => {
    targetRef.current = target
    target.focus()
    // 坐标在「打开」的同一次更新里量好，不会先在左上角闪一帧
    setPosition({ x, y })
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

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      if (Date.now() < cooldownUntilRef.current) {
        e.preventDefault()
        return
      }
      const target = e.target as HTMLElement
      if (target.closest?.('.ProseMirror')) return

      const isEditableEl =
        target instanceof HTMLInputElement
          ? !['radio', 'checkbox', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color'].includes(
              target.type,
            )
          : target instanceof HTMLTextAreaElement || target.isContentEditable

      if (!isEditableEl) {
        // 非文本区一律吃掉系统菜单：关掉后右键在这些区域就是「没反应」，
        // 需要菜单的地方自有应用的右键菜单接手。
        e.preventDefault()
        return
      }

      e.preventDefault()
      openMenuAt(target, e.clientX, e.clientY)
    },
    [openMenuAt],
  )

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [handleContextMenu])

  const close = useCallback(() => setOpen(false), [])

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
        // 选区已经变了：立刻收（不等淡出）
        setOpen(false)
      }
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [open])

  const handleCut = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
    }
    try {
      document.execCommand('cut')
    } catch {
      /* 浏览器拒绝就什么都不做（与原生菜单一致） */
    }
  }, [])

  const handleCopy = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
    }
    try {
      document.execCommand('copy')
    } catch {
      /* 同上 */
    }
  }, [])

  const handlePaste = useCallback(async () => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
      const text = await readClipboardText()
      if (text === null) {
        // 以前这里是静默的：点了「粘贴」输入框毫无变化，像坏了一样
        toast('读不到剪贴板', { description: '可以直接用 Ctrl+V 粘贴' })
      } else if (text !== '') {
        const start = el.selectionStart ?? 0
        const end = el.selectionEnd ?? 0
        el.setRangeText(text, start, end, 'end')
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  }, [])

  const handleSelectAll = useCallback(() => {
    const el = targetRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select()
    } else {
      try {
        document.execCommand('selectAll')
      } catch {
        /* 同上 */
      }
    }
  }, [])

  const items: PointMenuItem[] = [
    { label: '剪切', shortcut: 'Ctrl+X', onSelect: handleCut },
    { label: '复制', shortcut: 'Ctrl+C', onSelect: handleCopy },
    { label: '粘贴', shortcut: 'Ctrl+V', onSelect: () => void handlePaste() },
    { separator: true },
    { label: '全选', shortcut: 'Ctrl+A', onSelect: handleSelectAll },
  ]

  const contextValue: InputMenuContextValue = { openMenuAt }

  return (
    <InputMenuContext.Provider value={contextValue}>
      {children}
      {open ? (
        <PointMenu at={position} items={items} onClose={close} minWidth={160} ariaLabel="编辑菜单" />
      ) : null}
    </InputMenuContext.Provider>
  )
}
