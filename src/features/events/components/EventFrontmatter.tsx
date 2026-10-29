'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { EventForm } from '../hooks/useEventForm'
import { EventInfoSection } from './EventInfoSection'
import { EventRelationSection } from './EventRelationSection'

interface EventFrontmatterProps {
  form: EventForm
  compact: boolean
  onNavigateItem?: (id: number, type?: string) => void
}

/** 事件 frontmatter：封面、标题、基本信息、关联；正文由 EntityDocumentBody 复用。 */
export function EventFrontmatter({ form, compact, onNavigateItem }: EventFrontmatterProps) {
  return (
    <div className={compact ? 'flex flex-col gap-6 p-4' : 'flex flex-col gap-8'}>
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

      <EventInfoSection form={form} compact={compact} />

      <div className="border-t border-line" />
      <EventRelationSection form={form} onNavigateItem={onNavigateItem} />
    </div>
  )
}
