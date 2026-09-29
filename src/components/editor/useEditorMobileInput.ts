'use client'

import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'

/**
 * 移动端输入相关处理：
 * - 触摸长按/滑动判定 + 重新聚焦（点在 padding 区域时原生 click 不落光标）
 * - 键盘弹出后把被遮挡的光标滚到可视区
 * - 缓存最近一次非空选区（工具栏按钮点击会丢选区，执行前需恢复；用 getCachedSelection 读取）
 */
export function useEditorMobileInput({
  editor,
  isMobile,
  keyboardVisible,
  editorRef,
}: {
  editor: Editor | null
  isMobile: boolean
  keyboardVisible: boolean
  editorRef: React.RefObject<Editor | null>
}) {

  useEffect(() => {
    if (!isMobile || !editor) return
    const dom = editor.view.dom
    let timer: ReturnType<typeof setTimeout> | null = null
    let startPos: { x: number; y: number } | null = null
    let wasLongPress = false
    let wasScroll = false

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startPos = { x: touch.clientX, y: touch.clientY }
      wasLongPress = false
      wasScroll = false
      timer = setTimeout(() => {
        wasLongPress = true
      }, 320)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!startPos) return
      const touch = e.touches[0]
      if (Math.abs(touch.clientX - startPos.x) > 8 || Math.abs(touch.clientY - startPos.y) > 8) {
        if (timer) { clearTimeout(timer); timer = null }
        wasScroll = true
      }
    }

    const onTouchEnd = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (wasScroll || wasLongPress) {
        startPos = null
        return
      }
      // 延迟聚焦：让浏览器原生的 touch→click 管线先完成光标定位，
      // 仅在编辑器确实没聚焦时才补救（例如点击在 padding 区域）
      setTimeout(() => {
        if (!editor.isFocused) {
          editor.view.dom.focus()
        }
      })
      startPos = null
    }

    dom.addEventListener('touchstart', onTouchStart, { passive: true })
    dom.addEventListener('touchmove', onTouchMove, { passive: true })
    dom.addEventListener('touchend', onTouchEnd)
    dom.addEventListener('touchcancel', onTouchEnd)
    return () => {
      dom.removeEventListener('touchstart', onTouchStart)
      dom.removeEventListener('touchmove', onTouchMove)
      dom.removeEventListener('touchend', onTouchEnd)
      dom.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [isMobile, editor])

  // 键盘弹出后检查光标是否被遮挡并滚动到位
  useEffect(() => {
    if (!isMobile || !keyboardVisible) return
    const ed = editorRef.current
    if (!ed || !ed.isFocused) return
    const id = setTimeout(() => {
      if (!editorRef.current || editorRef.current.isDestroyed) return
      const coords = editorRef.current.view.coordsAtPos(editorRef.current.state.selection.head)
      const toolbarH = 56
      const vvBottom = document.documentElement.clientHeight
      const overflow = coords.bottom + toolbarH - vvBottom
      if (overflow > 0) {
        const scroller = editorRef.current.view.dom.closest('.section-fade') as HTMLElement | null
        if (scroller) scroller.scrollTop += overflow
      }
    }, 30)
    return () => clearTimeout(id)
  }, [isMobile, keyboardVisible, editorRef])
}




