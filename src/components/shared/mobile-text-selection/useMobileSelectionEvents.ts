'use client'

import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { SEL_NOISE_GATE } from './constants'
import { isEditable, isCollapsed, resolveEditable } from './geometry'
import { safeGetEditorDom } from './clipboard'
import type { MobileSelectionCtx } from './useMobileSelectionState'

/**
 * 选词工具栏的事件源：focusin / focusout / selectionchange / contextmenu(长按) /
 * 表格位置跟随 / 点外部消失 / 滚动缩放重算 / 键盘弹起重算 / 卸载清理。
 *
 * 依赖只取 state hook 里稳定的引用（setter 与 ref），effect 依赖表与拆分前逐条一致，
 * 避免因重挂监听而吞掉 selectionchange 的防抖。
 */
export function useMobileSelectionEvents(
  ctx: MobileSelectionCtx,
  activeEditor: Editor | null,
  isMobile: boolean,
  keyboardVisible: boolean,
) {
  const {
    mode, mounted, dispatch, setModeBoth, recalcPosition,
    scheduleRecalc, cancelRecalc, scheduleSelChange, cancelSelChange, setBarVisible, setInTable,
    modeRef, barRef, editableRef, selLastTimeRef,
    selectionConsumeLockRef, focusLockRef, suppressNextFocusRef,
  } = ctx

  // focusin
  useEffect(() => {
    if (!isMobile) return
    const handler = () => {
      setTimeout(() => {
        if (selectionConsumeLockRef.current) return
        if (focusLockRef.current) return
        if (suppressNextFocusRef.current) { suppressNextFocusRef.current = false; return }
        const el = resolveEditable()
        if (!el) return
        if (modeRef.current !== 'idle') return
        dispatch({ type: 'FOCUS_IN', collapsed: isCollapsed(el) })
      }, 150)
    }
    document.addEventListener('focusin', handler)
    return () => document.removeEventListener('focusin', handler)
  }, [isMobile, dispatch, selectionConsumeLockRef, focusLockRef, suppressNextFocusRef, modeRef])

  // focusout
  useEffect(() => {
    if (!isMobile) return
    const handler = (e: FocusEvent) => {
      if (modeRef.current === 'action-sheet') return
      const target = e.target as HTMLElement
      if (!isEditable(target)) return
      const related = e.relatedTarget as HTMLElement | null
      if (related && barRef.current?.contains(related)) return
      dispatch({ type: 'FOCUS_OUT' })
    }
    document.addEventListener('focusout', handler)
    return () => document.removeEventListener('focusout', handler)
  }, [isMobile, dispatch, modeRef, barRef])

  // selectionchange
  useEffect(() => {
    if (!isMobile) return
    const handler = () => {
      if (selectionConsumeLockRef.current) return
      // Noise gate
      const now = performance.now()
      if (now - selLastTimeRef.current < SEL_NOISE_GATE) return
      selLastTimeRef.current = now

      // Dragging detection
      if (modeRef.current === 'selection') {
        setBarVisible(false)
        setModeBoth('dragging')
      }

      // Debounce — capture epoch snapshot for stale-gate
      scheduleSelChange()
    }
    document.addEventListener('selectionchange', handler)
    return () => {
      document.removeEventListener('selectionchange', handler)
      cancelSelChange()
    }
  }, [isMobile, setModeBoth, setBarVisible, selectionConsumeLockRef, selLastTimeRef, modeRef, scheduleSelChange, cancelSelChange])

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
      dispatch({ type: 'LONG_PRESS', collapsed: isCollapsed(target) })
    }
    window.addEventListener('contextmenu', handler, true)
    return () => window.removeEventListener('contextmenu', handler, true)
  }, [isMobile, dispatch, modeRef])

  // table detection follows editor selection
  useEffect(() => {
    if (!activeEditor || !isMobile) return
    const update = () => {
      if (activeEditor.isDestroyed) return
      const editorDom = safeGetEditorDom(activeEditor)
      if (!editorDom) return
      if (editableRef.current !== editorDom) return
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
  }, [activeEditor, isMobile, setInTable, editableRef])

  // tap outside dismiss
  useEffect(() => {
    if (!mounted) return
    const handler = (e: PointerEvent) => {
      if (modeRef.current === 'action-sheet') return
      if (modeRef.current === 'idle') return
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        dispatch({ type: 'DISMISS' })
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [mounted, dispatch, modeRef, barRef])

  // scroll / resize / visualViewport → recalcPosition
  useEffect(() => {
    if (!isMobile) return
    const update = () => {
      if (modeRef.current === 'idle') return
      scheduleRecalc()
    }
    // 每个 section（角色/事件/国家/世界观…）各有一个独立的 .section-fade 滚动容器，
    // 因此不能用 querySelector('.section-fade') 写死第一个（那样只有事件页会跟随滚动）。
    // 滚动事件不冒泡，但在捕获阶段会经过 document —— 用捕获监听覆盖当前所有滚动容器。
    document.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      cancelRecalc()
      document.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [isMobile, scheduleRecalc, cancelRecalc, modeRef])

  // keyboard show/hide
  useEffect(() => {
    if (mode === 'idle') return
    requestAnimationFrame(recalcPosition)
  }, [keyboardVisible, recalcPosition, mode])
}




