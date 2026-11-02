'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { TagPicker } from '@/features/tags'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { CustomEntryLinks } from '@/components/shared/CustomEntryLinks'
import { useDevice } from '@/lib/use-device'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import { parseTime, assembleTime } from '../utils'

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
  const [title, setTitle] = useState(event.title)
  const [headerUrl, setHeaderUrl] = useState(event.headerUrl ?? '')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [endYear, setEndYear] = useState('')
  const [endMonth, setEndMonth] = useState('')
  const [endDay, setEndDay] = useState('')
  const [location, setLocation] = useState(event.location)
  const [summary, setSummary] = useState(event.summary)
  const [isMajor, setIsMajor] = useState(event.isMajor)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>(
    event.characters ?? [],
  )
  const [selectedCountryIds, setSelectedCountryIds] = useState<number[]>(
    event.countries ?? [],
  )
  const [selectedRelatedEventIds, setSelectedRelatedEventIds] = useState<number[]>(
    (event.relations ?? []).map((relation) => relation.targetId),
  )
  const [relatedEventLabels, setRelatedEventLabels] = useState<Record<number, string>>(
    Object.fromEntries(
      (event.relations ?? []).map((relation) => [relation.targetId, relation.relation]),
    ),
  )
  const [saving, setSaving] = useState(false)
  const [tags, setTags] = useState<number[]>(event.tags ?? [])

  const relationSnapshot = useMemo(
    () =>
      JSON.stringify({
        characters: event.characters ?? [],
        countries: event.countries ?? [],
        relations: event.relations ?? [],
      }),
    [event.characters, event.countries, event.relations],
  )
  const relationSnapshotRef = useRef(relationSnapshot)

  useEffect(() => {
    if (relationSnapshotRef.current === relationSnapshot) return
    relationSnapshotRef.current = relationSnapshot
    setSelectedCharacterIds(event.characters ?? [])
    setSelectedCountryIds(event.countries ?? [])
    const nextRelations = event.relations ?? []
    setSelectedRelatedEventIds(nextRelations.map((relation) => relation.targetId))
    setRelatedEventLabels(
      Object.fromEntries(
        nextRelations.map((relation) => [relation.targetId, relation.relation]),
      ),
    )
  }, [relationSnapshot, event.characters, event.countries, event.relations])

  const editorRef = useRef<Editor | null>(null)
  const [docRevision, setDocRevision] = useState(0)
  const skipInitialAutosaveRef = useRef(true)
  const onSaveRef = useRef(onSave)
  const { isMobile } = useDevice()

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    const t = parseTime(event.time)
    const et = parseTime(event.endTime ?? '')
    setYear(t.year)
    setMonth(t.month)
    setDay(t.day)
    setEndYear(et.year)
    setEndMonth(et.month)
    setEndDay(et.day)
  }, [event.time, event.endTime])

  const { characters } = useCharacterList()
  const { countries } = useCountryList()
  const { events: allEvents } = useEventList()

  const characterItems: RelatedItem[] = useMemo(
    () =>
      characters.map((c) => ({
        id: c.id as number,
        name: c.name,
        subtitle: c.aliases.length > 0 ? c.aliases.join('、') : undefined,
      })),
    [characters],
  )

  const countryItems: RelatedItem[] = useMemo(
    () =>
      countries.map((c) => ({
        id: c.id as number,
        name: c.name,
      })),
    [countries],
  )

  const eventItems: RelatedItem[] = useMemo(
    () =>
      allEvents
        .filter((item) => item.id !== event.id)
        .map((item) => ({
          id: item.id as number,
          name: item.title,
          subtitle: item.time,
        })),
    [allEvents, event.id],
  )

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    editor.on('update', () => setDocRevision((value) => value + 1))
  }, [])

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    setSaving(true)
    try {
      const time = assembleTime(year, month, day)
      const endTimeVal = assembleTime(endYear, endMonth, endDay)
      const document = editorRef.current.getJSON()
      await onSaveRef.current(event.id as number, {
        title,
        time,
        endTime: endTimeVal || undefined,
        location,
        summary,
        isMajor,
        document,
        content: event.content,
        headerUrl,
        characters: selectedCharacterIds,
        countries: selectedCountryIds,
        relations: selectedRelatedEventIds.map((targetId) => ({
          targetId,
          relation: relatedEventLabels[targetId]?.trim() || '相关',
        })),
        tags,
      })
    } finally {
      setSaving(false)
    }
  }, [
    event.id,
    event.content,
    title,
    headerUrl,
    year,
    month,
    day,
    endYear,
    endMonth,
    endDay,
    location,
    summary,
    isMajor,
    selectedCharacterIds,
    selectedCountryIds,
    selectedRelatedEventIds,
    relatedEventLabels,
    tags,
  ])

  useEffect(() => {
    if (skipInitialAutosaveRef.current) {
      skipInitialAutosaveRef.current = false
      return
    }
    if (!title.trim()) return
    const timer = window.setTimeout(() => {
      void handleSave()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [docRevision, handleSave, title])

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between max-md:fixed max-md:top-0 max-md:left-0 max-md:right-0 md:sticky md:top-0 z-10 border-b border-line px-4 max-md:h-[calc(60px+var(--safe-top))] md:h-[60px] max-md:pt-[var(--safe-top)] bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            data-mobile-back
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink active:bg-black/8 dark:active:bg-white/8"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <h2 className="text-lg text-ink">编辑事件</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          data-save-button
          className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
        >
          <Save size={16} strokeWidth={2} />
          <span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]">
        <div className="mx-auto w-full px-4 py-3 md:py-6 md:max-w-3xl md:px-8 pb-24 md:pb-0">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={headerUrl}
              onHeaderChange={setHeaderUrl}
              onHeaderRemove={() => setHeaderUrl('')}
            />
          </section>

          {/* Title — below avatar area with enough padding */}
          <div className="pt-8">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="事件标题"
              className="w-full bg-transparent text-xl text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          {/* Mobile: time inputs stacked */}
          <div className="mt-3 flex flex-col gap-2 md:hidden">
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-faint w-8 shrink-0">开始</span>
              <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="年份" className="w-16" />
              <Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="月" className="w-12" />
              <Input value={day} onChange={(e) => setDay(e.target.value)} placeholder="日" className="w-12" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-faint w-8 shrink-0">结束</span>
              <Input value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="结束年" className="w-16" />
              <Input value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="月" className="w-12" />
              <Input value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="日" className="w-12" />
            </div>
            <div className="flex items-center gap-2">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="地点" className="flex-1" />
              <div className="flex items-center gap-2 shrink-0">
                <Checkbox id="isMajor" checked={isMajor} onCheckedChange={(checked) => setIsMajor(checked === true)} />
                <label htmlFor="isMajor" className="cursor-pointer text-sm text-ink">重大事件</label>
              </div>
            </div>
          </div>
          {/* Desktop: time inputs inline */}
          <div className="mt-3 max-md:hidden md:flex md:flex-wrap md:items-center md:gap-2">
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="年份" className="w-16" />
            <Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="月" className="w-12" />
            <Input value={day} onChange={(e) => setDay(e.target.value)} placeholder="日" className="w-12" />
            <span className="text-xs text-ink-faint">→</span>
            <Input value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="结束年" className="w-16" />
            <Input value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="月" className="w-12" />
            <Input value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="日" className="w-12" />
            <Separator orientation="vertical" className="h-4 !self-center" />
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="地点" className="flex-1" />
            <div className="flex items-center gap-2">
              <Checkbox id="isMajor" checked={isMajor} onCheckedChange={(checked) => setIsMajor(checked === true)} />
              <label htmlFor="isMajor" className="cursor-pointer text-sm text-ink">重大事件</label>
            </div>
          </div>

          <div className={`mt-3 grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            <div>
              <p className="text-sm text-ink-muted font-medium mb-1">相关角色</p>
              <RelatedItemsSelector
                items={characterItems}
                selectedIds={selectedCharacterIds}
                onChange={setSelectedCharacterIds}
                placeholder="搜索相关角色..."
                onNavigateItem={(id) => onNavigateItem?.(id, 'character')}
              />
            </div>
            <div>
              <p className="text-sm text-ink-muted font-medium mb-1">相关国家</p>
              <RelatedItemsSelector
                items={countryItems}
                selectedIds={selectedCountryIds}
                onChange={setSelectedCountryIds}
                placeholder="搜索相关国家..."
                onNavigateItem={(id) => onNavigateItem?.(id, 'country')}
              />
            </div>
          </div>

          <div className="mt-3">
            <p className="text-sm text-ink-muted font-medium mb-1">相关事件</p>
            <RelatedItemsSelector
              items={eventItems}
              selectedIds={selectedRelatedEventIds}
              onChange={setSelectedRelatedEventIds}
              placeholder="搜索相关事件..."
              onNavigateItem={(id) => onNavigateItem?.(id, 'event')}
            />
            {selectedRelatedEventIds.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {selectedRelatedEventIds.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-ink">
                      {allEvents.find((item) => item.id === id)?.title ?? `事件 #${id}`}
                    </span>
                    <input
                      value={relatedEventLabels[id] ?? '相关'}
                      onChange={(event) =>
                        setRelatedEventLabels((current) => ({
                          ...current,
                          [id]: event.target.value,
                        }))
                      }
                      placeholder="关系，例如导致、前置"
                      className="h-8 min-w-0 flex-1 rounded border border-line bg-paper-card px-2 text-xs text-ink outline-none placeholder:text-ink-faint"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            <CustomEntryLinks entityType="event" entityId={event.id as number} />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <p className="text-sm text-ink-muted font-medium">标签</p>
            <TagPicker selectedIds={tags} onChange={setTags} />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <p className="text-sm text-ink-muted font-medium">摘要</p>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="用一两句话概括这个事件..."
              rows={3}
              className="w-full resize-y rounded border border-line bg-paper-card/40 px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint focus:border-line-hover"
            />
          </div>

          <div className="mt-4">
            <DocumentEditor
              entityId={event.id as number}
              entityType="event"
              fallbackContent={event.content}
              onReady={handleEditorReady}
              placeholder="开始编写事件内容..."
              onMentionClick={onMentionClick}
              onCharacterCount={onCharacterCount}
              onWikiLinkClick={onWikiLinkClick}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
