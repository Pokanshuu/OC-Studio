'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Scissors, Copy, ClipboardPaste, CheckSquare, Image, Table, Link2, Code2, Minus, Plus, Trash2 } from 'lucide-react'
import { useDevice } from '@/lib/use-device'
import { useActiveEditor } from '@/lib/editor-context'
import { useKeyboard } from '@/lib/KeyboardContext'
import { MobileActionSheet } from './MobileActionSheet'
import type { ActionItem } from './MobileActionSheet'

const TOOLBAR_H = 40
const GAP = 12
const FLIP_ZONE = 100

type EditorMode = 'idle' | 'caret' | 'selection' | 'selection-dragging' | 'action-sheet'

function isEditable(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement
    || el instanceof HTMLTextAreaElement
    || el.isContentEditable
}

function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max) }

type AnchorRect = { x: number; y: number; h: number }

function inputAnchorRect(el: HTMLInputElement): AnchorRect {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top, h: r.height }
}

function textareaAnchorRect(el: HTMLTextAreaElement): AnchorRect | null {
  const pos = el.selectionStart
  if (pos === null) return null
  const cs = getComputedStyle(el)
  const rect = el.getBoundingClientRect()

  const mirror = document.createElement('div')
  const s = mirror.style
  s.position = 'fixed'
  s.top = `${rect.top}px`
  s.left = `${rect.left}px`
  s.width = `${rect.width}px`
  s.font = cs.font
  s.lineHeight = cs.lineHeight
  s.letterSpacing = cs.letterSpacing
  s.whiteSpace = 'pre-wrap'
  s.overflowWrap = 'break-word'
  s.paddingTop = cs.paddingTop
  s.paddingLeft = cs.paddingLeft
  s.paddingRight = cs.paddingRight
  s.borderTopWidth = cs.borderTopWidth
  s.borderLeftWidth = cs.borderLeftWidth
  s.visibility = 'hidden'
  s.pointerEvents = 'none'

  mirror.textContent = el.value.substring(0, pos)
  const marker = document.createElement('span')
  marker.textContent = '|'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const markerRect = marker.getBoundingClientRect()
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
  document.body.removeChild(mirror)

  return {
    x: markerRect.left + markerRect.width / 2,
    y: markerRect.top - el.scrollTop,
    h: lineH,
  }
}

function proseMirrorAnchorRect(): AnchorRect | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  if (sel.isCollapsed) {
    try {
      const range = new Range()
      range.setStart(sel.focusNode!, sel.focusOffset)
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return null
      return { x: rect.left + rect.width / 2, y: rect.top, h: rect.height }
    } catch { return null }
  }
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  return rect.width === 0 && rect.height === 0 ? null : { x: rect.left + rect.width / 2, y: rect.top, h: rect.height }
}

function getAnchorRect(el: HTMLElement): AnchorRect | null {
  if (el instanceof HTMLInputElement) return inputAnchorRect(el)
  if (el instanceof HTMLTextAreaElement) return textareaAnchorRect(el)
  if (el.isContentEditable) return proseMirrorAnchorRect()
  return null
}

function getActiveEditable(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || !isEditable(el)) return null
  return el
}

export function MobileTextSelectionBar() {
  const { isMobile } = useDevice()
  const { activeEditor } = useActiveEditor()
  const keyboard = useKeyboard()

  const [mode, setMode] = useState<EditorMode>('idle')
  const [position, setPosition] = useState({ x: 0, y: 0, flip: false })
  const [mounted, setMounted] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const [inTable, setInTable] = useState(false)

  const modeRef = useRef<EditorMode>('idle')
  const barRef = useRef<HTMLDivElement>(null)
  const editableRef = useRef<HTMLElement | null>(null)
  const lastChangeRef = useRef(0)
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressNextFocusRef = useRef(false)
  const mountedRef = useRef(false)
  const rafRef = useRef(0)
  const modeBeforeRef = useRef<EditorMode>('idle')
  const actionTakenRef = useRef(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const transition = useCallback((next: EditorMode) => {
    modeRef.current = next
    setMode(next)
  }, [])

  const recalcPosition = useCallback(() => {
    const el = editableRef.current
    if (!el) return
    const anchor = getAnchorRect(el)
    if (!anchor) return
    const vw = window.visualViewport?.width ?? window.innerWidth
    const vh = document.documentElement.clientHeight
    const visualTop = window.visualViewport?.offsetTop ?? 0
    const topY = anchor.y + visualTop - TOOLBAR_H - GAP
    const bottomY = anchor.y + anchor.h + visualTop + GAP
    const topOverflow = anchor.y + visualTop < FLIP_ZONE
    const bottomOverflow = anchor.y + anchor.h + visualTop + TOOLBAR_H + GAP > vh
    const flip = topOverflow && !bottomOverflow
    const y = flip ? bottomY : topY
    const barW = barRef.current?.offsetWidth ?? 150
    const halfBar = barW / 2
    const x = clamp(anchor.x, halfBar + 8, vw - halfBar - 8)
    setPosition({ x, y, flip })
  }, [])

  const enter = useCallback((next: EditorMode) => {
    const el = getActiveEditable()
    if (!el) return
    editableRef.current = el
    const editorDom = activeEditor?.view.dom
    const isPM = editorDom ? editorDom.contains(el) : false
    const tableResult = isPM && (
      activeEditor!.isActive('table') ||
      activeEditor!.isActive('tableCell') ||
      activeEditor!.isActive('tableHeader')
    )
    setInTable(tableResult)
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    mountedRef.current = true
    recalcPosition()
    setMounted(true)
    transition(next)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBarVisible(true)
        // 键盘弹出后 visualViewport 可能已变化，补一次位置计算
        recalcPosition()
        setTimeout(() => recalcPosition(), 200)
      })
    })
  }, [activeEditor, recalcPosition, transition])

  const dismiss = useCallback(() => {
    mountedRef.current = false
    setBarVisible(false)
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null
      setMounted(false)
      editableRef.current = null
      actionTakenRef.current = false
    }, 200)
  }, [])

  const goIdle = useCallback(() => {
    dismiss()
    transition('idle')
  }, [dismiss, transition])

  // table detection follows editor selection
  useEffect(() => {
    if (!activeEditor || !isMobile) return
    const update = () => {
      if (editableRef.current !== activeEditor.view.dom) return
      setInTable(
        activeEditor.isActive('table') ||
        activeEditor.isActive('tableCell') ||
        activeEditor.isActive('tableHeader')
      )
    }
    activeEditor.on('selectionUpdate', update)
    activeEditor.on('transaction', update)
    return () => {
      activeEditor.off('selectionUpdate', update)
      activeEditor.off('transaction', update)
    }
  }, [activeEditor, isMobile])

  // focusin
  useEffect(() => {
    if (!isMobile) return
    const handler = () => {
      setTimeout(() => {
        const el = getActiveEditable()
        if (!el) return

        // table detection on focus
        if (el === activeEditor?.view.dom) {
          setInTable(
            activeEditor.isActive('table') ||
            activeEditor.isActive('tableCell') ||
            activeEditor.isActive('tableHeader')
          )
        }

        if (suppressNextFocusRef.current) {
          suppressNextFocusRef.current = false
          return
        }

        if (modeRef.current === 'idle') {
          const sel = window.getSelection()
          const collapsed = !sel || sel.isCollapsed
          if (collapsed) {
            enter('caret')
          } else {
            enter('selection')
          }
        }
      }, 150)
    }
    document.addEventListener('focusin', handler)
    return () => document.removeEventListener('focusin', handler)
  }, [isMobile, activeEditor, enter, recalcPosition, transition])

  // selectionchange
  useEffect(() => {
    if (!isMobile) return
    const handler = () => {
      const now = performance.now()
      const dt = now - lastChangeRef.current
      lastChangeRef.current = now

      if (dt < 80) {
        if (modeRef.current === 'selection') {
          setBarVisible(false)
          transition('selection-dragging')
        }
      }

      if (dragTimerRef.current) clearTimeout(dragTimerRef.current)
      dragTimerRef.current = setTimeout(() => {
        const sel = window.getSelection()
        const el = editableRef.current
        const isNative = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        const collapsed = isNative
          ? el.selectionStart === el.selectionEnd
          : !sel || sel.isCollapsed
        if (collapsed) {
          if (modeRef.current === 'selection' || modeRef.current === 'selection-dragging') {
            goIdle()
          }
          if (modeRef.current === 'caret') recalcPosition()
          return
        }
        // non-collapsed
        if (modeRef.current === 'selection-dragging') {
          transition('selection')
          setBarVisible(true)
        } else if ((modeRef.current === 'caret' || modeRef.current === 'idle') && mountedRef.current) {
          enter('selection')
        }
        recalcPosition()
      }, dt < 80 ? 150 : 0)
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [isMobile, enter, goIdle, recalcPosition, transition])

  // contextmenu (long press)
  useEffect(() => {
    if (!isMobile) return
    const handler = (e: MouseEvent) => {
      if (modeRef.current === 'action-sheet') return
      const target = e.target as HTMLElement
      if (!isEditable(target)) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      const sel = window.getSelection()
      const collapsed = !sel || sel.isCollapsed
      const editorDom = activeEditor?.view.dom
      const isPM = editorDom ? editorDom.contains(target) : false
      editableRef.current = isPM ? editorDom! : target
      const tableResult = isPM && (
        activeEditor!.isActive('table') ||
        activeEditor!.isActive('tableCell') ||
        activeEditor!.isActive('tableHeader')
      )
      setInTable(tableResult)
      recalcPosition()
      setMounted(true)
      transition(collapsed ? 'caret' : 'selection')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setBarVisible(true))
      })
    }
    window.addEventListener('contextmenu', handler, true)
    return () => window.removeEventListener('contextmenu', handler, true)
  }, [isMobile, activeEditor, recalcPosition, transition])

  // focusout
  useEffect(() => {
    if (!isMobile) return
    const handler = (e: FocusEvent) => {
      if (modeRef.current === 'action-sheet') return
      const target = e.target as HTMLElement
      if (!isEditable(target)) return
      const related = e.relatedTarget as HTMLElement | null
      if (related && barRef.current?.contains(related)) return
      goIdle()
    }
    document.addEventListener('focusout', handler)
    return () => document.removeEventListener('focusout', handler)
  }, [isMobile, goIdle])

  // tap outside dismiss
  useEffect(() => {
    if (!mounted) return
    const handler = (e: PointerEvent) => {
      if (modeRef.current === 'action-sheet') return
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        goIdle()
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [mounted, goIdle])

  // scroll / resize / visualViewport → unified recalcPosition
  // listeners attached unconditionally (not gated on mounted) to avoid
  // missing keyboard-triggered viewport changes that fire before React commits
  useEffect(() => {
    if (!isMobile) return
    const update = () => {
      if (!mountedRef.current) return
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(recalcPosition)
    }
    const scroller = document.querySelector('.section-fade')
    scroller?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(rafRef.current)
      scroller?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [isMobile, recalcPosition])

  // keyboard show/hide via Capacitor Keyboard plugin
  // visualViewport events don't fire reliably on Android WebView
  useEffect(() => {
    if (!mountedRef.current) return
    requestAnimationFrame(recalcPosition)
  }, [keyboard.visible, recalcPosition])

  // cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  // ── actions ──

  const focusEditable = useCallback(() => {
    editableRef.current?.focus()
  }, [])

  const dispatch = useCallback((name: string) => {
    const dom = editableRef.current === activeEditor?.view.dom
      ? activeEditor.view.dom
      : editableRef.current
    dom?.dispatchEvent(new CustomEvent(name, { bubbles: true }))
  }, [activeEditor])

  const handleCut = useCallback(() => {
    suppressNextFocusRef.current = true
    focusEditable()
    try { document.execCommand('cut') } catch { /* */ }
    goIdle()
  }, [focusEditable, goIdle])

  const handleCopy = useCallback(() => {
    suppressNextFocusRef.current = true
    focusEditable()
    try { document.execCommand('copy') } catch { /* */ }
    goIdle()
  }, [focusEditable, goIdle])

  const handlePaste = useCallback(async () => {
    suppressNextFocusRef.current = true
    const el = editableRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus()
      try {
        const text = await navigator.clipboard.readText()
        const start = el.selectionStart ?? 0
        const end = el.selectionEnd ?? 0
        el.setRangeText(text, start, end, 'end')
      } catch { /* clipboard unavailable */ }
      goIdle()
      return
    }
    focusEditable()
    try { document.execCommand('paste') } catch { /* */ }
    goIdle()
  }, [focusEditable, goIdle])

  const handleSelectAll = useCallback(() => {
    const el = editableRef.current
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select()
    } else {
      activeEditor?.commands.selectAll()
    }
    // selectionchange will transition to 'selection'
  }, [activeEditor])

  const openActionSheet = useCallback(() => {
    modeBeforeRef.current = modeRef.current
    editableRef.current?.blur()
    transition('action-sheet')
    setBarVisible(false)
  }, [transition])

  const closeActionSheet = useCallback(() => {
    queueMicrotask(() => {
      if (actionTakenRef.current) {
        actionTakenRef.current = false
        dismiss()
      } else {
        suppressNextFocusRef.current = true
      }
      transition('idle')
    })
  }, [dismiss, transition])

  // ── action items ──

  const clipboardActions: ActionItem[] = [
    { id: 'cut', label: '剪切', icon: <Scissors size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handleCut() } },
    { id: 'copy', label: '复制', icon: <Copy size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handleCopy() } },
    { id: 'paste', label: '粘贴', icon: <ClipboardPaste size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handlePaste() } },
    { id: 'selectAll', label: '全选', icon: <CheckSquare size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; handleSelectAll() } },
  ]

  const insertActions: ActionItem[] = [
    { id: 'insertImage', label: '插入图片', icon: <Image size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:insert-image') } },
    { id: 'insertTable', label: '插入表格', icon: <Table size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:insert-table') } },
    { id: 'insertLink', label: '插入链接', icon: <Link2 size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:insert-link') } },
    { id: 'insertCode', label: '插入代码块', icon: <Code2 size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:insert-code') } },
    { id: 'insertDivider', label: '分割线', icon: <Minus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:insert-divider') } },
  ]

  const tableActions: ActionItem[] = [
    { id: 'addRowBefore', label: '在上方插入行', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-add-row-before') } },
    { id: 'addRowAfter', label: '在下方插入行', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-add-row-after') } },
    { id: 'addColBefore', label: '在左侧插入列', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-add-col-before') } },
    { id: 'addColAfter', label: '在右侧插入列', icon: <Plus size={20} strokeWidth={2} />, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-add-col-after') } },
    { id: 'deleteRow', label: '删除当前行', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-delete-row') } },
    { id: 'deleteCol', label: '删除当前列', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-delete-col') } },
    { id: 'deleteTable', label: '删除整个表格', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => { actionTakenRef.current = true; dispatch('mobile:table-delete') } },
  ]

  const hasSelection = mode === 'selection' || mode === 'selection-dragging'

  const moreActions: ActionItem[] = inTable
    ? (hasSelection ? [...clipboardActions, ...tableActions] : tableActions)
    : (hasSelection ? clipboardActions : insertActions)

  if (!isMobile || !mounted) return null

  return createPortal(
    <>
      <div
        ref={barRef}
        className="pointer-events-auto fixed z-40 flex items-center rounded-full border border-line bg-paper/85 backdrop-blur-lg shadow-sm px-1.5 py-1 gap-0.5 cursor-default"
        style={{
          left: position.x,
          top: position.y,
          transform: `translate(-50%, ${barVisible ? 0 : 8}px)`,
          opacity: barVisible ? 1 : 0,
          transition: 'opacity 200ms, transform 200ms',
        }}
      >
        {hasSelection ? (
          <>
            <button onClick={handleCut} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink active:bg-black/8 dark:active:bg-white/8 transition-colors">
              剪切
            </button>
            <button onClick={handleCopy} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink active:bg-black/8 dark:active:bg-white/8 transition-colors">
              复制
            </button>
            <button onClick={handlePaste} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink active:bg-black/8 dark:active:bg-white/8 transition-colors">
              粘贴
            </button>
            <button onClick={handleSelectAll} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink active:bg-black/8 dark:active:bg-white/8 transition-colors">
              全选
            </button>
          </>
        ) : (
          <>
            <button onClick={handlePaste} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink active:bg-black/8 dark:active:bg-white/8 transition-colors">
              粘贴
            </button>
            <button onClick={handleSelectAll} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-ink active:bg-black/8 dark:active:bg-white/8 transition-colors">
              全选
            </button>
            {editableRef.current === activeEditor?.view.dom && (
              <>
                <span className="w-px h-4 bg-line mx-0.5" />
                <button
                  onClick={openActionSheet}
                  className="flex items-center justify-center w-8 h-8 rounded-full active:bg-black/8 dark:active:bg-white/8 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-ink">
                    <circle cx="4" cy="8" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="12" cy="8" r="1.5" />
                  </svg>
                </button>
              </>
            )}
          </>
        )}
      </div>

      <MobileActionSheet
        open={mode === 'action-sheet'}
        onClose={closeActionSheet}
        actions={moreActions}
      />
    </>,
    document.getElementById('overlay-root')!,
  )
}
