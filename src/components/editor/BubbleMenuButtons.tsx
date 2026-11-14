'use client'

/** 气泡菜单（选中文本时浮动）里的按钮组。 */

import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, AtSign, Link2 } from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { Tip } from '@/components/ui/tooltip'

interface BubbleMenuButtonsProps {
  editor: Editor
}

export function BubbleMenuButtons({ editor }: BubbleMenuButtonsProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      mention: e.isActive('mention'),
    }),
  })

  const base = 'flex h-8 w-8 items-center justify-center rounded-item transition-colors'
  const active = 'bg-[var(--oc-hover)] text-ink'
  const inactive = 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'

  return (
    <>
      <Tip label="粗体" shortcut="Ctrl+B">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className={`${base} ${state.bold ? active : inactive}`}
          aria-label="粗体"
        >
          <Bold size={16} strokeWidth={2} />
        </button>
      </Tip>
      <Tip label="斜体" shortcut="Ctrl+I">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          className={`${base} ${state.italic ? active : inactive}`}
          aria-label="斜体"
        >
          <Italic size={16} strokeWidth={2} />
        </button>
      </Tip>
      <Tip label="下划线" shortcut="Ctrl+U">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
          className={`${base} ${state.underline ? active : inactive}`}
          aria-label="下划线"
        >
          <UnderlineIcon size={16} strokeWidth={2} />
        </button>
      </Tip>
      <Tip label="删除线" shortcut="Ctrl+Shift+S">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }}
          className={`${base} ${state.strike ? active : inactive}`}
          aria-label="删除线"
        >
          <Strikethrough size={16} strokeWidth={2} />
        </button>
      </Tip>
      <Tip label="@ 引用">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' @').run() }}
          className={`${base} ${state.mention ? active : inactive}`}
          aria-label="@ 引用"
        >
          <AtSign size={16} strokeWidth={2} />
        </button>
      </Tip>
      <Tip label="[[ 内链">
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' [[').run() }}
          className={`${base} ${inactive}`}
          aria-label="[[ 内链"
        >
          <Link2 size={16} strokeWidth={2} />
        </button>
      </Tip>
    </>
  )
}
