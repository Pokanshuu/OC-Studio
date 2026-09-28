'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import { TagPicker } from '@/features/tags'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Country, Character, Event } from '@/types'
import type { CountryFormData } from '../types'
import { useCountry, useUpdateCountry } from '../hooks/useCountries'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useEventList } from '@/features/events/hooks/useEvents'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { FIELD_LABEL, FIELD_ROW_TOP, PAGE_TITLE, SECTION_TITLE } from '@/lib/ui-tokens'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'

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
  const { characters: allCharacters } = useCharacterList()
  const { events: allEvents } = useEventList()

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
      allCharacters={allCharacters}
      allEvents={allEvents}
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
  allCharacters,
  allEvents,
  onBack,
  onSave,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  country: Country
  allCharacters: Character[]
  allEvents: Event[]
  onBack: () => void
  onSave: (id: number, data: Partial<CountryFormData>) => Promise<void>
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const [name, setName] = useState(country.name)
  const [flagUrl, setFlagUrl] = useState(country.flagUrl ?? '')
  const [headerUrl, setHeaderUrl] = useState(country.headerUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [editableCharIds, setEditableCharIds] = useState<number[]>(country.characters)
  const [editableEventIds, setEditableEventIds] = useState<number[]>(country.events)
  const [tags, setTags] = useState<number[]>(country.tags ?? [])

  const { markDirty, markSaving, markSaved, registerSaveHandler } = useSaveStatus()
  const isFirstRenderRef = useRef(true)
  const suppressDirtyRef = useRef(false)

  const docEditorRef = useRef<Editor | null>(null)

  // 任一字段变化即标记未保存（跳过首帧与保存后的程序化同步）
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (suppressDirtyRef.current) return
    markDirty()
  }, [name, flagUrl, headerUrl, editableCharIds, editableEventIds, tags, markDirty])

  const handleDocReady = useCallback((editor: Editor) => {
    docEditorRef.current = editor
  }, [])

  const handleSave = useCallback(async () => {
    markSaving()
    setSaving(true)
    try {
      const document = docEditorRef.current?.getJSON()

      await onSave(country.id as number, {
        name,
        parentId: country.parentId,
        description: '',
        document,
        system: country.system,
        geography: country.geography,
        culture: country.culture,
        flagUrl,
        headerUrl,
        characters: editableCharIds,
        events: editableEventIds,
        tags,
      })
      markSaved()
      suppressDirtyRef.current = true
      setTimeout(() => { suppressDirtyRef.current = false }, 0)
    } finally {
      setSaving(false)
    }
  }, [country.id, country.parentId, country.system, country.geography, country.culture, name, flagUrl, headerUrl, editableCharIds, editableEventIds, tags, onSave, markSaving, markSaved])

  useEffect(() => {
    registerSaveHandler('country', handleSave)
    return () => registerSaveHandler('country', null)
  }, [handleSave, registerSaveHandler])

  const relatedCharacterItems: RelatedItem[] = useMemo(
    () =>
      allCharacters.map((c) => ({
        id: c.id as number,
        name: c.name,
        subtitle: c.aliases.length > 0 ? c.aliases.join('、') : undefined,
      })),
    [allCharacters],
  )

  const relatedEventItems: RelatedItem[] = useMemo(
    () =>
      allEvents.map((e) => ({
        id: e.id as number,
        name: e.title,
        subtitle: e.time,
      })),
    [allEvents],
  )

  const relatedCharacterIds = useMemo(
    () => editableCharIds.filter((id) => typeof id === 'number'),
    [editableCharIds],
  )

  const relatedEventIds = useMemo(
    () => editableEventIds.filter((id) => typeof id === 'number'),
    [editableEventIds],
  )

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
          onClick={handleSave}
          disabled={saving || !name.trim()}
          data-save-button
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85 disabled:opacity-40"
        >
          <Save size={14} strokeWidth={2} />
          <span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 space-y-8 md:px-8 md:py-6">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={headerUrl}
              avatarUrl={flagUrl}
              onHeaderChange={setHeaderUrl}
              onAvatarChange={setFlagUrl}
              onHeaderRemove={() => setHeaderUrl('')}
              onAvatarRemove={() => setFlagUrl('')}
              avatarType="flag"
            />
          </section>

          {/* Name — below avatar with enough padding */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="国家/地区名称"
              className="w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          <div className="border-t border-line" />

          {/* System + Geography + Culture (merged into one document) */}
          <section>
            <h3 className={SECTION_TITLE}>国家详情</h3>
            <DocumentEditor
              entityId={country.id as number}
              entityType="country"
              fallbackContent={mergeCountrySections(country.system, country.geography, country.culture)}
              onReady={handleDocReady}
              placeholder="政治制度、地理、文化..."
              onMentionClick={onMentionClick}
              onCharacterCount={onCharacterCount}
              onWikiLinkClick={onWikiLinkClick}
              onDocChange={markDirty}
            />
          </section>

          <div className="border-t border-line" />

          {/* 关联：与事件编辑器同一套字段行 */}
          <section>
            <h3 className={SECTION_TITLE}>关联</h3>
            <div className="flex flex-col">
              <div className={FIELD_ROW_TOP}>
                <span className={FIELD_LABEL}>相关角色</span>
                <div className="min-w-0 flex-1">
                  <RelatedItemsSelector
                    items={relatedCharacterItems}
                    selectedIds={relatedCharacterIds}
                    onChange={setEditableCharIds}
                    placeholder="搜索相关角色..."
                    onNavigateItem={onNavigateToCharacter}
                  />
                </div>
              </div>

              <div className={FIELD_ROW_TOP}>
                <span className={FIELD_LABEL}>相关事件</span>
                <div className="min-w-0 flex-1">
                  <RelatedItemsSelector
                    items={relatedEventItems}
                    selectedIds={relatedEventIds}
                    onChange={setEditableEventIds}
                    placeholder="搜索相关事件..."
                    onNavigateItem={onNavigateToEvent}
                  />
                </div>
              </div>

              <div className={FIELD_ROW_TOP}>
                <span className={FIELD_LABEL}>标签</span>
                <div className="min-w-0 flex-1">
                  <TagPicker selectedIds={tags} onChange={setTags} />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function mergeCountrySections(system: string, geography: string, culture: string): string | undefined {
  if (!system && !geography && !culture) return undefined
  const parts: string[] = []
  if (system) { parts.push('<h2>政治制度</h2>'); parts.push(system) }
  if (geography) { parts.push('<h2>地理环境</h2>'); parts.push(geography) }
  if (culture) { parts.push('<h2>人文风貌</h2>'); parts.push(culture) }
  return parts.join('\n')
}
