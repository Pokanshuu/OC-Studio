'use client'

import { useState, useEffect, useCallback, useId, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { BubbleMenuProps } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/core'
import React from 'react'

import { BlockTypeMenu } from './BlockTypeMenu'
import { useDevice } from '@/lib/use-device'
import { useActiveEditor } from '@/lib/editor-context'
import { MENU } from '@/lib/ui-tokens'
import { useKeyboard } from '@/lib/KeyboardContext'
import { ContextMenu } from '@/components/shared/ContextMenu'
import { BubbleMenuButtons } from './BubbleMenuButtons'
import { buildEditorContextMenu } from './editor-context-menu'
import { MobileEditorToolbar } from './MobileEditorToolbar'

import { buildEditorConfig, BLOCK_MENU_EVENT } from './editor-config'
import { bindMobileEditorEvents } from './editor-mobile-events'
import { useEditorBubbleMenu } from './useEditorBubbleMenu'
import { useEditorMobileInput } from './useEditorMobileInput'
import { useImagePasteDrop } from './useImagePasteDrop'
import { FindReplaceBar } from './FindReplaceBar'
import { OutlinePanel } from './OutlinePanel'
import { LinkPopover } from './LinkPopover'
import { OPEN_FIND_EVENT, OPEN_OUTLINE_EVENT, type OpenFindEventDetail, type OpenOutlineEventDetail } from './editor-events'

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

/**
 * 气泡菜单定位：编辑器顶上是浮在正文上的 48px 毛玻璃条，
 * 气泡默认往上弹会被它盖住一半。flip 的 padding 把顶部 56px 划成禁区，
 * 选区贴顶时自动翻到下方；常量放在模块级，避免每次渲染换身份触发 updateOptions。
 */
const BUBBLE_MENU_OPTIONS = {
  placement: 'top',
  offset: 8,
  flip: { padding: { top: 56, bottom: 8, left: 8, right: 8 } },
  shift: { padding: 8 },
} satisfies NonNullable<BubbleMenuProps['options']>

export function EditorCore({
  onReady, onCharacterCount, onContentChange, content, placeholder, onMentionClick, onWikiLinkClick, plain,
}: EditorCoreProps) {
  const editorId = useId()
  const [blockMenuPosition, setBlockMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [blockMenuPos, setBlockMenuPos] = useState<number | undefined>(undefined)
  const [findOpen, setFindOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null | undefined>(undefined)
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
  const keyboardVisibleRef = useRef(keyboardVisible)
  useEffect(() => {
    keyboardVisibleRef.current = keyboardVisible
  }, [keyboardVisible])
  const lastClickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

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
      const next = editor.isActive('table')
      setIsTableActive((prev) => (prev === next ? prev : next))
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

  // 移动端工具栏自定义事件（MobileTextSelectionBar → EditorCore）
  useEffect(() => {
    if (!isMobile || !editor) return
    return bindMobileEditorEvents(editor)
  }, [isMobile, editor])

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

  // 移动端：触摸补焦 / 键盘遮挡 / 选区缓存
  useEditorMobileInput({ editor, isMobile, keyboardVisible, editorRef })

  // 桌面端气泡菜单显隐时机（点选后立即出现 / 输入中隐藏）
  const { isTypingRef } = useEditorBubbleMenu({ editor, isMobile, editorRef })

  // Ctrl/Cmd+F / Ctrl/Cmd+H：只在编辑区聚焦时拦截，打开查找替换。
  useEffect(() => {
    if (!editor) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (!editor.isFocused) return
      const key = e.key.toLowerCase()
      if (key === 'o' && e.shiftKey) {
        e.preventDefault()
        setOutlineOpen(true)
        return
      }
      if (key !== 'f' && key !== 'h') return
      e.preventDefault()
      setFindOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor])

  // 工具栏的「查找替换」入口（工具栏与 EditorCore 是兄弟节点，用事件只开对应实例）。
  useEffect(() => {
    if (!editor) return
    const onOpenFind = (e: Event) => {
      const detail = (e as CustomEvent<OpenFindEventDetail>).detail
      if (detail?.editor === editor) setFindOpen(true)
    }
    window.addEventListener(OPEN_FIND_EVENT, onOpenFind)
    return () => window.removeEventListener(OPEN_FIND_EVENT, onOpenFind)
  }, [editor])

  // 工具栏的「大纲」入口（同上，事件只开对应实例）。
  useEffect(() => {
    if (!editor) return
    const onOpenOutline = (e: Event) => {
      const detail = (e as CustomEvent<OpenOutlineEventDetail>).detail
      if (detail?.editor === editor) setOutlineOpen(true)
    }
    window.addEventListener(OPEN_OUTLINE_EVENT, onOpenOutline)
    return () => window.removeEventListener(OPEN_OUTLINE_EVENT, onOpenOutline)
  }, [editor])

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
  }, [isMobile, editor, setToolbarTick])

  // 移动端工具栏统一 onPointerDown 入口：preventDefault + stopPropagation + 执行命令
  const handleToolbarPointerDown = useCallback((e: React.PointerEvent, action: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    handleToolbarAction(action)
  }, [handleToolbarAction])

  const contextMenuItems = useMemo(
    () => buildEditorContextMenu({ editor, isTableActive, onFind: () => setFindOpen(true) }),
    [editor, isTableActive],
  )
  const { dragging } = useImagePasteDrop(editor)
  if (!editor) {
    return <div className="flex h-32 items-center justify-center text-sm text-ink-muted">编辑器加载中...</div>
  }

  return (
    <ContextMenu items={contextMenuItems}>
    <div
      className={plain
        ? 'relative'
        : 'relative rounded-item border border-transparent bg-paper transition-colors hover:border-line focus-within:border-line-hover'
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
          options={BUBBLE_MENU_OPTIONS}
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
          className={`flex gap-0.5 ${MENU} z-20 context-menu-fade context-menu-visible`}
        >
          <BubbleMenuButtons editor={editor} onLinkClick={(anchor) => setLinkAnchor(anchor)} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {dragging ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-item border border-dashed border-line-hover"
          aria-hidden
        />
      ) : null}
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
    )}

    {findOpen ? (
      <FindReplaceBar editor={editor} onClose={() => setFindOpen(false)} />
    ) : null}
    {outlineOpen ? (
      <OutlinePanel editor={editor} onClose={() => setOutlineOpen(false)} />
    ) : null}
    {linkAnchor !== undefined ? (
      <LinkPopover editor={editor} anchor={linkAnchor} onClose={() => setLinkAnchor(undefined)} />
    ) : null}
    </ContextMenu>
  )
}











