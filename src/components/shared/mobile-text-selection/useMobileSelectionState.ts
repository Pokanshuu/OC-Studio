'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { TOOLBAR_H, GAP, FLIP_ZONE, FOCUS_LOCK_MS, SEL_DEBOUNCE } from './constants'
import type { State, EditorEvent } from './constants'
import { clamp, getAnchorRect, isCollapsed, isEditorDom, resolveEditable, findEditableFromSelection, getActiveEditable } from './geometry'
import { safeGetEditorDom } from './clipboard'

/**
 * 选词工具栏状态机：模式 / 位置 / 挂载与显隐 + 事件归约（dispatch）。
 * 事件源（focusin、selectionchange、contextmenu…）见 `useMobileSelectionEvents`，
 * 动作（剪切/复制/粘贴/全选）见 `useMobileSelectionActions`。
 */
export function useMobileSelectionState(activeEditor: Editor | null) {
  // ── state ──
  const [mode, setMode] = useState<State>('idle')
  const [position, setPosition] = useState({ x: 0, y: 0, flip: false })
  const [mounted, setMounted] = useState(false)
  const [barVisible, setBarVisible] = useState(false)
  const [inTable, setInTable] = useState(false)

  // ── refs ──
  const modeRef = useRef<State>('idle')
  const barRef = useRef<HTMLDivElement>(null)
  const editableRef = useRef<HTMLElement | null>(null)
  const epochRef = useRef(0)
  const focusLockRef = useRef(false)
  const selLastTimeRef = useRef(0)
  const selDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionTakenRef = useRef(false)
  const suppressNextFocusRef = useRef(false)
  const selectionConsumeLockRef = useRef(false)
  const rafRef = useRef(0)
  const recalcPositionRef = useRef<(() => void) | null>(null)

  // ── helpers ──

  const setModeBoth = useCallback((next: State) => {
    modeRef.current = next
    setMode(next)
  }, [])

  const show = useCallback((el: HTMLElement, st: State) => {
    // 拒绝跟踪已脱离文档或在 display:none 区域的元素
    if (!el.isConnected) return
    const elRect = el.getBoundingClientRect()
    if (elRect.width === 0 && elRect.height === 0) return

    const editorDom = safeGetEditorDom(activeEditor)
    const isPM = isEditorDom(el, editorDom)
    if (isPM && activeEditor && !activeEditor.isDestroyed) {
      setInTable(
        activeEditor.isActive('table') ||
        activeEditor.isActive('tableCell') ||
        activeEditor.isActive('tableHeader')
      )
    } else {
      setInTable(false)
    }
    editableRef.current = el
    suppressNextFocusRef.current = false
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null }
    recalcPositionRef.current?.()
    setMounted(true)
    setModeBoth(st)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setBarVisible(true)
        recalcPositionRef.current?.()
        setTimeout(() => recalcPositionRef.current?.(), 200)
      })
    })
  }, [activeEditor, setModeBoth])

  const dismiss = useCallback(() => {
    epochRef.current++
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
    setModeBoth('idle')
  }, [dismiss, setModeBoth])

  const recalcPosition = useCallback(() => {
    const el = editableRef.current
    if (!el) return

    // 元素已脱离文档或被 display:none 隐藏 → 立即 detach
    if (!el.isConnected) {
      editableRef.current = null
      dismiss()
      setModeBoth('idle')
      return
    }
    const elRect = el.getBoundingClientRect()
    if (elRect.width === 0 && elRect.height === 0) {
      editableRef.current = null
      dismiss()
      setModeBoth('idle')
      return
    }

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
  }, [dismiss, setModeBoth])
  recalcPositionRef.current = recalcPosition

  // ── state machine ──

  /** 合并同一帧内的多次重算（滚动/缩放/键盘） */
  const scheduleRecalc = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(recalcPosition)
  }, [recalcPosition])

  /** 取消待执行的重算（监听器重挂/卸载时用） */
  const cancelRecalc = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
  }, [])

  const dispatch = useCallback((event: EditorEvent) => {
    const epoch = epochRef.current

    // DISMISS resets everything — no further processing
    if (event.type === 'DISMISS') {
      goIdle()
      return
    }

    // All other events are gated by epoch
    if (epoch !== epochRef.current) return

    switch (event.type) {
      case 'FOCUS_IN': {
        const el = resolveEditable()
        if (!el) break
        show(el, event.collapsed ? 'caret' : 'selection')
        break
      }

      case 'FOCUS_OUT': {
        focusLockRef.current = true
        setTimeout(() => { focusLockRef.current = false }, FOCUS_LOCK_MS)
        goIdle()
        break
      }

      case 'SEL_CHANGE': {
        const el = resolveEditable()
        if (!el) {
          if (modeRef.current !== 'idle') goIdle()
          break
        }
        const collapsed = isCollapsed(el)
        if (collapsed) {
          if (modeRef.current === 'selection') {
            show(el, 'caret')
          } else if (modeRef.current === 'caret') {
            recalcPosition()
          } else if (modeRef.current !== 'idle') {
            show(el, 'caret')
          }
        } else {
          if (modeRef.current === 'caret' || modeRef.current === 'idle') {
            show(el, 'selection')
          } else if (modeRef.current === 'dragging') {
            setModeBoth('selection')
            setBarVisible(true)
          }
          recalcPosition()
        }
        break
      }

      case 'LONG_PRESS': {
        const editorDom = safeGetEditorDom(activeEditor)
        const targetEl = findEditableFromSelection() ?? getActiveEditable()
        if (!targetEl) break
        const el = isEditorDom(targetEl, editorDom) && editorDom ? editorDom : targetEl
        show(el, event.collapsed ? 'caret' : 'selection')
        break
      }

      case 'ACTION_OPEN':
        // 先进 action-sheet 再 blur：否则 blur 触发的 focusout 会把状态打回 idle，
        // 连带 dismiss() 卸载整个 portal（含动作面板）→ 面板永远打不开（Android 触摸点击不转移焦点时必现）
        setModeBoth('action-sheet')
        setBarVisible(false)
        editableRef.current?.blur()
        break

      case 'ACTION_CLOSE':
        queueMicrotask(() => {
          if (actionTakenRef.current) {
            actionTakenRef.current = false
            suppressNextFocusRef.current = true
          } else {
            suppressNextFocusRef.current = true
          }
          dismiss()
          setModeBoth('idle')
        })
        break
    }
  }, [show, goIdle, setModeBoth, recalcPosition, activeEditor, dismiss])

  /** selectionchange 防抖：带 epoch 快照，过期的丢弃 */
  const scheduleSelChange = useCallback(() => {
    const epochSnap = epochRef.current
    if (selDebounceRef.current) clearTimeout(selDebounceRef.current)
    selDebounceRef.current = setTimeout(() => {
      if (epochSnap !== epochRef.current) return
      dispatch({ type: 'SEL_CHANGE' })
    }, SEL_DEBOUNCE)
  }, [dispatch])

  /** 取消待触发的防抖（监听器重挂/卸载时用） */
  const cancelSelChange = useCallback(() => {
    if (selDebounceRef.current) clearTimeout(selDebounceRef.current)
  }, [])

  // 卸载清理：定时器与 rAF 都在本 hook 内创建，由本 hook 负责收尾
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      if (selDebounceRef.current) clearTimeout(selDebounceRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [])

  return {
    mode, position, mounted, barVisible, inTable,
    setBarVisible, setInTable,
    modeRef, barRef, editableRef, epochRef, focusLockRef, selLastTimeRef,
    selDebounceRef, dismissTimerRef, actionTakenRef, suppressNextFocusRef,
    selectionConsumeLockRef, rafRef,
    setModeBoth, show, dismiss, goIdle, recalcPosition, dispatch,
    scheduleRecalc, cancelRecalc, scheduleSelChange, cancelSelChange,
  }
}

export type MobileSelectionCtx = ReturnType<typeof useMobileSelectionState>




