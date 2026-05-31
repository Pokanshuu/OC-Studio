'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useInputMenuContext } from '@/components/shared/GlobalContextMenu'
import { useDevice } from '@/lib/use-device'

/**
 * 移动端组件级 input 长按菜单 hook。
 * 在元素自身绑定 pointerdown/pointerup/pointercancel，不监听 document，
 * 不与其他全局事件监听器竞争。
 */
export function useInputContextMenu() {
  const ctx = useInputMenuContext()
  const openMenuAt = ctx?.openMenuAt
  const { isMobile } = useDevice()
  const cleanupRef = useRef<(() => void) | null>(null)

  const refCallback = useCallback((el: HTMLElement | null) => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }

    if (!el || !isMobile || !openMenuAt) return

    const state = {
      pressStart: 0,
      pressX: 0,
      pressY: 0,
    }

    const down = (e: PointerEvent) => {
      state.pressStart = Date.now()
      state.pressX = e.clientX
      state.pressY = e.clientY
    }

    const cancel = () => {
      state.pressStart = 0
    }

    // 主触发：浏览器 contextmenu 事件（移动端长按的浏览器原生信号）
    // pointerup fallback：部分 WebView 不触发 contextmenu，用 500ms 计时兜底
    const onContextMenu = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      if (state.pressStart) {
        state.pressStart = 0
        openMenuAt(el, state.pressX, state.pressY)
      }
    }

    const up = (e: PointerEvent) => {
      if (!state.pressStart) return
      const dx = Math.abs(e.clientX - state.pressX)
      const dy = Math.abs(e.clientY - state.pressY)
      const dt = Date.now() - state.pressStart
      state.pressStart = 0
      if (dt >= 500 && dx < 10 && dy < 10) {
        e.preventDefault()
        openMenuAt(el, state.pressX, state.pressY)
      }
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('contextmenu', onContextMenu)

    cleanupRef.current = () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('contextmenu', onContextMenu)
    }
  }, [isMobile, openMenuAt])

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current()
    }
  }, [])

  return refCallback
}
