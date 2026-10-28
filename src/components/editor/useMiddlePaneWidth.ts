'use client'

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  MIDDLE_PANE_DEFAULT,
  MIDDLE_PANE_MIN,
  MIDDLE_PANE_STORAGE_KEY,
  clampMiddlePaneWidth,
  readMiddlePaneWidth,
} from '@/lib/middle-pane-width'

/**
 * 三栏中栏宽度：可拖拽，最大与正文 1:1（中栏 ≤ 可用 split 区的一半）。
 * 宽度存 localStorage，跨编辑器共用；双击复位。
 */
export function useMiddlePaneWidth(splitRef: RefObject<HTMLDivElement | null>) {
  const [storedWidth, setStoredWidth] = useState(readMiddlePaneWidth)
  const [splitWidth, setSplitWidth] = useState(0)

  useEffect(() => {
    const element = splitRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      if (next > 0) setSplitWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [splitRef])

  const fallback = typeof window === 'undefined' ? 1200 : window.innerWidth
  const max = Math.max(MIDDLE_PANE_MIN, Math.floor((splitWidth || fallback) / 2))
  const width = clampMiddlePaneWidth(storedWidth, max)

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      let latest = startWidth
      const previousCursor = document.body.style.cursor
      document.body.style.cursor = 'col-resize'

      const onMove = (moveEvent: PointerEvent) => {
        latest = clampMiddlePaneWidth(startWidth + moveEvent.clientX - startX, max)
        setStoredWidth(latest)
      }
      const onUp = () => {
        document.body.style.cursor = previousCursor
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        try {
          window.localStorage.setItem(MIDDLE_PANE_STORAGE_KEY, String(latest))
        } catch {
          // localStorage 不可用时只保留本次会话
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [width, max],
  )

  const reset = useCallback(() => {
    setStoredWidth(MIDDLE_PANE_DEFAULT)
    try {
      window.localStorage.setItem(MIDDLE_PANE_STORAGE_KEY, String(MIDDLE_PANE_DEFAULT))
    } catch {
      // ignore
    }
  }, [])

  return { width, max, startDrag, reset }
}
