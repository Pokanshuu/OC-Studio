'use client'

import { Save, ArrowLeft } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import { useEventForm } from '../hooks/useEventForm'
import { EventInfoSection } from './EventInfoSection'
import { EventRelationSection } from './EventRelationSection'
import { BTN_PRIMARY, EDITOR_BODY, EDITOR_HEADER, ICON_BTN_MD, PAGE_TITLE, SECTION_TITLE, TITLE_INPUT } from '@/lib/ui-tokens'

interface EventEditorProps {
  event: Event
  onBack: () => void
  onSave: (id: number, data: Partial<EventFormData>) => Promise<void>
  onMentionClick?: (id: string, entityType?: string) => void
  onNavigateItem?: (id: number, type?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function EventEditor({ event, onBack, onSave, onMentionClick, onNavigateItem, onCharacterCount, onWikiLinkClick }: EventEditorProps) {
  const form = useEventForm(event, onSave)

  return (
    <div className="flex flex-col min-h-full">
      <div className={EDITOR_HEADER}>
        <div className="flex items-center gap-3">
          <button
            data-mobile-back
            onClick={onBack}
            className={ICON_BTN_MD}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>编辑事件</h2>
        </div>
        <button
          onClick={form.handleSave}
          disabled={form.saving || !form.title.trim()}
          data-save-button
          className={BTN_PRIMARY}
        >
          <Save size={14} strokeWidth={2} />
          <span>{form.saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className={EDITOR_BODY}>
        <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={form.headerUrl}
              onHeaderChange={form.setHeaderUrl}
              onHeaderRemove={() => form.setHeaderUrl('')}
            />
          </section>

          <div className="mt-8 flex flex-col gap-8">
            {/* 身份区 */}
            <input
              type="text"
              value={form.title}
              onChange={(e) => form.setTitle(e.target.value)}
              placeholder="事件标题"
              className={TITLE_INPUT}
            />

            <EventInfoSection form={form} />

            <div className="border-t border-line" />

            <EventRelationSection form={form} onNavigateItem={onNavigateItem} />

            <div className="border-t border-line" />

            {/* 正文 */}
            <section>
              <h3 className={SECTION_TITLE}>正文</h3>
              <DocumentEditor
                entityId={event.id}
                entityType="event"
                fallbackContent={event.content}
                onReady={form.handleEditorReady}
                placeholder="开始编写事件内容..."
                onMentionClick={onMentionClick}
                onCharacterCount={onCharacterCount}
                onWikiLinkClick={onWikiLinkClick}
                onDocChange={form.handleDocChange}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
