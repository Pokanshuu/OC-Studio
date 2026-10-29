'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { CountryForm } from '../hooks/useCountryForm'
import { CountryRelationSection } from './CountryRelationSection'

interface CountryFrontmatterProps {
  form: CountryForm
  compact: boolean
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
}

/** 国家 frontmatter：旗帜/封面、名称、关联；正文由 EntityDocumentBody 复用。 */
export function CountryFrontmatter({
  form,
  compact,
  onNavigateToCharacter,
  onNavigateToEvent,
}: CountryFrontmatterProps) {
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
