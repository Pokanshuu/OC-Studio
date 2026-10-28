'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'
import { MultiColumnEditor } from '@/components/shared/MultiColumnEditor'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { Event } from '@/types'
import type { EventForm } from '../hooks/useEventForm'
import { EventEditorList } from './EventEditorList'
import { EventInfoSection } from './EventInfoSection'
import { EventRelationSection } from './EventRelationSection'

interface EventEditorMultiProps {
  event: Event
  form: EventForm
  railOpen: boolean
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onNavigateItem?: (id: number, type?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

/** 三栏事件编辑器：左列表 / 中元数据 / 右正文。 */
export function EventEditorMulti({
  event,
  form,
  railOpen,
  onNavigateToEvent,
  onMentionClick,
  onNavigateItem,
  onCharacterCount,
  onWikiLinkClick,
}: EventEditorMultiProps) {
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)

  return (
    <MultiColumnEditor
      railOpen={railOpen}
      rail={<EventEditorList currentId={event.id} onSelect={onNavigateToEvent} />}
      meta={
        <div className="flex flex-col gap-6 p-4">
          <ProfileBannerEditor
            headerUrl={form.headerUrl}
            onHeaderChange={form.setHeaderUrl}
            onHeaderRemove={() => form.setHeaderUrl('')}
          />

          <input
            type="text"
            value={form.title}
            onChange={(e) => form.setTitle(e.target.value)}
            placeholder="事件标题"
            className={TITLE_INPUT}
          />

          <EventInfoSection form={form} compact />

          <div className="border-t border-line" />
          <EventRelationSection form={form} onNavigateItem={onNavigateItem} />
        </div>
      }
    >
      <EditorBodyPane editor={bodyEditor}>
        <DocumentEditor
          entityId={event.id}
          entityType="event"
          fallbackContent={event.content}
          onReady={(editor) => {
            setBodyEditor(editor)
            form.handleEditorReady(editor)
          }}
          placeholder="开始编写事件内容..."
          onMentionClick={onMentionClick}
          onCharacterCount={onCharacterCount}
          onWikiLinkClick={onWikiLinkClick}
          onDocChange={form.handleDocChange}
          showToolbar={false}
        />
      </EditorBodyPane>
    </MultiColumnEditor>
  )
}
