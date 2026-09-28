'use client'

import { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import React from 'react'

import { BlockTypeMenu } from './BlockTypeMenu'
import { useDevice } from '@/lib/use-device'
import { useActiveEditor } from '@/lib/editor-context'
import { useKeyboard } from '@/lib/KeyboardContext'
import { ContextMenu } from '@/components/shared/ContextMenu'
import { BubbleMenuButtons } from './BubbleMenuButtons'
import { buildEditorContextMenu } from './editor-context-menu'
import { MobileEditorToolbar } from './MobileEditorToolbar'

import { buildEditorConfig, BLOCK_MENU_EVENT } from './editor-config'

interface EditorCoreProps {
  onReady: (editor: Editor) => void
  onCharacterCount?: (count: number) => void
  onContentChange?: (content: string) => void
  content?: string | object
  placeholder?: string
  onMentionClick?: (id: string, entityType?: string) => void
  onWikiLinkClick?: (id: string) => void
  plain?: boolean
}

export function EditorCore({
  onReady, onCharacterCount, onContentChange, content, placeholder, onMentionClick, onWikiLinkClick, plain,
}: EditorCoreProps) {
  const editorId = useId()
  const [blockMenuPosition, setBlockMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [blockMenuPos, setBlockMenuPos] = useState<number | undefined>(undefined)
  const editorRef = useRef<Editor | null>(null)
  const [isTableActive, setIsTableActive] = useState(false)
  const [toolbarTick, setToolbarTick] = useState(0)
  const { isMobile } = useDevice()
  const { setActiveEditor } = useActiveEditor()
  const { visible: keyboardVisible, viewportHeight: keyboardHeight } = useKeyboard()
  const [mobileBlockMenuOpen, setMobileBlockMenuOpen] = useState(false)
  const mobileToolbarRef = useRef<HTMLDivElement>(null)
  const mobileBlockMenuRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<{ from: number; to: number } | null>(null)
  const isPointerDownRef = useRef(false)
  const isTypingRef = useRef(false)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const keyboardVisibleRef = useRef(keyboardVisible)
  keyboardVisibleRef.current = keyboardVisible
  const lastClickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

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
  }, [])

  const handleBlockMenuEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail
    if (detail?.editorId === editorId) {
      setBlockMenuPosition({ x: detail.rect.left, y: detail.rect.top })
      setBlockMenuPos(detail.blockPos as number | undefined)
    }
  }, [editorId])

  const closeBlockMenu = useCallback(() => { setBlockMenuPosition(null); setBlockMenuPos(undefined) }, [])

  useEffect(() => {
    window.addEventListener(BLOCK_MENU_EVENT, handleBlockMenuEvent)
    return () => window.removeEventListener(BLOCK_MENU_EVENT, handleBlockMenuEvent)
  }, [handleBlockMenuEvent])

  // 仅把「取值器」交给配置模块（.current 一律在事件处理器里才读，render 期不读）。
  // 规则在 render 表达式里看到存在 .current 的闭包即报，无法区分是否真的读取 —— 属误报。
  // eslint-disable-next-line react-hooks/refs
  const editor = useEditor(buildEditorConfig({
    placeholder,
    plain,
    content,
    isMobile,
    editorId,
    getEditor: () => editorRef.current,
    isKeyboardVisible: () => keyboardVisibleRef.current,
    setEditor: (ed) => { editorRef.current = ed },
    setActiveEditor,
    onReady,
    onCharacterCount,
    onContentChange,
  }))
  useEffect(() => {
    if (!editor) return
    const updateTableState = () => {
      setIsTableActive(editor.isActive('table'))
    }
    editor.on('selectionUpdate', updateTableState)
    editor.on('transaction', updateTableState)
    return () => {
      editor.off('selectionUpdate', updateTableState)
      editor.off('transaction', updateTableState)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const handleFocus = () => setActiveEditor(editor)
    editor.on('focus', handleFocus)
    return () => { editor.off('focus', handleFocus) }
  }, [editor, setActiveEditor])

  // 桌面端 BubbleMenu：聚焦/失焦时主动触发显示/隐藏
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
  }, [editor, isMobile])

  // 桌面端 BubbleMenu：输入时隐藏，停止输入 200ms 后显示
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
  }, [editor])

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

  // 移动端工具栏自定义事件（MobileTextSelectionBar → EditorCore）
  useEffect(() => {
    if (!isMobile || !editor) return
    const dom = editor.view.dom
    const handlers: Record<string, () => void> = {
      'mobile:insert-image': () => editor.chain().focus().insertContent({ type: 'imageBlock' }).run(),
      'mobile:insert-table': () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      'mobile:insert-link': () => editor.chain().focus().toggleLink({ href: '' }).run(),
      'mobile:insert-code': () => editor.chain().focus().toggleCodeBlock().run(),
      'mobile:insert-divider': () => editor.chain().focus().setHorizontalRule().run(),
      'mobile:table-add-row-before': () => editor.chain().focus().addRowBefore().run(),
      'mobile:table-add-row-after': () => editor.chain().focus().addRowAfter().run(),
      'mobile:table-add-col-before': () => editor.chain().focus().addColumnBefore().run(),
      'mobile:table-add-col-after': () => editor.chain().focus().addColumnAfter().run(),
      'mobile:table-delete': () => editor.chain().focus().deleteTable().run(),
      'mobile:table-delete-row': () => editor.chain().focus().deleteRow().run(),
      'mobile:table-delete-col': () => editor.chain().focus().deleteColumn().run(),
    }
    for (const [name, fn] of Object.entries(handlers)) {
      dom.addEventListener(name, fn)
    }
    return () => {
      for (const [name, fn] of Object.entries(handlers)) {
        dom.removeEventListener(name, fn)
      }
    }
  }, [isMobile, editor])

  // 移动端键盘弹出后检查光标是否被遮挡并滚动到位
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
  }, [isMobile, keyboardVisible])

  // 移动端：缓存最近一次文本选择，防止工具栏按钮点击时丢失选择
  useEffect(() => {
    if (!editor || !isMobile) return
    const handle = () => {
      const { from, to } = editor.state.selection
      if (from !== to) {
        selectionRef.current = { from, to }
      } else {
        selectionRef.current = null
      }
    }
    editor.on('selectionUpdate', handle)
    return () => { editor.off('selectionUpdate', handle) }
  }, [editor, isMobile])

  // 移动端工具栏按钮：先恢复选择再执行操作
  const handleToolbarAction = useCallback((action: () => void) => {
    if (!editor) return
    if (isMobile && selectionRef.current) {
      const { from, to } = selectionRef.current
      editor.chain().setTextSelection({ from, to }).run()
    }
    editor.commands.focus()
    action()
    setToolbarTick(v => v + 1)
  }, [isMobile, editor])

  // 移动端工具栏禁止长按弹出右键菜单（原生 DOM 监听，capture 阶段拦截，比 React 合成事件更可靠）
  useEffect(() => {
    if (!isMobile) return
    const preventCtx = (e: Event) => { e.preventDefault(); e.stopPropagation() }
    const toolbar = mobileToolbarRef.current
    const blockMenu = mobileBlockMenuRef.current
    toolbar?.addEventListener('contextmenu', preventCtx, true)
    blockMenu?.addEventListener('contextmenu', preventCtx, true)
    return () => {
      toolbar?.removeEventListener('contextmenu', preventCtx, true)
      blockMenu?.removeEventListener('contextmenu', preventCtx, true)
    }
  }, [isMobile, keyboardVisible, mobileBlockMenuOpen])

  // 移动端工具栏统一 onPointerDown 入口：preventDefault + stopPropagation + 执行命令
  const handleToolbarPointerDown = useCallback((e: React.PointerEvent, action: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    handleToolbarAction(action)
  }, [handleToolbarAction])

  const contextMenuItems = useMemo(
    () => buildEditorContextMenu({ editor, isTableActive }),
    [editor, isTableActive],
  )
  if (!editor) {
    return <div className="flex h-32 items-center justify-center text-sm text-ink-muted">编辑器加载中...</div>
  }

  return (
    <ContextMenu items={contextMenuItems}>
    <div
      className={plain
        ? 'relative'
        : 'relative rounded-md border border-transparent bg-paper transition-colors hover:border-line focus-within:border-line-hover'
      }
      onMouseDown={(e) => {
        lastClickRef.current = { x: e.clientX, y: e.clientY }
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement
        const mentionEl = target.closest?.('[data-type="mention"]') as HTMLElement | null
        if (mentionEl && onMentionClick) {
          const id = mentionEl.dataset.id
          if (id) {
            e.preventDefault()
            e.stopPropagation()
            onMentionClick(id, mentionEl.dataset.entityType)
          }
        }
        const wikiLinkEl = target.closest?.('[data-type="wiki-link"]') as HTMLElement | null
        if (wikiLinkEl && onWikiLinkClick) {
          const id = wikiLinkEl.dataset.id
          if (id) {
            e.preventDefault()
            e.stopPropagation()
            onWikiLinkClick(id)
          }
        }
      }}
    >
      {!isMobile && (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          shouldShow={({ editor }) => {
            return editor.isFocused && !isTypingRef.current
          }}
          getReferencedVirtualElement={() => {
            const { selection } = editor.state
            if (!selection.empty) {
              const domSel = window.getSelection()
              if (domSel && domSel.rangeCount > 0) {
                const rect = domSel.getRangeAt(0).getBoundingClientRect()
                if (rect.width > 0 || rect.height > 0) return { getBoundingClientRect: () => rect }
              }
              return null
            }
            const { x: clickX, y: clickY } = lastClickRef.current
            const domSel = window.getSelection()
            const el = domSel?.focusNode instanceof Text
              ? domSel.focusNode.parentElement
              : domSel?.focusNode as HTMLElement | null
            const lineHeight = el
              ? parseFloat(getComputedStyle(el).lineHeight) || 24
              : 24
            return {
              getBoundingClientRect: () => new DOMRect(
                clickX,
                clickY - lineHeight / 2,
                1,
                lineHeight,
              ),
            }
          }}
          className="flex gap-0.5 border border-line bg-paper/85 p-1 shadow-none backdrop-blur-lg z-20 context-menu-fade context-menu-visible dark:bg-paper/85"
        >
          <BubbleMenuButtons editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {!isMobile && (
        <BlockTypeMenu editor={editor} position={blockMenuPosition} onClose={closeBlockMenu} blockPos={blockMenuPos} />
      )}
    </div>

    {/* 移动端键盘工具栏 */}
    {isMobile && keyboardVisible && editor?.isFocused && typeof document !== 'undefined' && (
      <MobileEditorToolbar
        editor={editor}
        keyboardHeight={keyboardHeight}
        toolbarTick={toolbarTick}
        mobileToolbarRef={mobileToolbarRef}
        mobileBlockMenuRef={mobileBlockMenuRef}
        mobileBlockMenuOpen={mobileBlockMenuOpen}
        setMobileBlockMenuOpen={setMobileBlockMenuOpen}
        handleToolbarPointerDown={handleToolbarPointerDown}
      />
    )}    </ContextMenu>
  )
}





