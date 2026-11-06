'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { FACT_RELATION, type RelationCandidate, type RelationRow, type RelationTargetKind } from '@/components/shared/relations/types'
import type { RelationArrow } from '@/lib/relation-colors'
import type { Event, EventRelation, ImageEntry } from '@/types'
import type { EventFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from './useEvents'
import { parseTime, assembleTime } from '../utils'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { toast } from 'sonner'
import { useEditorDirty } from '@/components/layout/useEditorDirty'
import { describeDocDiff, sameDocIgnoringTrailingSpacer, snapshotKey, useDirtySnapshot } from '@/lib/dirty'

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
  relations: EventRelation[]
  tags: number[]
  /** 图集（模板「画廊」组件） */
  images: ImageEntry[]
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
    relations: event.relations ?? [],
    tags: event.tags ?? [],
    images: event.images ?? [],
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
    relations: values.relations,
    tags: values.tags,
    images: values.images,
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
  const [relations, setRelations] = useState<EventRelation[]>(initial.relations)
  const [tags, setTags] = useState<number[]>(initial.tags)
  const [images, setImages] = useState<ImageEntry[]>(initial.images)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const docBaselineRef = useRef<Editor['state']['doc'] | null>(null)
  /** 诊断：正文第一次变脏时把差异打一次 log，别每敲一个字都刷屏 */
  const docDiffLoggedRef = useRef(false)
  const [docDirty, setDocDirty] = useState(false)
  const { markSaving, registerSaveHandler, reportDirty } = useSaveStatus()
  const prevUpdatedAtRef = useRef(event.updatedAt)
  /** 上一次保存写进去的那份值：回读时据此认出「这是我自己写的」 */
  const savedSnapshotRef = useRef<string | null>(null)

  const values = useMemo<EventValues>(() => ({
    title, headerUrl, year, month, day, endYear, endMonth, endDay, location, summary,
    isMajor, custom, characterIds: selectedCharacterIds, countryIds: selectedCountryIds, relations, tags, images,
  }), [
    title, headerUrl, year, month, day, endYear, endMonth, endDay, location, summary,
    isMajor, custom, selectedCharacterIds, selectedCountryIds, relations, tags, images,
  ])

  const snapshot = useMemo(() => valuesSnapshot(values), [values])
  const { dirty: fieldsDirty, diffSummary, markClean: markFieldsClean } = useDirtySnapshot(snapshot)

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
    setRelations(next.relations)
    setTags(next.tags)
    setImages(next.images)
    markFieldsClean(nextKey)
  }, [event, markFieldsClean, saving])

  const { characters } = useCharacterList()
  const { countries } = useCountryList()
  const { events } = useEventList()

  const characterById = useMemo(() => new Map(characters.map((item) => [item.id, item])), [characters])
  const countryById = useMemo(() => new Map(countries.map((item) => [item.id, item])), [countries])
  const eventById = useMemo(() => new Map(events.map((item) => [item.id, item])), [events])

  /**
   * 关系组件的数据：参与者（角色 / 国家）是**事实边**，关系名固定只读；
   * 事件之间是**命名边**，可以当场改名字（`docs/模板.md §6.3`）。
   */
  const relationRows = useMemo<RelationRow[]>(() => {
    const rows: RelationRow[] = []

    selectedCharacterIds.forEach((id, index) => {
      const target = characterById.get(id)
      rows.push({
        key: `character-${id}-${index}`,
        kind: 'character',
        targetId: id,
        name: target?.name ?? '未命名',
        relation: FACT_RELATION.participates,
        relationEditable: false,
        index,
      })
    })

    selectedCountryIds.forEach((id, index) => {
      const target = countryById.get(id)
      rows.push({
        key: `country-${id}-${index}`,
        kind: 'country',
        targetId: id,
        name: target?.name ?? '未命名',
        relation: FACT_RELATION.occurredAt,
        relationEditable: false,
        index,
      })
    })

    relations.forEach((relation, index) => {
      const target = eventById.get(relation.targetId)
      rows.push({
        key: `event-${relation.targetId}-${index}`,
        kind: 'event',
        targetId: relation.targetId,
        name: target?.title ?? '未命名',
        relation: relation.relation,
        relationEditable: true,
        directional: true,
        defaultArrow: 'none',
        arrow: relation.arrow,
        index,
        color: relation.color,
      })
    })

    return rows
  }, [characterById, countryById, eventById, relations, selectedCharacterIds, selectedCountryIds])

  const relationCandidates = useMemo<RelationCandidate[]>(() => {
    const linkedCharacters = new Set(selectedCharacterIds)
    const linkedCountries = new Set(selectedCountryIds)
    const linkedEvents = new Set(relations.map((relation) => relation.targetId))
    return [
      ...characters
        .filter((item) => !linkedCharacters.has(item.id))
        .map((item) => ({
          kind: 'character' as const,
          targetId: item.id,
          name: item.name,
          subtitle: item.aliases.length > 0 ? item.aliases.join('、') : undefined,
        })),
      ...countries
        .filter((item) => !linkedCountries.has(item.id))
        .map((item) => ({
          kind: 'country' as const,
          targetId: item.id,
          name: item.name,
        })),
      ...events
        .filter((item) => item.id !== event.id && !linkedEvents.has(item.id))
        .map((item) => ({
          kind: 'event' as const,
          targetId: item.id,
          name: item.title,
          subtitle: item.time || undefined,
        })),
    ]
  }, [characters, countries, event.id, events, relations, selectedCharacterIds, selectedCountryIds])

  const addRelation = useCallback((kind: RelationTargetKind, targetId: number) => {
    switch (kind) {
      case 'character':
        setSelectedCharacterIds((previous) =>
          previous.includes(targetId) ? previous : [...previous, targetId],
        )
        break
      case 'country':
        setSelectedCountryIds((previous) =>
          previous.includes(targetId) ? previous : [...previous, targetId],
        )
        break
      case 'event':
        setRelations((previous) =>
          previous.some((relation) => relation.targetId === targetId)
            ? previous
            : [...previous, { targetId, relation: '' }],
        )
        break
      default:
        break
    }
  }, [])

  const removeRelation = useCallback((row: RelationRow) => {
    if (row.index === undefined) return
    switch (row.kind) {
      case 'character':
        setSelectedCharacterIds((previous) => previous.filter((_, index) => index !== row.index))
        break
      case 'country':
        setSelectedCountryIds((previous) => previous.filter((_, index) => index !== row.index))
        break
      case 'event':
        setRelations((previous) => previous.filter((_, index) => index !== row.index))
        break
      default:
        break
    }
  }, [])

  const renameRelation = useCallback((row: RelationRow, value: string) => {
    if (row.index === undefined) return
    setRelations((previous) =>
      previous.map((relation, index) =>
        index === row.index ? { ...relation, relation: value } : relation,
      ),
    )
  }, [])

  /** 命名边（事件↔事件）的箭头；参与者 / 国家是事实边，不经过它 */
  const setRelationArrow = useCallback((row: RelationRow, arrow: RelationArrow) => {
    if (row.index === undefined) return
    setRelations((previous) =>
      previous.map((relation, index) =>
        index === row.index ? { ...relation, arrow } : relation,
      ),
    )
  }, [])

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
    let next = !editor.state.doc.eq(baseline)
    // TipTap 的 TrailingNode 会给「以分割线/图片/表格结尾」的正文补一个空段落 —— 那不是改动
    if (next) next = !sameDocIgnoringTrailingSpacer(editor.getJSON(), baseline.toJSON())
    if (next && !docDiffLoggedRef.current) {
      docDiffLoggedRef.current = true
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[dirty] doc diff —— ' + describeDocDiff(editor.getJSON(), baseline.toJSON()))
      }
    } else if (!next) {
      docDiffLoggedRef.current = false
    }
    setDocDirty(next)
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
        relations,
        tags,
        custom,
        images,
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
    relations,
    tags,
    custom,
    images,
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

  useEditorDirty(
    'event',
    event.id,
    fieldsDirty || docDirty,
    saving,
    [fieldsDirty ? `字段 ${diffSummary}` : '', docDirty ? '正文文档与基线不同' : ''].filter(Boolean).join(' + '),
  )

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
    relations, setRelations,
    relationRows,
    relationCandidates,
    addRelation,
    removeRelation,
    renameRelation,
    setRelationArrow,
    tags, setTags,
    images, setImages,
    saving,
    docDirty,
    handleSave,
    handleEditorReady,
    handleDocChange,
  }
}

export type EventForm = ReturnType<typeof useEventForm>
