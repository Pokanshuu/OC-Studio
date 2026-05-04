'use client'

import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo2,
  Redo2,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import type { Editor } from '@tiptap/core'

interface EditorToolbarProps {
  editor: Editor | null
}

const headingOptions = [
  { label: '正文', level: 0 },
  { label: 'H1', level: 1 },
  { label: 'H2', level: 2 },
  { label: 'H3', level: 3 },
] as const

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) {
    return (
      <div className="flex h-10 items-center border-b border-line bg-paper-alt px-2">
        <span className="text-xs text-ink-faint">编辑器加载中...</span>
      </div>
    )
  }

  const handleHeadingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const level = Number(e.target.value)
    if (level === 0) {
      editor.chain().focus().setParagraph().run()
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
    }
  }

  const activeHeadingLevel = headingOptions.find(
    (opt) => opt.level !== 0 && editor.isActive('heading', { level: opt.level }),
  )?.level ?? 0

  const btnClass =
    'flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink'

  const btnActiveClass =
    'flex h-8 w-8 items-center justify-center rounded bg-paper-card text-ink transition-colors hover:text-ink'

  return (
    <div className="flex h-10 items-center border-b border-line bg-paper-alt px-2">
      <button
        onClick={() => editor.chain().focus().undo().run()}
        className={btnClass}
        title="撤销"
      >
        <Undo2 size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        className={btnClass}
        title="重做"
      >
        <Redo2 size={16} strokeWidth={2} />
      </button>

      <Separator orientation="vertical" className="h-4 !self-center" />

      <select
        value={activeHeadingLevel}
        onChange={handleHeadingChange}
        className="h-9 rounded border border-line bg-paper-card px-3 text-sm text-ink focus:border-line-hover focus:outline-none"
      >
        {headingOptions.map((opt) => (
          <option key={opt.level} value={opt.level}>
            {opt.label}
          </option>
        ))}
      </select>

      <Separator orientation="vertical" className="h-4 !self-center" />

      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? btnActiveClass : btnClass}
        title="加粗"
      >
        <Bold size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? btnActiveClass : btnClass}
        title="斜体"
      >
        <Italic size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={editor.isActive('underline') ? btnActiveClass : btnClass}
        title="下划线"
      >
        <Underline size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={editor.isActive('strike') ? btnActiveClass : btnClass}
        title="删除线"
      >
        <Strikethrough size={16} strokeWidth={2} />
      </button>

      <Separator orientation="vertical" className="h-4 !self-center" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? btnActiveClass : btnClass}
        title="无序列表"
      >
        <List size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? btnActiveClass : btnClass}
        title="有序列表"
      >
        <ListOrdered size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive('blockquote') ? btnActiveClass : btnClass}
        title="引用"
      >
        <Quote size={16} strokeWidth={2} />
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btnClass}
        title="分隔线"
      >
        <Minus size={16} strokeWidth={2} />
      </button>
    </div>
  )
}