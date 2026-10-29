'use client'

import { useCallback, useState } from 'react'
import {
  DEFAULT_LIST_WIDTH,
  LIST_WIDTH_STORAGE_KEY,
  clampListWidth,
  readListWidth,
} from '@/lib/list-width'

/** 列表栏拖宽（0.8–1.2x）+ localStorage；双击复位。 */
export function useListWidth() {
  const [width, setWidth] = useState(readListWidth)

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    let nextWidth = startWidth

    const onMove = (moveEvent: PointerEvent) => {
      nextWidth = clampListWidth(startWidth + moveEvent.clientX - startX)
      setWidth(nextWidth)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      try {
        window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, String(nextWidth))
      } catch {
        // 隐私模式/配额不足时只保留本次会话
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }, [width])

  const reset = useCallback(() => {
    setWidth(DEFAULT_LIST_WIDTH)
    try {
      window.localStorage.removeItem(LIST_WIDTH_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { width, startDrag, reset }
}
