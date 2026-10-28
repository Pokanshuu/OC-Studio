'use client'

import { useState } from 'react'
import { Save, ArrowLeft, ChevronLeft, Menu } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Country } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { useInitialEditorLayout } from '@/lib/use-initial-editor-layout'
import type { CountryFormData } from '../types'
import { useCountry, useUpdateCountry } from '../hooks/useCountries'
import { useCountryForm, mergeCountrySections } from '../hooks/useCountryForm'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { CountryEditorMulti } from './CountryEditorMulti'
import { CountryRelationSection } from './CountryRelationSection'
import { BTN_PRIMARY, BTN_QUIET, CENTER_STATE, EDITOR_BODY, EDITOR_HEADER, ICON_BTN_MD, PAGE_TITLE, SECTION_TITLE, TITLE_INPUT } from '@/lib/ui-tokens'

interface CountryEditorProps {
  editCountryId: number
  onBack: () => void
  onNavigateToCountry?: (id: number) => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function CountryEditor({
  editCountryId,
  onBack,
  onNavigateToCountry,
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
      <div className={CENTER_STATE}>
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onBack}
          className={BTN_QUIET}
        >
          返回
        </button>
      </div>
    )
  }

  if (!country) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-ink-muted">国家不存在</span>
        <button
          onClick={onBack}
          className={BTN_QUIET}
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
      onNavigateToCountry={onNavigateToCountry}
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
  onNavigateToCountry,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  country: Country
  onBack: () => void
  onSave: (id: number, data: Partial<CountryFormData>) => Promise<void>
  onNavigateToCountry?: (id: number) => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const form = useCountryForm(country, onSave)
  const [railOpen, setRailOpen] = useState(true)
  const layout = useInitialEditorLayout()

  return (
    <div className={layout === 'multi' ? 'flex h-full min-h-0 flex-col' : 'flex min-h-full flex-col'}>
      <div className={EDITOR_HEADER}>
        <div className="flex items-center gap-3">
          {layout === 'multi' ? (
            <button
              type="button"
              onClick={() => setRailOpen((open) => !open)}
              className={ICON_BTN_MD}
              title={railOpen ? '收起列表' : '展开列表'}
              aria-label={railOpen ? '收起列表' : '展开列表'}
            >
              {railOpen ? <ChevronLeft size={16} strokeWidth={2} /> : <Menu size={16} strokeWidth={2} />}
            </button>
          ) : null}
          <button
            data-mobile-back
            onClick={onBack}
            className={ICON_BTN_MD}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>编辑国家</h2>
        </div>
        <div className="flex items-center gap-1">
          <EntityHistoryButton table="countries" id={country.id} name={form.name} />
          <button
          onClick={form.handleSave}
          disabled={form.saving || !form.name.trim()}
          data-save-button
          className={BTN_PRIMARY}
        >
          <Save size={14} strokeWidth={2} />
          <span>{form.saving ? '保存中...' : '保存'}</span>
          </button>
        </div>
      </div>

      {layout === 'multi' ? (
        <CountryEditorMulti
          country={country}
          form={form}
          fallbackContent={mergeCountrySections(country.system, country.geography, country.culture)}
          railOpen={railOpen}
          onNavigateToCountry={onNavigateToCountry}
          onNavigateToCharacter={onNavigateToCharacter}
          onNavigateToEvent={onNavigateToEvent}
          onMentionClick={onMentionClick}
          onCharacterCount={onCharacterCount}
          onWikiLinkClick={onWikiLinkClick}
        />
      ) : (
        <div className={EDITOR_BODY}>
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
              className={TITLE_INPUT}
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
              onDocChange={form.handleDocChange}
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
      )}
    </div>
  )
}
