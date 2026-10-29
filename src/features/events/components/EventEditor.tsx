'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { EntityDocumentBody } from '@/components/editor/EntityDocumentBody'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'
import { EditorSplitPane } from '@/components/editor/EditorSplitPane'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import type { Event } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { useEditorLayout } from '@/lib/use-editor-layout'
import { useDevice } from '@/lib/use-device'
import type { EventFormData } from '../types'
import { useEventForm } from '../hooks/useEventForm'
import { EventEditorList } from './EventEditorList'
import { EventFrontmatter } from './EventFrontmatter'
import { BTN_PRIMARY } from '@/lib/ui-tokens'

interface EventEditorProps {
  event: Event
  onBack: () => void
  onCreate?: () => void
  onSave: (id: number, data: Partial<EventFormData>) => Promise<void>
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onNavigateItem?: (id: number, type?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function EventEditor({ event, onBack, onCreate, onSave, onNavigateToEvent, onMentionClick, onNavigateItem, onCharacterCount, onWikiLinkClick }: EventEditorProps) {
  const form = useEventForm(event, onSave)
  const { handleSave, docDirty } = form
  const { isMobile } = useDevice()
  const [listOpen, setListOpen] = useState(!isMobile)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const desiredLayout = useEditorLayout()
  const [layout, setLayout] = useState<'multi' | 'full'>(desiredLayout)

  useEffect(() => {
    if (desiredLayout === layout) return
    if (!docDirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLayout(desiredLayout)
      return
    }
    let cancelled = false
    void handleSave().then(() => {
      if (!cancelled) setLayout(desiredLayout)
    })
    return () => {
      cancelled = true
    }
  }, [desiredLayout, layout, docDirty, handleSave])

  const headerActions = (
    <>
      <EntityHistoryButton table="events" id={event.id} name={form.title} />
      <button
        onClick={form.handleSave}
        disabled={form.saving || !form.title.trim()}
        data-save-button
        aria-label={form.saving ? '保存中' : '保存'}
        title={form.saving ? '保存中' : '保存'}
        className={BTN_PRIMARY}
      >
        <Save size={14} strokeWidth={2} />
        <span>{form.saving ? '保存中...' : '保存'}</span>
      </button>
    </>
  )

  const handleBodyReady = (editor: Editor) => {
    setBodyEditor(editor)
    form.handleEditorReady(editor)
  }

  const body = (
    <EntityDocumentBody
      entityId={event.id}
      entityType="event"
      fallbackContent={event.content}
      onReady={handleBodyReady}
      placeholder="开始编写事件内容..."
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
      onDocChange={form.handleDocChange}
    />
  )

  return (
    <EntityEditorShell
      title="编辑事件"
      onBack={onBack}
      listOpen={listOpen}
      onToggleList={() => setListOpen((open) => !open)}
      list={
        <EventEditorList
          currentId={event.id}
          onSelect={onNavigateToEvent}
          onCollapse={() => setListOpen(false)}
          onCreate={onCreate}
        />
      }
      editor={bodyEditor}
      headerRight={headerActions}
    >
      {layout === 'multi' ? (
        <EditorSplitPane
          meta={
            <EventFrontmatter form={form} compact onNavigateItem={onNavigateItem} />
          }
        >
          <EditorBodyPane editor={bodyEditor} showToolbar={false}>
            <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">{body}</div>
          </EditorBodyPane>
        </EditorSplitPane>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="h-12 shrink-0" aria-hidden />
          <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
            <EventFrontmatter form={form} compact={false} onNavigateItem={onNavigateItem} />
            <div className="mt-8 border-t border-line" />
            <div className="mt-8">{body}</div>
          </div>
        </div>
      )}
    </EntityEditorShell>
  )
}
