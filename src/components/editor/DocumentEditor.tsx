import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { useDocument } from '@/hooks/useDocument'

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
}: DocumentEditorProps) {
  const { document, loading, error } = useDocument(entityId, entityType)

  if (loading) {
    return (
      <div className="flex py-8 items-center justify-center">
        <span className="text-sm text-ink-muted">加载中...</span>
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

  const content = document ?? fallbackContent ?? getDefaultDocument(entityType)

  return (
    <EditorCore
      plain
      content={content}
      onReady={onReady}
      onCharacterCount={onCharacterCount}
      onMentionClick={onMentionClick}
      onWikiLinkClick={onWikiLinkClick}
      onContentChange={onDocChange ? () => onDocChange() : undefined}
      placeholder={placeholder}
    />
  )
}

type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string }

function t(value: string): DocNode { return { type: 'text', text: value } }
function h2b(text: string): DocNode { return { type: 'heading', attrs: { level: 2 }, content: [t(text)] } }
function p(text?: string): DocNode { return text ? { type: 'paragraph', content: [t(text)] } : { type: 'paragraph' } }
function pp(placeholder: string): DocNode { return { type: 'paragraph', attrs: { placeholder } } }
function hr(): DocNode { return { type: 'horizontalRule' } }

function getDefaultDocument(type: EntityType): DocNode {
  switch (type) {
    case 'character':
      return {
        type: 'doc',
        content: [
          h2b('人物简介'), pp('编写角色简介...'),
          hr(),
          h2b('人物生平'), pp('编写角色生平...'),
        ],
      }
    case 'event':
      return { type: 'doc', content: [pp('开始编写事件内容...')] }
    case 'country':
      return {
        type: 'doc',
        content: [
          h2b('政治制度'), pp('政治制度、权力结构...'),
          hr(),
          h2b('地理环境'), pp('地形、气候、自然资源...'),
          hr(),
          h2b('人文风貌'), pp('文化、宗教、人口...'),
        ],
      }
    case 'worldEntry':
      return { type: 'doc', content: [p()] }
  }
}
