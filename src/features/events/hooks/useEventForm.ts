'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { chatCompletion, getAIConfig } from '@/lib/ai'
import { useSettings } from '@/lib/settings'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { parseTime, assembleTime } from '../utils'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'

/**
 * 事件编辑表单：字段状态、外部时间回灌、关联项派生、脏标记、AI 概括与保存。
 * 供 `EventEditor` 的壳与各 section 共用；除实体与保存回调外不接收 props。
 */
export function useEventForm(
  event: Event,
  onSave: (id: number, data: Partial<EventFormData>) => Promise<void>,
) {
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
        id: c.id,
        name: c.name,
        subtitle: c.aliases.length > 0 ? c.aliases.join('、') : undefined,
      })),
    [characters],
  )

  const countryItems: RelatedItem[] = useMemo(
    () =>
      countries.map((c) => ({
        id: c.id,
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
      await onSave(event.id, {
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

  return {
    title, setTitle,
    headerUrl, setHeaderUrl,
    year, setYear,
    month, setMonth,
    day, setDay,
    endYear, setEndYear,
    endMonth, setEndMonth,
    endDay, setEndDay,
    location, setLocation,
    summary, setSummary,
    isMajor, setIsMajor,
    selectedCharacterIds, setSelectedCharacterIds,
    selectedCountryIds, setSelectedCountryIds,
    tags, setTags,
    saving,
    aiLoading,
    aiEnabled: settings.aiEnabled,
    markDirty,
    handleSave,
    handleEditorReady,
    handleAISummarize,
    characterItems,
    countryItems,
  }
}

export type EventForm = ReturnType<typeof useEventForm>
