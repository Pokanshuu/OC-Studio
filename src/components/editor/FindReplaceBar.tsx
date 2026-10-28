'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { CaseSensitive, ChevronDown, ChevronUp, X } from 'lucide-react'
import { BTN_PRIMARY, BTN_QUIET, ICON_BTN_MD, INPUT_LINE, PANEL } from '@/lib/ui-tokens'
import { findMatches, nextMatchIndex, replaceAllMatches, replaceMatch, selectMatch } from './find-replace'

interface FindReplaceBarProps {
  editor: Editor
  onClose: () => void
}

/**
 * 查找替换浮条。
 *
 * 打开时若编辑器有选区，预填 ≤200 字的选区文本；Enter/Shift+Enter 在匹配间移动；
 * Esc 关闭。浮条挂在 `#overlay-root` 上，必须自带 `pointer-events-auto`。
 */
export function FindReplaceBar({ editor, onClose }: FindReplaceBarProps) {
  const [query, setQuery] = useState(() => {
    const { from, to, empty } = editor.state.selection
    if (empty) return ''
    const text = editor.state.doc.textBetween(from, to, '\n')
    return text.length <= 200 ? text : ''
  })
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [index, setIndex] = useState(0)
  const [version, setVersion] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    findInputRef.current?.focus()
    findInputRef.current?.select()
  }, [])

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1)
    editor.on('update', bump)
    return () => {
      editor.off('update', bump)
    }
  }, [editor])

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

  const matches = useMemo(
    () => findMatches(editor.state.doc, query, caseSensitive),
    // 文档每次事务都会换新对象；用 version 触发重算，避免把 doc 放进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, query, caseSensitive, version],
  )

  const safeIndex = matches.length ? Math.min(index, matches.length - 1) : 0
  const current = matches[safeIndex]

  const select = (next: number) => {
    const match = matches[next]
    if (!match) return
    setIndex(next)
    selectMatch(editor, match)
  }

  const step = (delta: number) => {
    if (!matches.length) return
    select((safeIndex + delta + matches.length) % matches.length)
  }

  const replaceOne = () => {
    if (!current) return
    const from = current.from
    replaceMatch(editor, current, replacement)
    const rest = findMatches(editor.state.doc, query, caseSensitive)
    if (!rest.length) {
      setIndex(0)
      return
    }
    let next = rest.findIndex((m) => m.from >= from)
    if (next < 0) next = nextMatchIndex(rest, from)
    setIndex(next)
    selectMatch(editor, rest[next])
  }

  const replaceAll = () => {
    if (!matches.length) return
    replaceAllMatches(editor, query, caseSensitive, replacement)
    setIndex(0)
  }

  const keepFindShortcut = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && ['f', 'h'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      findInputRef.current?.focus()
      findInputRef.current?.select()
    }
  }

  return createPortal(
    <div
      className={`fixed left-1/2 top-24 z-[60] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 ${PANEL} pointer-events-auto p-3`}
      role="search"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={findInputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            keepFindShortcut(e)
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            }
          }}
          placeholder="查找"
          aria-label="查找"
          className={`${INPUT_LINE} h-8 min-w-0 flex-1`}
        />
        <span className="w-12 shrink-0 text-center text-[11px] tabular-nums text-ink-muted">
          {matches.length ? `${safeIndex + 1}/${matches.length}` : '0/0'}
        </span>
        <button
          type="button"
          title="上一个 (Shift+Enter)"
          aria-label="上一个"
          className={ICON_BTN_MD}
          onClick={() => step(-1)}
        >
          <ChevronUp size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          title="下一个 (Enter)"
          aria-label="下一个"
          className={ICON_BTN_MD}
          onClick={() => step(1)}
        >
          <ChevronDown size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          title="区分大小写"
          aria-label="区分大小写"
          aria-pressed={caseSensitive}
          className={`${ICON_BTN_MD} ${caseSensitive ? 'bg-[var(--oc-hover)] text-ink' : ''}`}
          onClick={() => {
            setCaseSensitive((v) => !v)
            setIndex(0)
          }}
        >
          <CaseSensitive size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          title="关闭 (Esc)"
          aria-label="关闭查找"
          className={ICON_BTN_MD}
          onClick={onClose}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2">
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            keepFindShortcut(e)
            if (e.key === 'Enter') {
              e.preventDefault()
              replaceOne()
            }
          }}
          placeholder="替换为"
          aria-label="替换为"
          className={`${INPUT_LINE} h-8 min-w-0 flex-1`}
        />
        <button type="button" className={`${BTN_QUIET} disabled:opacity-40`} disabled={!current} onClick={replaceOne}>
          替换
        </button>
        <button type="button" className={`${BTN_PRIMARY} px-3`} disabled={!matches.length} onClick={replaceAll}>
          全部替换
        </button>
      </div>
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}
