'use client'

import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'

interface WorldEntryBodyProps {
  selectedId: number
  /** 分栏右栏：只留滚动；工具条由 EntityEditorShell 顶栏统一渲染 */
  pane: boolean
  onReady: (editor: Editor) => void
  onContentChange: (html: string) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

/** 词条正文：只负责 EditorCore；全屏/分栏共用同一份正文。 */
export function WorldEntryBody({
  selectedId,
  pane,
  onReady,
  onContentChange,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: WorldEntryBodyProps) {
  const core = (
    <EditorCore
      plain
      key={selectedId}
      onReady={onReady}
      content=""
      placeholder="编写词条内容... 输入 @ 引用角色/事件/国家，输入 / 插入块"
      onContentChange={onContentChange}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
    />
  )

  if (pane) {
    return (
      <EditorBodyPane editor={null} showToolbar={false}>
        {core}
      </EditorBodyPane>
    )
  }

  return core
}
