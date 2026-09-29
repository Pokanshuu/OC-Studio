'use client'

import { useState, useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * 量取时间线滚动容器的宽度（供 `useTimelineLayout` 换算像素密度）。
 * `events` 仅作为依赖：事件增删后容器高度/滚动条可能变化，需要重新观察。
 */
export function useTimelineContainerWidth(
  scrollRef: RefObject<HTMLDivElement | null>,
  events: readonly unknown[],
): number {
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0) {
        setContainerWidth(rect.width)
      }
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [events, scrollRef])

  return containerWidth
}

