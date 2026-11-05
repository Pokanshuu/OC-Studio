'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { useTemplates } from '@/lib/templates/store'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { EventForm } from '../hooks/useEventForm'
import { EventInfoSection } from './EventInfoSection'
import { EventRelationSection } from './EventRelationSection'

interface EventFrontmatterProps {
  form: EventForm
  compact: boolean
  onNavigateItem?: (id: number, type?: string) => void
}

/**
 * 事件 frontmatter：**由模板决定区块顺序与开关**（阶段一，数据仍写原列）。
 *
 * 映射（`src/lib/templates/support.ts` 是唯一进度表）：
 * - `cover`     → 头图
 * - `info`      → 标题 + 基本信息（时间 / 地点 / 简介这些字段仍在基本信息里）
 * - `relations` → 关联
 */
export function EventFrontmatter({ form, compact, onNavigateItem }: EventFrontmatterProps) {
  const { templates } = useTemplates()
  const template = templates.find((doc) => doc.id === 'event')

  if (!template) {
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

  return (
    <TemplateRenderer
      template={template}
      className={compact ? 'flex flex-col gap-6 p-4' : 'flex flex-col gap-8'}
      render={(component) => {
        switch (component.id) {
          case 'cover':
            return (
              <ProfileBannerEditor
                headerUrl={form.headerUrl}
                onHeaderChange={form.setHeaderUrl}
                onHeaderRemove={() => form.setHeaderUrl('')}
              />
            )
          case 'info':
            return (
              <div className="flex min-w-0 flex-col gap-8">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => form.setTitle(e.target.value)}
                  placeholder="事件标题"
                  className={TITLE_INPUT}
                />
                <EventInfoSection form={form} compact={compact} />
              </div>
            )
          case 'relations':
            return <EventRelationSection form={form} onNavigateItem={onNavigateItem} />
          default:
            return null
        }
      }}
    />
  )
}
