'use client'

/** 气泡菜单（选中文本时浮动）里的按钮组。 */

import { Bold, Italic, Underline as UnderlineIcon, AtSign, Link2 } from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'

export function BubbleMenuButtons({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      mention: e.isActive('mention'),
    }),
  })

  const base = 'flex h-8 w-8 items-center justify-center rounded-item transition-colors'
  const active = 'bg-ink text-paper'
  const inactive = 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'

  return (
    <>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} className={`${base} ${state.bold ? active : inactive}`}>
        <Bold size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} className={`${base} ${state.italic ? active : inactive}`}>
        <Italic size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }} className={`${base} ${state.underline ? active : inactive}`}>
        <UnderlineIcon size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' @').run() }} className={`${base} ${state.mention ? active : inactive}`} title="@ 引用">
        <AtSign size={16} strokeWidth={2} />
      </button>
      <button onPointerDown={(e) => { e.preventDefault(); editor.chain().focus().insertContent(' [[').run() }} className={`${base} ${inactive}`} title="[[ 内链">
        <Link2 size={16} strokeWidth={2} />
      </button>
    </>
  )
}



