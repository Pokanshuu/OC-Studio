'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { useTemplates } from '@/lib/templates/store'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { CountryForm } from '../hooks/useCountryForm'
import { CountryRelationSection } from './CountryRelationSection'

interface CountryFrontmatterProps {
  form: CountryForm
  compact: boolean
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
}

/**
 * 国家 frontmatter：**由模板决定区块顺序与开关**（阶段一，数据仍写原列）。
 *
 * 映射：`cover` → 旗帜/封面；`info` → 名称；`relations` → 关联。
 */
export function CountryFrontmatter({
  form,
  compact,
  onNavigateToCharacter,
  onNavigateToEvent,
}: CountryFrontmatterProps) {
  const { templates } = useTemplates()
  const template = templates.find((doc) => doc.id === 'country')

  if (!template) {
    return (
      <div className={compact ? 'flex flex-col gap-6 p-4' : 'flex flex-col gap-8'}>
        <ProfileBannerEditor
          headerUrl={form.headerUrl}
          avatarUrl={form.flagUrl}
          onHeaderChange={form.setHeaderUrl}
          onAvatarChange={form.setFlagUrl}
          onHeaderRemove={() => form.setHeaderUrl('')}
          onAvatarRemove={() => form.setFlagUrl('')}
          avatarType="flag"
        />
        <input
          type="text"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder="国家/地区名称"
          className={TITLE_INPUT}
        />
        <div className="border-t border-line" />
        <CountryRelationSection
          form={form}
          onNavigateToCharacter={onNavigateToCharacter}
          onNavigateToEvent={onNavigateToEvent}
        />
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
                avatarUrl={form.flagUrl}
                onHeaderChange={form.setHeaderUrl}
                onAvatarChange={form.setFlagUrl}
                onHeaderRemove={() => form.setHeaderUrl('')}
                onAvatarRemove={() => form.setFlagUrl('')}
                avatarType="flag"
              />
            )
          case 'info':
            return (
              <input
                type="text"
                value={form.name}
                onChange={(e) => form.setName(e.target.value)}
                placeholder="国家/地区名称"
                className={TITLE_INPUT}
              />
            )
          case 'relations':
            return (
              <CountryRelationSection
                form={form}
                onNavigateToCharacter={onNavigateToCharacter}
                onNavigateToEvent={onNavigateToEvent}
              />
            )
          default:
            return null
        }
      }}
    />
  )
}
