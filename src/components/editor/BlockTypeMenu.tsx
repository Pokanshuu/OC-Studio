'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Scissors,
  Image as ImageIcon,
  Table as TableIcon,
} from 'lucide-react'
import React from 'react'

interface BlockButton {
  label: string
  icon: React.ReactNode
  action: () => void
  isActive: () => boolean
}

interface BlockTypeMenuProps {
  editor: Editor
  position: { x: number; y: number } | null
  onClose: () => void
  blockPos?: number
}

export function BlockTypeMenu({ editor, position, onClose, blockPos }: BlockTypeMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (position) {
      requestAnimationFrame(() => setVisible(true))
    }
  }, [position])

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(() => onClose(), 150)
  }, [onClose])

  useEffect(() => {
    if (!position) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    const id = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('click', handleClick)
    }
  }, [position, handleClose])

  useEffect(() => {
    if (!position) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [position, handleClose])

  if (!position) return null

  const chain = () => {
    if (blockPos != null) {
      return editor.chain().setNodeSelection(blockPos)
    }
    return editor.chain().focus()
  }

  const buttons: BlockButton[] = [
    {
      label: '段落',
      icon: <Pilcrow size={14} strokeWidth={2} />,
      action: () => {
        chain().setParagraph().run()
        handleClose()
      },
      isActive: () => editor.isActive('paragraph'),
    },
    {
      label: 'H1',
      icon: <Heading1 size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleHeading({ level: 1 }).run()
        handleClose()
      },
      isActive: () => editor.isActive('heading', { level: 1 }),
    },
    {
      label: 'H2',
      icon: <Heading2 size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleHeading({ level: 2 }).run()
        handleClose()
      },
      isActive: () => editor.isActive('heading', { level: 2 }),
    },
    {
      label: 'H3',
      icon: <Heading3 size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleHeading({ level: 3 }).run()
        handleClose()
      },
      isActive: () => editor.isActive('heading', { level: 3 }),
    },
    {
      label: '无序列表',
      icon: <List size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleBulletList().run()
        handleClose()
      },
      isActive: () => editor.isActive('bulletList'),
    },
    {
      label: '有序列表',
      icon: <ListOrdered size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleOrderedList().run()
        handleClose()
      },
      isActive: () => editor.isActive('orderedList'),
    },
    {
      label: '待办列表',
      icon: <ListTodo size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleTaskList().run()
        handleClose()
      },
      isActive: () => editor.isActive('taskList'),
    },
    {
      label: '引用',
      icon: <Quote size={14} strokeWidth={2} />,
      action: () => {
        chain().toggleBlockquote().run()
        handleClose()
      },
      isActive: () => editor.isActive('blockquote'),
    },
    {
      label: '分割线',
      icon: <Scissors size={14} strokeWidth={2} />,
      action: () => {
        chain().setHorizontalRule().run()
        handleClose()
      },
      isActive: () => false,
    },
    {
      label: '图片占位',
      icon: <ImageIcon size={14} strokeWidth={2} />,
      action: () => {
         chain().insertContent({ type: 'imageBlock' }).run()
        handleClose()
      },
      isActive: () => editor.isActive('imageBlock'),
    },
    {
      label: '表格',
      icon: <TableIcon size={14} strokeWidth={2} />,
      action: () => {
        chain().insertTable({ rows: 3, cols: 3 }).run()
        handleClose()
      },
      isActive: () => false,
    },
  ]

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x + 12,
        top: position.y - 4,
        zIndex: 100,
      }}
      className={`pointer-events-auto flex gap-0.5 rounded-md border border-line bg-paper/85 dark:bg-paper/85 backdrop-blur-lg p-1 shadow-none ring-1 ring-black/5 context-menu-fade ${visible ? 'context-menu-visible' : ''}`}
    >
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={btn.action}
          title={btn.label}
          onMouseDown={(e) => e.preventDefault()}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            btn.isActive()
              ? 'text-ink bg-black/5 dark:bg-white/5'
              : 'text-ink-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          {btn.icon}
        </button>
      ))}
    </div>,
    document.getElementById('overlay-root') ?? document.body,
  )
}
