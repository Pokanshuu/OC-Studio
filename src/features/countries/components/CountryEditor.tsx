'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Country, Character, Event } from '@/types'
import type { CountryFormData } from '../types'
import { useCountry, useUpdateCountry } from '../hooks/useCountries'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useEventList } from '@/features/events/hooks/useEvents'
import { Separator } from '@/components/ui/separator'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'

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
  const { country, loading, error, refresh } = useCountry(editCountryId)
  const { updateCountry } = useUpdateCountry()
  const { characters: allCharacters } = useCharacterList()
  const { events: allEvents } = useEventList()

  useEffect(() => {
    refresh()
  }, [editCountryId, refresh])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-ink-muted">加载中...</span>
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
  const [saving, setSaving] = useState(false)
  const [editableCharIds, setEditableCharIds] = useState<number[]>(country.characters)
  const [editableEventIds, setEditableEventIds] = useState<number[]>(country.events)

  const docEditorRef = useRef<Editor | null>(null)

  const handleDocReady = useCallback((editor: Editor) => {
    docEditorRef.current = editor
  }, [])

  const handleSave = useCallback(async () => {
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
        characters: editableCharIds,
        events: editableEventIds,
      })
    } finally {
      setSaving(false)
    }
  }, [country.id, country.parentId, country.system, country.geography, country.culture, name, editableCharIds, editableEventIds, onSave])

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
        subtitle: e.time || undefined,
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={2} />
            <span>返回</span>
          </button>
          <h2 className="text-lg text-ink">编辑国家</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-alt px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
        >
          <Save size={16} strokeWidth={2} />
          <span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-8 py-6 space-y-8">
          {/* Name */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="国家/地区名称"
            className="w-full bg-transparent text-xl text-ink placeholder:text-ink-faint focus:outline-none"
          />

          <Separator />

          {/* System + Geography + Culture (merged into one document) */}
          <section>
            <h3 className="text-base text-ink mb-3">国家详情</h3>
            <DocumentEditor
              entityId={country.id as number}
              entityType="country"
              fallbackContent={mergeCountrySections(country.system, country.geography, country.culture)}
              onReady={handleDocReady}
              placeholder="政治制度、地理、文化..."
              onMentionClick={onMentionClick}
              onCharacterCount={onCharacterCount}
              onWikiLinkClick={onWikiLinkClick}
            />
          </section>

          <Separator />

          {/* Related Characters */}
          <section>
            <h3 className="text-base text-ink mb-3">相关角色</h3>
            <RelatedItemsSelector
              items={relatedCharacterItems}
              selectedIds={relatedCharacterIds}
              onChange={setEditableCharIds}
              placeholder="搜索相关角色..."
              onNavigateItem={onNavigateToCharacter}
            /> 

          </section>

          <Separator />

          {/* Related Events */}
          <section>
            <h3 className="text-base text-ink mb-3">相关事件</h3>
            <RelatedItemsSelector
              items={relatedEventItems}
              selectedIds={relatedEventIds}
              onChange={setEditableEventIds}
              placeholder="搜索相关事件..."
              onNavigateItem={onNavigateToEvent}
            />
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
