'use client'

import type { Editor } from '@tiptap/core'
import { DocumentEditor } from './DocumentEditor'

interface EntityDocumentBodyProps {
  entityId: number
  entityType: 'character' | 'event' | 'country'
  fallbackContent?: string | object
  placeholder?: string
  onReady: (editor: Editor) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
  onDocChange?: () => void
}

/**
 * 实体正文编辑器（复用组件）。
 * 工具条由外层 EntityEditorShell 统一渲染在顶栏；这里只负责正文，不重复工具条。
 * 全屏/分栏使用同一份正文，保证两边的编辑能力一致。
 */
export function EntityDocumentBody({
  entityId,
  entityType,
  fallbackContent,
  placeholder,
  onReady,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
  onDocChange,
}: EntityDocumentBodyProps) {
  return (
    <DocumentEditor
      entityId={entityId}
      entityType={entityType}
      fallbackContent={fallbackContent}
      onReady={onReady}
      placeholder={placeholder}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
      onDocChange={onDocChange}
      showToolbar={false}
    />
  )
}
