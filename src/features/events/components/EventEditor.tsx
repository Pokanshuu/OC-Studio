'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Save, ArrowLeft, Sparkles, Loader2 } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { chatCompletion, getAIConfig } from '@/lib/ai'
import { useSettings } from '@/lib/settings'
import { TagPicker } from '@/features/tags'
import { Checkbox } from '@/components/ui/checkbox'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { parseTime, assembleTime } from '../utils'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, PAGE_TITLE, SECTION_TITLE } from '@/lib/ui-tokens'

// 字段行统一样式见 @/lib/ui-tokens
const FIELD_INPUT = 'h-6 w-14 min-w-0 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none'

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
  const [year, setYear] = useState(() => parseTime(event.time).year)
  const [month, setMonth] = useState(() => parseTime(event.time).month)
  const [day, setDay] = useState(() => parseTime(event.time).day)
  const [endYear, setEndYear] = useState(() => parseTime(event.endTime ?? '').year)
  const [endMonth, setEndMonth] = useState(() => parseTime(event.endTime ?? '').month)
  const [endDay, setEndDay] = useState(() => parseTime(event.endTime ?? '').day)
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
  const [tags, setTags] = useState<number[]>(event.tags ?? [])
  const { settings } = useSettings()
  const editorRef = useRef<Editor | null>(null)
  const { markDirty, markSaving, markSaved, registerSaveHandler } = useSaveStatus()
  const isFirstRenderRef = useRef(true)
  const suppressDirtyRef = useRef(false)

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

  // 任一字段变化即标记未保存（跳过首帧与保存后的程序化同步）
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (suppressDirtyRef.current) return
    markDirty()
  }, [title, headerUrl, year, month, day, endYear, endMonth, endDay, location, summary, isMajor, selectedCharacterIds, selectedCountryIds, tags, markDirty])

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

    const aiConfig = getAIConfig(settings)
    if (!aiConfig.available) {
      setSummary('请先在设置中配置 AI API Key')
      return
    }

    setAiLoading(true)
    try {
      const result = await chatCompletion([
        {
          role: 'system',
          content: '你是一个小说创作助手。请用简洁中文概括以下事件内容，保留关键人物、地点和时间信息，不超过 200 字。只输出概括文本，不要加任何前缀或引号。',
        },
        {
          role: 'user',
          content: text,
        },
      ], {
        model: aiConfig.model!,
        baseUrl: aiConfig.baseUrl!,
        apiKey: aiConfig.apiKey!,
        temperature: 0.3,
      })
      setSummary(result || 'AI 未能生成概括')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 请求失败'
      setSummary(message)
    } finally {
      setAiLoading(false)
    }
  }, [settings])

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    markSaving()
    setSaving(true)
    try {
      const time = assembleTime(year, month, day)
      const endTimeVal = assembleTime(endYear, endMonth, endDay)
      const document = editorRef.current.getJSON()
      await onSave(event.id as number, {
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
        tags,
      })
      markSaved()
      suppressDirtyRef.current = true
      setTimeout(() => { suppressDirtyRef.current = false }, 0)
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
    tags,
    onSave,
    markSaving,
    markSaved,
  ])

  useEffect(() => {
    registerSaveHandler('event', handleSave)
    return () => registerSaveHandler('event', null)
  }, [handleSave, registerSaveHandler])

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
          <h2 className={PAGE_TITLE}>编辑事件</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          data-save-button
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85 disabled:opacity-40"
        >
          <Save size={14} strokeWidth={2} />
          <span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={headerUrl}
              onHeaderChange={setHeaderUrl}
              onHeaderRemove={() => setHeaderUrl('')}
            />
          </section>

          <div className="mt-8 flex flex-col gap-8">
            {/* 身份区 */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="事件标题"
              className="w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
            />

            {/* 基本信息 */}
            <section>
              <h3 className={SECTION_TITLE}>基本信息</h3>
              <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                <div className={FIELD_ROW}>
                  <span className={FIELD_LABEL}>开始</span>
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="年" className={FIELD_INPUT} />
                    <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="月" className={FIELD_INPUT} />
                    <input value={day} onChange={(e) => setDay(e.target.value)} placeholder="日" className={FIELD_INPUT} />
                  </div>
                </div>

                <div className={FIELD_ROW}>
                  <span className={FIELD_LABEL}>结束</span>
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <input value={endYear} onChange={(e) => setEndYear(e.target.value)} placeholder="年" className={FIELD_INPUT} />
                    <input value={endMonth} onChange={(e) => setEndMonth(e.target.value)} placeholder="月" className={FIELD_INPUT} />
                    <input value={endDay} onChange={(e) => setEndDay(e.target.value)} placeholder="日" className={FIELD_INPUT} />
                  </div>
                </div>

                <div className={FIELD_ROW}>
                  <span className={FIELD_LABEL}>地点</span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="地点"
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                  />
                </div>

                <label className={`${FIELD_ROW} cursor-pointer`}>
                  <span className={FIELD_LABEL}>重大事件</span>
                  <Checkbox checked={isMajor} onCheckedChange={(checked) => setIsMajor(checked === true)} />
                </label>
              </div>
            </section>

            <div className="border-t border-line" />

            {/* 关联 */}
            <section>
              <h3 className={SECTION_TITLE}>关联</h3>
              <div className="flex flex-col">
                <div className={FIELD_ROW_TOP}>
                  <span className={FIELD_LABEL}>相关角色</span>
                  <div className="min-w-0 flex-1">
                    <RelatedItemsSelector
                      items={characterItems}
                      selectedIds={selectedCharacterIds}
                      onChange={setSelectedCharacterIds}
                      placeholder="添加相关角色..."
                      onNavigateItem={(id) => onNavigateItem?.(id, 'character')}
                    />
                  </div>
                </div>

                <div className={FIELD_ROW_TOP}>
                  <span className={FIELD_LABEL}>相关国家</span>
                  <div className="min-w-0 flex-1">
                    <RelatedItemsSelector
                      items={countryItems}
                      selectedIds={selectedCountryIds}
                      onChange={setSelectedCountryIds}
                      placeholder="添加相关国家..."
                      onNavigateItem={(id) => onNavigateItem?.(id, 'country')}
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

            {settings.aiEnabled ? (
              <section>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAISummarize}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-warning transition-colors hover:bg-[var(--oc-hover)] disabled:opacity-50"
                  >
                    <Sparkles size={14} strokeWidth={2} />
                    <span>{aiLoading ? '生成中...' : 'AI 概括'}</span>
                  </button>
                </div>
                {summary ? (
                  <p className="mt-2 max-w-[60ch] text-sm text-ink-muted">{summary}</p>
                ) : null}
              </section>
            ) : null}

            <div className="border-t border-line" />

            {/* 正文 */}
            <section>
              <h3 className={SECTION_TITLE}>正文</h3>
              <DocumentEditor
                entityId={event.id as number}
                entityType="event"
                fallbackContent={event.content}
                onReady={handleEditorReady}
                placeholder="开始编写事件内容..."
                onMentionClick={onMentionClick}
                onCharacterCount={onCharacterCount}
                onWikiLinkClick={onWikiLinkClick}
                onDocChange={markDirty}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
