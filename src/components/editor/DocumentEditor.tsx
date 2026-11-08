'use client'

import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { useDocument } from '@/hooks/useDocument'
import { defaultBodyDocument } from '@/lib/body-skeleton'

type EntityType = 'character' | 'event' | 'country' | 'worldEntry'

interface DocumentEditorProps {
  entityId: number
  entityType: EntityType
  fallbackContent?: string | object
  onReady: (editor: Editor) => void
  onCharacterCount?: (count: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onWikiLinkClick?: (id: string) => void
  onDocChange?: () => void
  placeholder?: string
  /** 三栏右栏自己渲染工具条时置 false，避免出现两条 */
  showToolbar?: boolean
}

export function DocumentEditor({
  entityId,
  entityType,
  fallbackContent,
  onReady,
  onCharacterCount,
  onMentionClick,
  onWikiLinkClick,
  onDocChange,
  placeholder,
  showToolbar = true,
}: DocumentEditorProps) {
  const { document, loading, error } = useDocument(entityId, entityType)
  const [editor, setEditor] = useState<Editor | null>(null)

  const handleReady = useCallback(
    (ready: Editor) => {
      setEditor(ready)
      onReady(ready)
    },
    [onReady],
  )

  if (loading) {
    return (
      <div className="flex py-8 items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex py-8 items-center justify-center">
        <span className="text-sm text-error">{error}</span>
      </div>
    )
  }

  const content = document ?? fallbackContent ?? defaultBodyDocument(entityType)

  return (
    <div>
      {showToolbar && editor ? <EditorToolbar editor={editor} /> : null}
      <EditorCore
        plain
        content={content}
        onReady={handleReady}
        onCharacterCount={onCharacterCount}
        onMentionClick={onMentionClick}
        onWikiLinkClick={onWikiLinkClick}
        onContentChange={onDocChange ? () => onDocChange() : undefined}
        placeholder={placeholder}
      />
    </div>
  )
}

