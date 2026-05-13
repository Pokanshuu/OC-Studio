'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import { Save, ArrowLeft, Sparkles } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { useDevice } from '@/lib/use-device'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
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
  const initialTime = useMemo(() => parseTime(event.time), [event.time])

  const [title, setTitle] = useState(event.title)
  const [headerUrl, setHeaderUrl] = useState(event.headerUrl ?? '')
  const [year, setYear] = useState(initialTime.year)
  const [month, setMonth] = useState(initialTime.month)
  const [day, setDay] = useState(initialTime.day)
  const [location, setLocation] = useState(event.location)
  const [summary, setSummary] = useState(event.summary)
  const [isMajor, setIsMajor] = useState(event.isMajor)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>(
    event.characters ?? [],
  )
  const [selectedCountryIds, setSelectedCountryIds] = useState<number[]>(
    event.countries ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const { isMobile } = useDevice()

  const { characters } = useCharacterList()
  const { countries } = useCountryList()

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

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const handleAISummarize = useCallback(async () => {
    const text = editorRef.current?.getText()
    if (!text || text.trim().length === 0) return

    setAiLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))
      setSummary('AI 概括功能开发中...')
    } finally {
      setAiLoading(false)
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    setSaving(true)
    try {
      const time = assembleTime(year, month, day)
      const document = editorRef.current.getJSON()
      await onSave(event.id as number, {
        title,
        time,
        location,
        summary,
        isMajor,
        document,
        content: event.content,
        headerUrl: headerUrl || undefined,
        characters: selectedCharacterIds,
        countries: selectedCountryIds,
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
    location,
    summary,
    isMajor,
    selectedCharacterIds,
    selectedCountryIds,
    onSave,
  ])

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={2} />
            <span>返回</span>
          </button>
          <h2 className="text-lg text-ink">编辑事件</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          data-save-button
          className="flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
        >
          <Save size={16} strokeWidth={2} />
          <span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-8 py-6">
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

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="年份"
              className="w-20"
            />
            <Input
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="月"
              className="w-20"
            />
            <Input
              value={day}
              onChange={(e) => setDay(e.target.value)}
              placeholder="日"
              className="w-20"
            />
            <Separator orientation="vertical" className="h-4 !self-center" />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="地点"
              className="flex-1"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="isMajor"
                checked={isMajor}
                onCheckedChange={(checked) => setIsMajor(checked === true)}
              />
              <label htmlFor="isMajor" className="cursor-pointer text-sm text-ink">
                重大事件
              </label>
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

          {summary ? (
            <div className="mt-3 rounded border border-line bg-paper-card px-3 py-2 text-sm text-ink-muted">
              {summary}
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-2 border-b border-line pb-3">
            <button
              onClick={handleAISummarize}
              disabled={aiLoading}
              className="flex items-center gap-1.5 rounded border border-warning px-2.5 py-1.5 text-xs text-warning transition-colors hover:bg-paper-alt disabled:opacity-50"
            >
              <Sparkles size={14} strokeWidth={2} />
              <span>{aiLoading ? '生成中...' : 'AI 概括'}</span>
            </button>
          </div>

          <div className="mt-4">
            <DocumentEditor
              entityId={event.id as number}
              entityType="event"
              fallbackContent={event.content || undefined}
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
