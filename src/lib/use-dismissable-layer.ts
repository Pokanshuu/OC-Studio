'use client'

/**
 * 「点外部 / Escape 关闭」的唯一实现（S1）。
 *
 * 用于所有按点击坐标弹出的浮层：菜单面板、边样式面板、媒体右键菜单……
 * 只管两件事，不依赖任何业务状态：
 * - `document` 的 `pointerdown` **捕获阶段**：落点在 `ref` 之外 → `onClose`
 * - `Escape` → `onClose`
 *
 * 为什么是 `pointerdown` 捕获而不是 `click`：按下就关，用户不必等松手；
 * 捕获阶段保证比页面里的 `stopPropagation` 更早拿到事件。
 *
 * 与 `ContextMenu` 的边界：编辑器正文右键菜单还带子菜单、选区变化自动收起、
 * 淡入淡出计时器，事件模型不同，本轮不合并（见 `MenuSurface` 顶部注释）。
 */
import { useEffect, useRef, type RefObject } from 'react'

export function useDismissableLayer<T extends HTMLElement = HTMLDivElement>({
  onClose,
  enabled = true,
}: {
  onClose: () => void
  enabled?: boolean
}): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!enabled) return

    const onPointerDown = (event: PointerEvent) => {
      const el = ref.current
      if (el && !el.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled, onClose])

  return ref
}
