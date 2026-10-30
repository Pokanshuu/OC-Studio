'use client'

/** 气泡菜单（选中文本时浮动）里的按钮组。 */

import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link, AtSign, Link2 } from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'

interface BubbleMenuButtonsProps {
  editor: Editor
  /** 打开链接浮层；锚点传触发按钮，浮层贴它落下。 */
  onLinkClick?: (anchor: HTMLElement) => void
}

export function BubbleMenuButtons({ editor, onLinkClick }: BubbleMenuButtonsProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      mention: e.isActive('mention'),
    }),
  })

  const base = 'flex h-8 w-8 items-center justify-center rounded-item transition-colors'
  const active = 'bg-[var(--oc-hover)] text-ink'
  const inactive = 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'

  return (
    <>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
        className={`${base} ${state.bold ? active : inactive}`}
        title="粗体"
        aria-label="粗体"
      >
        <Bold size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
        className={`${base} ${state.italic ? active : inactive}`}
        title="斜体"
        aria-label="斜体"
      >
        <Italic size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
        className={`${base} ${state.underline ? active : inactive}`}
        title="下划线"
        aria-label="下划线"
      >
        <UnderlineIcon size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }}
        className={`${base} ${state.strike ? active : inactive}`}
        title="删除线"
        aria-label="删除线"
      >
        <Strikethrough size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
        className={`${base} ${state.code ? active : inactive}`}
        title="行内代码"
        aria-label="行内代码"
      >
        <Code size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault() }}
        onClick={(e) => onLinkClick?.(e.currentTarget)}
        className={`${base} ${state.link ? active : inactive}`}
        title="链接"
        aria-label="链接"
      >
        <Link size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' @').run() }}
        className={`${base} ${state.mention ? active : inactive}`}
        title="@ 引用"
        aria-label="@ 引用"
      >
        <AtSign size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' [[').run() }}
        className={`${base} ${inactive}`}
        title="[[ 内链"
        aria-label="[[ 内链"
      >
        <Link2 size={16} strokeWidth={2} />
      </button>
    </>
  )
}
