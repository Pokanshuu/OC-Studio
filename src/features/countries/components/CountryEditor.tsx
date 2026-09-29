'use client'

import { Save, ArrowLeft } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Country } from '@/types'
import type { CountryFormData } from '../types'
import { useCountry, useUpdateCountry } from '../hooks/useCountries'
import { useCountryForm, mergeCountrySections } from '../hooks/useCountryForm'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { CountryRelationSection } from './CountryRelationSection'
import { PAGE_TITLE, SECTION_TITLE } from '@/lib/ui-tokens'

interface CountryEditorProps {
  editCountryId: number
  onBack: () => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function CountryEditor({
  editCountryId,
  onBack,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: CountryEditorProps) {
  const { country, loading, error } = useCountry(editCountryId)
  const { updateCountry } = useUpdateCountry()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onBack}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          返回
        </button>
      </div>
    )
  }

  if (!country) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-ink-muted">国家不存在</span>
        <button
          onClick={onBack}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          返回
        </button>
      </div>
    )
  }

  return (
    <CountryEditorInner
      country={country}
      onBack={onBack}
      onSave={async (id, data) => {
        await updateCountry(id, data)
      }}
      onNavigateToCharacter={onNavigateToCharacter}
      onNavigateToEvent={onNavigateToEvent}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
    />
  )
}

function CountryEditorInner({
  country,
  onBack,
  onSave,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  country: Country
  onBack: () => void
  onSave: (id: number, data: Partial<CountryFormData>) => Promise<void>
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const form = useCountryForm(country, onSave)

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between max-md:fixed max-md:top-0 max-md:left-0 max-md:right-0 md:sticky md:top-0 z-10 border-b border-line px-4 max-md:h-[calc(60px+var(--safe-top))] md:h-12 max-md:pt-[var(--safe-top)] bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            data-mobile-back
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>编辑国家</h2>
        </div>
        <button
          onClick={form.handleSave}
          disabled={form.saving || !form.name.trim()}
          data-save-button
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85 disabled:opacity-40"
        >
          <Save size={14} strokeWidth={2} />
          <span>{form.saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 space-y-8 md:px-8 md:py-6">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={form.headerUrl}
              avatarUrl={form.flagUrl}
              onHeaderChange={form.setHeaderUrl}
              onAvatarChange={form.setFlagUrl}
              onHeaderRemove={() => form.setHeaderUrl('')}
              onAvatarRemove={() => form.setFlagUrl('')}
              avatarType="flag"
            />
          </section>

          {/* Name — below avatar with enough padding */}
          <div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => form.setName(e.target.value)}
              placeholder="国家/地区名称"
              className="w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          <div className="border-t border-line" />

          {/* System + Geography + Culture (merged into one document) */}
          <section>
            <h3 className={SECTION_TITLE}>国家详情</h3>
            <DocumentEditor
              entityId={country.id}
              entityType="country"
              fallbackContent={mergeCountrySections(country.system, country.geography, country.culture)}
              onReady={form.handleDocReady}
              placeholder="政治制度、地理、文化..."
              onMentionClick={onMentionClick}
              onCharacterCount={onCharacterCount}
              onWikiLinkClick={onWikiLinkClick}
              onDocChange={form.markDirty}
            />
          </section>

          <div className="border-t border-line" />

          {/* 关联：与事件编辑器同一套字段行 */}
          <CountryRelationSection
            form={form}
            onNavigateToCharacter={onNavigateToCharacter}
            onNavigateToEvent={onNavigateToEvent}
          />
        </div>
      </div>
    </div>
  )
}
