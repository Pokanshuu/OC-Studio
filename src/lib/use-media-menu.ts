'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useLongPress } from './useLongPress'

export interface MediaMenuPoint {
  x: number
  y: number
}

/**
 * 图片 / 媒体的统一呼出入口：**桌面右键、移动端长按**，都在指针位置弹同一套菜单。
 *
 * `handlersFor(target)` 返回可直接展开到图片元素上的事件处理器。`target` 用来区分
 * 同一屏上的多个热点（头像 / 封面、画廊第几张），单热点的调用点不传即可。
 * 长按触发后会吞掉松手时合成的那次 click —— 否则「菜单 + 大图」会同时出现。
 */
export function useMediaMenu<T>(
  onOpen: (target: T | undefined, at: MediaMenuPoint) => void,
) {
  const targetRef = useRef<T | undefined>(undefined)
  const callbackRef = useRef(onOpen)
  useEffect(() => {
    callbackRef.current = onOpen
  }, [onOpen])

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  } = useLongPress({
    // `useLongPress` 给的是指针位置（clientX/clientY），菜单要的是视口坐标 { x, y }
    onLongPress: (point) => callbackRef.current(targetRef.current, { x: point.clientX, y: point.clientY }),
  })

  const handlersFor = useCallback(
    (target?: T) => ({
      onContextMenu: (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        callbackRef.current(target, { x: event.clientX, y: event.clientY })
      },
      onPointerDown: (event: React.PointerEvent) => {
        targetRef.current = target
        onPointerDown(event)
      },
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture],
  )

  return handlersFor
}
