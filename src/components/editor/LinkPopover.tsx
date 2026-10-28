'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { safeHref } from '@/lib/safe-href'
import { BTN_PRIMARY, BTN_QUIET, INPUT_LINE, PANEL } from '@/lib/ui-tokens'

interface LinkPopoverProps {
  editor: Editor
  /** 气泡菜单按钮；从快捷键打开时为 null（按选区定位）。 */
  anchor: HTMLElement | null
  onClose: () => void
}

/**
 * 链接编辑浮层：气泡菜单的「链接」按钮打开。
 *
 * 只写 `href`：Markdown 桥不承载 link 的 title，给了也会在往返时丢掉。
 * URL 走 `safeHref` 白名单；Tauri 里的点击由 `EditorCore` 的 handleClick 交给系统。
 */
export function LinkPopover({ editor, anchor, onClose }: LinkPopoverProps) {
  const existing = String(editor.getAttributes('link').href ?? '')
  const [url, setUrl] = useState(existing)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return
      if (boxRef.current?.contains(e.target) || anchor?.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [anchor, onClose])

  const apply = () => {
    const value = url.trim()
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      onClose()
      return
    }
    const safe = safeHref(value)
    if (!safe) {
      setError('只支持 http(s)、mailto、tel')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run()
    onClose()
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }

  const rect = anchor
    ? anchor.getBoundingClientRect()
    : (() => {
        try {
          const coords = editor.view.coordsAtPos(editor.state.selection.from)
          return { left: coords.left, top: coords.top, bottom: coords.bottom }
        } catch {
          return { left: window.innerWidth / 2, top: 96, bottom: 120 }
        }
      })()

  const width = 330
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
  const top = rect.bottom + 6 + 48 > window.innerHeight ? Math.max(8, rect.top - 56) : rect.bottom + 6

  return createPortal(
    <div
      ref={boxRef}
      className={`fixed z-[70] flex w-[min(330px,calc(100vw-32px))] flex-col gap-1 ${PANEL} pointer-events-auto p-2`}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={url}
          placeholder="https://…"
          aria-label="链接地址"
          onChange={(e) => {
            setUrl(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            }
          }}
          className={`${INPUT_LINE} h-8 min-w-0 flex-1`}
        />
        {existing ? (
          <button type="button" className={BTN_QUIET} onClick={remove}>
            移除
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} onClick={apply}>
          确定
        </button>
      </div>
      {error ? <span className="px-1 text-[11px] text-error">{error}</span> : null}
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}
