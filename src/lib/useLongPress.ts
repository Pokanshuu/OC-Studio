'use client'

import { useRef, useCallback, useEffect } from 'react'
import { triggerHaptic } from './haptics'

export interface LongPressPoint {
  clientX: number
  clientY: number
}

interface UseLongPressOptions {
  /** 长按触发时带上按下位置，供右键菜单 / 动作表定位 */
  onLongPress: (point: LongPressPoint) => void
  threshold?: number
  moveThreshold?: number
  enabled?: boolean
}

export function useLongPress({
  onLongPress,
  threshold = 320,
  moveThreshold = 8,
  enabled = true,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const pointRef = useRef<LongPressPoint>({ clientX: 0, clientY: 0 })
  /** 长按已经出过菜单：吞掉松手后合成的那次 click（否则会同时打开大图） */
  const firedRef = useRef(false)
  const callbackRef = useRef(onLongPress)
  useEffect(() => {
    callbackRef.current = onLongPress
  }, [onLongPress])

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return
      // 右键 / 中键走 contextmenu，不参与长按
      if (e.pointerType === 'mouse' && e.button !== 0) return
      clear()
      firedRef.current = false
      startRef.current = { x: e.clientX, y: e.clientY }
      pointRef.current = { clientX: e.clientX, clientY: e.clientY }
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        triggerHaptic()
        callbackRef.current(pointRef.current)
      }, threshold)
    },
    [enabled, threshold, clear],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!startRef.current) return
      const dx = Math.abs(e.clientX - startRef.current.x)
      const dy = Math.abs(e.clientY - startRef.current.y)
      if (dx > moveThreshold || dy > moveThreshold) {
        clear()
      }
    },
    [moveThreshold, clear],
  )

  const onPointerUp = useCallback(() => {
    clear()
  }, [clear])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!firedRef.current) return
    firedRef.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClickCapture,
  }
}
