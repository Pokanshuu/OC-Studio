'use client'

import { useRef, useCallback } from 'react'
import { triggerHaptic } from './haptics'

interface UseLongPressOptions {
  onLongPress: () => void
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
  const callbackRef = useRef(onLongPress)
  callbackRef.current = onLongPress

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
      clear()
      startRef.current = { x: e.clientX, y: e.clientY }
      timerRef.current = setTimeout(() => {
        triggerHaptic()
        callbackRef.current()
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

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
}
