'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { parseTime, assembleTime } from '../utils'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { toast } from 'sonner'
import { useEditorDirty } from '@/components/layout/useEditorDirty'
import { snapshotKey, useDirtySnapshot } from '@/lib/dirty'

/** 表单里可编辑的全部字段 —— 装载、回灌、脏判断共用这一份形状 */
interface EventValues {
  title: string
  headerUrl: string
  year: string
  month: string
  day: string
  endYear: string
  endMonth: string
  endDay: string
  location: string
  summary: string
  isMajor: boolean
  custom: Record<string, string>
  characterIds: number[]
  countryIds: number[]
  tags: number[]
}

function valuesFromEntity(event: Event): EventValues {
  const time = parseTime(event.time)
  const endTime = parseTime(event.endTime ?? '')
  return {
    title: event.title,
    headerUrl: event.headerUrl ?? '',
    year: time.year,
    month: time.month,
    day: time.day,
    endYear: endTime.year,
    endMonth: endTime.month,
    endDay: endTime.day,
    location: event.location,
    summary: event.summary,
    isMajor: event.isMajor,
    custom: event.custom ?? {},
    characterIds: event.characters ?? [],
    countryIds: event.countries ?? [],
    tags: event.tags ?? [],
  }
}

/** 只比**会被保存的东西**，时间用落库形态（`3` 与 `03` 是同一个日期） */
function valuesSnapshot(values: EventValues): Record<string, unknown> {
  return {
    title: values.title,
    headerUrl: values.headerUrl,
    time: assembleTime(values.year, values.month, values.day),
    endTime: assembleTime(values.endYear, values.endMonth, values.endDay),
    location: values.location,
    summary: values.summary,
    isMajor: values.isMajor,
    custom: values.custom,
    characters: values.characterIds,
    countries: values.countryIds,
    tags: values.tags,
  }
}

/**
 * 事件编辑表单：字段状态、外部时间回灌、关联项派生、脏标记与保存。
 * 供 `EventEditor` 的壳与各 section 共用；除实体与保存回调外不接收 props。
 */
export function useEventForm(
  event: Event,
  onSave: (id: number, data: Partial<EventFormData>) => Promise<void>,
) {
  const [initial] = useState(() => valuesFromEntity(event))

  const [title, setTitle] = useState(initial.title)
  const [headerUrl, setHeaderUrl] = useState(initial.headerUrl)
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [day, setDay] = useState(initial.day)
  const [endYear, setEndYear] = useState(initial.endYear)
  const [endMonth, setEndMonth] = useState(initial.endMonth)
  const [endDay, setEndDay] = useState(initial.endDay)
  const [location, setLocation] = useState(initial.location)
  const [summary, setSummary] = useState(initial.summary)
  const [isMajor, setIsMajor] = useState(initial.isMajor)
  /** 自定义字段的值（键 = 字段表里的 key） */
  const [custom, setCustom] = useState<Record<string, string>>(initial.custom)
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<number[]>(initial.characterIds)
  const [selectedCountryIds, setSelectedCountryIds] = useState<number[]>(initial.countryIds)
  const [tags, setTags] = useState<number[]>(initial.tags)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const docBaselineRef = useRef<Editor['state']['doc'] | null>(null)
  const [docDirty, setDocDirty] = useState(false)
  const { markSaving, registerSaveHandler, reportDirty } = useSaveStatus()
  const prevUpdatedAtRef = useRef(event.updatedAt)
  /** 上一次保存写进去的那份值：回读时据此认出「这是我自己写的」 */
  const savedSnapshotRef = useRef<string | null>(null)

  const values = useMemo<EventValues>(() => ({
    title, headerUrl, year, month, day, endYear, endMonth, endDay, location, summary,
    isMajor, custom, characterIds: selectedCharacterIds, countryIds: selectedCountryIds, tags,
  }), [
    title, headerUrl, year, month, day, endYear, endMonth, endDay, location, summary,
    isMajor, custom, selectedCharacterIds, selectedCountryIds, tags,
  ])

  const snapshot = useMemo(() => valuesSnapshot(values), [values])
  const { dirty: fieldsDirty, markClean: markFieldsClean } = useDirtySnapshot(snapshot)

  // 外部改写（时间线拖拽 / 别处保存）后回灌，并把同一份值记为新的干净基线。
  // 自己刚保存的那份回读不回灌 —— 否则会把保存期间还在输入的字冲掉。
  useEffect(() => {
    if (saving || prevUpdatedAtRef.current === event.updatedAt) return
    prevUpdatedAtRef.current = event.updatedAt
    const next = valuesFromEntity(event)
    const nextKey = snapshotKey(valuesSnapshot(next))
    if (nextKey === savedSnapshotRef.current) return
    setTitle(next.title)
    setHeaderUrl(next.headerUrl)
    setYear(next.year)
    setMonth(next.month)
    setDay(next.day)
    setEndYear(next.endYear)
    setEndMonth(next.endMonth)
    setEndDay(next.endDay)
    setLocation(next.location)
    setSummary(next.summary)
    setIsMajor(next.isMajor)
    setCustom(next.custom)
    setSelectedCharacterIds(next.characterIds)
    setSelectedCountryIds(next.countryIds)
    setTags(next.tags)
    markFieldsClean(nextKey)
  }, [event, markFieldsClean, saving])

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
    docBaselineRef.current = editor.state.doc
    setDocDirty(false)
  }, [])

  /** 正文变更：与基线文档逐节点比对，撤销/改回原样自然回到「干净」 */
  const handleDocChange = useCallback(() => {
    const editor = editorRef.current
    const baseline = docBaselineRef.current
    if (!editor || !baseline) return
    setDocDirty(!editor.state.doc.eq(baseline))
  }, [])

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
        custom,
      })
      savedSnapshotRef.current = snapshotKey(snapshot)
      markFieldsClean()
      docBaselineRef.current = editorRef.current.state.doc
      setDocDirty(false)
    } catch (err) {
      // 保存失败必须把状态从「保存中」拉回来：只 catch 不处理会永远转圈
      toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) })
      reportDirty(true)
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
    custom,
    onSave,
    markSaving,
    markFieldsClean,
    snapshot,
    reportDirty,
  ])

  useEffect(() => {
    registerSaveHandler('event', handleSave)
    return () => registerSaveHandler('event', null)
  }, [handleSave, registerSaveHandler])

  useEditorDirty('event', event.id, fieldsDirty || docDirty, saving)

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
    custom,
    setCustomValue: (key: string, value: string) => {
      setCustom((prev) => ({ ...prev, [key]: value }))
    },
    selectedCharacterIds, setSelectedCharacterIds,
    selectedCountryIds, setSelectedCountryIds,
    tags, setTags,
    saving,
    handleSave,
    handleEditorReady,
    handleDocChange,
    characterItems,
    countryItems,
  }
}

export type EventForm = ReturnType<typeof useEventForm>
