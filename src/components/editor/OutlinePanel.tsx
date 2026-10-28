'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { X } from 'lucide-react'
import { ICON_BTN_MD, PANEL, ROUND_ITEM } from '@/lib/ui-tokens'

interface OutlineHeading {
  pos: number
  level: number
  text: string
}

function collectHeadings(editor: Editor): OutlineHeading[] {
  const headings: OutlineHeading[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const text = node.textContent.trim()
    if (!text) return
    headings.push({ pos, level: Number(node.attrs.level) || 1, text })
  })
  return headings
}

function activeHeadingIndex(headings: OutlineHeading[], from: number): number {
  let active = -1
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].pos <= from) active = i
    else break
  }
  return active
}

interface OutlinePanelProps {
  editor: Editor
  onClose: () => void
}

/**
 * 大纲浮层：按标题抓取，点一行跳到对应标题；当前光标所在章节高亮。
 * 与查找浮条一样挂在 `#overlay-root`，必须自带 `pointer-events-auto`。
 */
export function OutlinePanel({ editor, onClose }: OutlinePanelProps) {
  const { headings, active } = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const list = collectHeadings(current)
      return { headings: list, active: activeHeadingIndex(list, current.state.selection.from) }
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const go = (pos: number) => {
    const dom = editor.view.nodeDOM(pos)
    editor.chain().focus().setTextSelection(pos + 1).run()
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return createPortal(
    <div className={`fixed right-4 top-32 z-[60] flex max-h-[60vh] w-60 flex-col overflow-hidden ${PANEL} pointer-events-auto`}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line pl-3 pr-1">
        <span className="text-[11px] tracking-[0.06em] text-ink-faint">大纲</span>
        <button type="button" onClick={onClose} aria-label="关闭大纲" className={ICON_BTN_MD}>
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {headings.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-ink-faint">暂无标题</p>
        ) : (
          headings.map((heading, index) => (
            <button
              key={heading.pos}
              type="button"
              onClick={() => go(heading.pos)}
              title={heading.text}
              className={`flex w-full items-center ${ROUND_ITEM} py-1 pr-2 text-left text-[13px] transition-colors ${
                index === active
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
              }`}
              style={{ paddingLeft: 8 + (heading.level - 1) * 10 }}
            >
              <span className={`truncate ${heading.level === 1 ? 'font-medium' : ''}`}>{heading.text}</span>
            </button>
          ))
        )}
      </div>
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}
