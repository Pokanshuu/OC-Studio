'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'

interface WorldEntryBodyProps {
  selectedId: number
  /** 三栏右栏：工具条在滚动容器外；单栏：工具条在正文上方 */
  pane: boolean
  onReady: (editor: Editor) => void
  onContentChange: (html: string) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

/** 词条正文：EditorCore + 桌面格式工具条。 */
export function WorldEntryBody({
  selectedId,
  pane,
  onReady,
  onContentChange,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: WorldEntryBodyProps) {
  const [editor, setEditor] = useState<Editor | null>(null)

  const core = (
    <EditorCore
      plain
      key={selectedId}
      onReady={(ready) => {
        setEditor(ready)
        onReady(ready)
      }}
      content=""
      placeholder="编写词条内容... 输入 @ 引用角色/事件/国家，输入 / 插入块"
      onContentChange={onContentChange}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
    />
  )

  if (pane) {
    return <EditorBodyPane editor={editor}>{core}</EditorBodyPane>
  }

  return (
    <>
      {editor ? <EditorToolbar editor={editor} /> : null}
      {core}
    </>
  )
}
