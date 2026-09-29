'use client'

import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'

/**
 * 桌面端气泡菜单的显隐时机（移动端不参与）：
 * - 指针在编辑器内按下后抬起 → 主动 show（点选后立即出现）
 * - 聚焦 → show；失焦 → hide
 * - 输入中隐藏，停止输入 200ms 后 show（`isTypingRef` 供 `shouldShow` 读取）
 */
export function useEditorBubbleMenu({
  editor,
  isMobile,
  editorRef,
}: {
  editor: Editor | null
  isMobile: boolean
  editorRef: React.RefObject<Editor | null>
}) {
  const isPointerDownRef = useRef(false)
  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = editorRef.current?.view.dom
      if (el && el.contains(e.target as Node)) {
        isPointerDownRef.current = true
      }
    }
    const up = () => {
      const wasDown = isPointerDownRef.current
      isPointerDownRef.current = false
      if (wasDown) {
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) {
          ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'show'))
        }
      }
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up)
    }
  }, [editorRef])

  // 聚焦/失焦
  useEffect(() => {
    if (!editor || isMobile) return
    const onFocus = () => {
      requestAnimationFrame(() => {
        const ed = editorRef.current
        if (ed && !ed.isDestroyed && ed.isFocused) {
          ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'show'))
        }
      })
    }
    const onBlur = () => {
      const ed = editorRef.current
      if (ed && !ed.isDestroyed) {
        ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'hide'))
      }
    }
    editor.on('focus', onFocus)
    editor.on('blur', onBlur)
    return () => {
      editor.off('focus', onFocus)
      editor.off('blur', onBlur)
    }
  }, [editor, isMobile, editorRef])

  // 输入中隐藏，停 200ms 再显示
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onKeyDown = () => {
      isTypingRef.current = true
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false
        const ed = editorRef.current
        if (ed && !ed.isDestroyed && ed.isFocused) {
          ed.view.dispatch(ed.view.state.tr.setMeta('bubbleMenu', 'show'))
        }
      }, 200)
    }
    dom.addEventListener('keydown', onKeyDown)
    return () => {
      dom.removeEventListener('keydown', onKeyDown)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [editor, editorRef])

  return { isTypingRef }
}
