'use client'

import { useCallback, useSyncExternalStore } from 'react'
import {
  DEFAULT_LIST_WIDTH,
  LIST_WIDTH_STORAGE_KEY,
  clampListWidth,
  readListWidth,
} from '@/lib/list-width'

// 宽度是本机偏好（localStorage），服务端读不到，只能给默认值。
// 若拿 readListWidth() 当 useState 初值，服务端渲染 200、客户端水合 240，
// 就是「server HTML 的 style 与 client 不一致」——React 不修补，只会报错。
// 所以宽度走 useSyncExternalStore：服务端快照固定为默认值，水合后再切到真实值。
//
// 顺带把宽度收成模块级单源：编辑器列表栏与相册目录栏共用同一个 key，
// 现在拖动任意一个，另一边也跟着更新，不会再出现两处宽度不一致。

let currentWidth: number | null = null
const listeners = new Set<() => void>()

function getClientWidth(): number {
  if (currentWidth === null) currentWidth = readListWidth()
  return currentWidth
}

function getServerWidth(): number {
  return DEFAULT_LIST_WIDTH
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function writeWidth(next: number): void {
  const clamped = clampListWidth(next)
  if (currentWidth === clamped) return
  currentWidth = clamped
  for (const listener of listeners) listener()
}

function persistWidth(width: number): void {
  try {
    window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // 隐私模式/配额不足时只保留本次会话
  }
}

/** 列表栏拖宽（0.8–1.2x）+ localStorage；双击复位。 */
export function useListWidth() {
  const width = useSyncExternalStore(subscribe, getClientWidth, getServerWidth)

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = getClientWidth()
    let nextWidth = startWidth

    const onMove = (moveEvent: PointerEvent) => {
      nextWidth = clampListWidth(startWidth + moveEvent.clientX - startX)
      writeWidth(nextWidth)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      persistWidth(nextWidth)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  const reset = useCallback(() => {
    writeWidth(DEFAULT_LIST_WIDTH)
    try {
      window.localStorage.removeItem(LIST_WIDTH_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { width, startDrag, reset }
}
