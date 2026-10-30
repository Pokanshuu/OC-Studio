'use client'

import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { Pilcrow, ChevronDown, Bold, Italic, Underline as UnderlineIcon, AtSign, Link2, Undo2, Redo2, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, Quote, Scissors, Image, Table as TableIcon } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { isBelowTargetVersion } from '@/lib/browser-compat'
import { ROUND_ITEM } from '@/lib/ui-tokens'

export interface MobileEditorToolbarProps {
  editor: Editor
  keyboardHeight: number
  toolbarTick: number
  mobileToolbarRef: RefObject<HTMLDivElement | null>
  mobileBlockMenuRef: RefObject<HTMLDivElement | null>
  mobileBlockMenuOpen: boolean
  setMobileBlockMenuOpen: (open: boolean) => void
  handleToolbarPointerDown: (e: React.PointerEvent, action: () => void) => void
}

/**
 * 移动端编辑器键盘工具栏 + 块类型面板。
 *
 * 只由 EditorCore 在「移动端 + 软键盘可见 + 编辑器聚焦」时挂载，自身负责 portal 到
 * #overlay-root。单独成组件的原因：约 115 行 JSX（含 11 个块类型项的数组与内联样式），
 * 与编辑器内核的「组装」逻辑无关。
 */
export function MobileEditorToolbar({
  editor,
  keyboardHeight,
  toolbarTick,
  mobileToolbarRef,
  mobileBlockMenuRef,
  mobileBlockMenuOpen,
  setMobileBlockMenuOpen,
  handleToolbarPointerDown,
}: MobileEditorToolbarProps) {
  return createPortal(
    <>        <>
        {mobileBlockMenuOpen && (
          <div
            className="pointer-events-auto fixed inset-0 z-30"
            onPointerDown={() => setMobileBlockMenuOpen(false)}
          />
        )}
        <div
          ref={mobileToolbarRef}
          className="pointer-events-auto fixed left-0 right-0 z-30 flex items-center gap-2 px-3 py-2 bg-paper/85 backdrop-blur-lg border-t border-line"
          style={{ bottom: `${keyboardHeight}px`, ...(isBelowTargetVersion() ? { paddingBottom: 'var(--safe-bottom, 0px)' } : {}) }}
          data-tick={toolbarTick}
        >
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => {
              if (!editor) return
              editor.chain().focus().run()
              setMobileBlockMenuOpen(!mobileBlockMenuOpen)
            })}
            className="touch-feedback flex h-8 shrink-0 items-center gap-1 px-2.5 text-[13px] text-ink-muted"
          >
            <Pilcrow size={14} strokeWidth={2} />
            <ChevronDown size={14} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().toggleBold().run())}
            className={`touch-feedback flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${editor?.isActive('bold') ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted'}`}
          >
            <Bold size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().toggleItalic().run())}
            className={`touch-feedback flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${editor?.isActive('italic') ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted'}`}
          >
            <Italic size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().toggleUnderline().run())}
            className={`touch-feedback flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${editor?.isActive('underline') ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted'}`}
          >
            <UnderlineIcon size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().insertContent(' @').run())}
            className={`touch-feedback flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${editor?.isActive('mention') ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted'}`}
          >
            <AtSign size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().insertContent(' [[').run())}
            className="touch-feedback flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted transition-colors"
          >
            <Link2 size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().undo().run())}
            disabled={!editor?.can().undo()}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted transition-colors active:bg-[var(--oc-hover)] disabled:opacity-30"
          >
            <Undo2 size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => handleToolbarPointerDown(e, () => editor?.chain().focus().redo().run())}
            disabled={!editor?.can().redo()}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-muted transition-colors active:bg-[var(--oc-hover)] disabled:opacity-30"
          >
            <Redo2 size={16} strokeWidth={2} />
          </button>
        </div>

        {/* 移动端块类型选择面板 */}
        {mobileBlockMenuOpen && (
          <div
            ref={mobileBlockMenuRef}
            className="pointer-events-auto fixed left-0 right-0 z-40 p-3 bg-paper/85 backdrop-blur-lg border-t border-line"
            style={{ bottom: `${isBelowTargetVersion() ? keyboardHeight + 52 : keyboardHeight + 44}px`, ...(isBelowTargetVersion() ? { paddingBottom: 'var(--safe-bottom, 0px)' } : {}) }}
          >
            <div className="flex flex-wrap gap-2">
              {[
                { label: '段落', icon: <Pilcrow size={16} strokeWidth={2} />, action: () => editor?.chain().focus().setParagraph().run(), active: () => editor?.isActive('paragraph') ?? false },
                { label: 'H1', icon: <Heading1 size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor?.isActive('heading', { level: 1 }) },
                { label: 'H2', icon: <Heading2 size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive('heading', { level: 2 }) },
                { label: 'H3', icon: <Heading3 size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor?.isActive('heading', { level: 3 }) },
                { label: '无序列表', icon: <List size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleBulletList().run(), active: () => editor?.isActive('bulletList') ?? false },
                { label: '有序列表', icon: <ListOrdered size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleOrderedList().run(), active: () => editor?.isActive('orderedList') ?? false },
                { label: '任务列表', icon: <ListTodo size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleTaskList().run(), active: () => editor?.isActive('taskList') ?? false },
                { label: '引用', icon: <Quote size={16} strokeWidth={2} />, action: () => editor?.chain().focus().toggleBlockquote().run(), active: () => editor?.isActive('blockquote') ?? false },
                { label: '分割线', icon: <Scissors size={16} strokeWidth={2} />, action: () => editor?.chain().focus().setHorizontalRule().run(), active: () => false },
                { label: '图片', icon: <Image size={16} strokeWidth={2} />, action: () => editor?.chain().focus().insertContent({ type: 'imageBlock' }).run(), active: () => false },
                { label: '表格', icon: <TableIcon size={16} strokeWidth={2} />, action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: () => false },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onPointerDown={(e) => handleToolbarPointerDown(e, () => { item.action(); setMobileBlockMenuOpen(false) })}
                  className={`touch-feedback flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] transition-colors ${ROUND_ITEM} ${item.active() ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted'}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        </>,
    </>,
    document.getElementById('overlay-root') ?? document.body,
  )
}


