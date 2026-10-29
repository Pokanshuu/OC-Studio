'use client'

import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { EditorToolbar } from '@/components/editor/EditorToolbar'

interface EditorBodyPaneProps {
  editor: Editor | null
  children: ReactNode
  /** 多栏把工具条并进顶栏时置 false，正文区只留滚动 */
  showToolbar?: boolean
}

/**
 * 三栏右栏：工具条固定在滚动容器之外，正文单独限宽。
 * 正文的 DocumentEditor 由调用方传进来（并设置 showToolbar=false）。
 */
export function EditorBodyPane({ editor, children, showToolbar = true }: EditorBodyPaneProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showToolbar && editor ? <EditorToolbar editor={editor} sticky={false} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="h-12 shrink-0" aria-hidden />
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">{children}</div>
      </div>
    </section>
  )
}
