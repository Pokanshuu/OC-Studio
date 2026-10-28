'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { Country } from '@/types'
import type { CountryFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { toast } from 'sonner'
import { useEditorDirty } from '@/components/layout/useEditorDirty'
import { snapshotKey, useDirtySnapshot } from '@/lib/dirty'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'

/** 政治制度 / 地理环境 / 人文风貌三段合并成一份正文文档 */
export function mergeCountrySections(system: string, geography: string, culture: string): string | undefined {
  if (!system && !geography && !culture) return undefined
  const parts: string[] = []
  if (system) { parts.push('<h2>政治制度</h2>'); parts.push(system) }
  if (geography) { parts.push('<h2>地理环境</h2>'); parts.push(geography) }
  if (culture) { parts.push('<h2>人文风貌</h2>'); parts.push(culture) }
  return parts.join('\n')
}

/** 表单里可编辑的全部字段 —— 装载、回灌、脏判断共用这一份形状 */
interface CountryValues {
  name: string
  flagUrl: string
  headerUrl: string
  characterIds: number[]
  eventIds: number[]
  tags: number[]
}

function valuesFromEntity(country: Country): CountryValues {
  return {
    name: country.name,
    flagUrl: country.flagUrl ?? '',
    headerUrl: country.headerUrl ?? '',
    characterIds: country.characters ?? [],
    eventIds: country.events ?? [],
    tags: country.tags ?? [],
  }
}

/** 只比**会被保存的东西** */
function valuesSnapshot(values: CountryValues): Record<string, unknown> {
  return {
    name: values.name,
    flagUrl: values.flagUrl,
    headerUrl: values.headerUrl,
    characters: values.characterIds,
    events: values.eventIds,
    tags: values.tags,
  }
}

/**
 * 国家编辑表单：字段状态、外部更新回灌、关联项派生、脏标记与保存。
 * 供 `CountryEditor` 的壳与各 section 共用；除实体与保存回调外不接收 props。
 */
export function useCountryForm(
  country: Country,
  onSave: (id: number, data: Partial<CountryFormData>) => Promise<void>,
) {
  const [initial] = useState(() => valuesFromEntity(country))

  const [name, setName] = useState(initial.name)
  const [flagUrl, setFlagUrl] = useState(initial.flagUrl)
  const [headerUrl, setHeaderUrl] = useState(initial.headerUrl)
  const [saving, setSaving] = useState(false)
  const [editableCharIds, setEditableCharIds] = useState<number[]>(initial.characterIds)
  const [editableEventIds, setEditableEventIds] = useState<number[]>(initial.eventIds)
  const [tags, setTags] = useState<number[]>(initial.tags)

  const { markSaving, registerSaveHandler, reportDirty } = useSaveStatus()
  const docEditorRef = useRef<Editor | null>(null)
  const docBaselineRef = useRef<Editor['state']['doc'] | null>(null)
  const [docDirty, setDocDirty] = useState(false)
  const prevUpdatedAtRef = useRef(country.updatedAt)
  /** 上一次保存写进去的那份值：回读时据此认出「这是我自己写的」 */
  const savedSnapshotRef = useRef<string | null>(null)

  const values = useMemo<CountryValues>(() => ({
    name, flagUrl, headerUrl,
    characterIds: editableCharIds, eventIds: editableEventIds, tags,
  }), [name, flagUrl, headerUrl, editableCharIds, editableEventIds, tags])

  const snapshot = useMemo(() => valuesSnapshot(values), [values])
  const { dirty: fieldsDirty, markClean: markFieldsClean } = useDirtySnapshot(snapshot)

  // 外部改写后回灌，并把同一份值记为新的干净基线。
  // 自己刚保存的那份回读不回灌 —— 否则会把保存期间还在输入的字冲掉。
  useEffect(() => {
    if (saving || prevUpdatedAtRef.current === country.updatedAt) return
    prevUpdatedAtRef.current = country.updatedAt
    const next = valuesFromEntity(country)
    const nextKey = snapshotKey(valuesSnapshot(next))
    if (nextKey === savedSnapshotRef.current) return
    setName(next.name)
    setFlagUrl(next.flagUrl)
    setHeaderUrl(next.headerUrl)
    setEditableCharIds(next.characterIds)
    setEditableEventIds(next.eventIds)
    setTags(next.tags)
    markFieldsClean(nextKey)
  }, [country, markFieldsClean, saving])

  const handleDocReady = useCallback((editor: Editor) => {
    docEditorRef.current = editor
    docBaselineRef.current = editor.state.doc
    setDocDirty(false)
  }, [])

  /** 正文变更：与基线文档逐节点比对，撤销/改回原样自然回到「干净」 */
  const handleDocChange = useCallback(() => {
    const editor = docEditorRef.current
    const baseline = docBaselineRef.current
    if (!editor || !baseline) return
    setDocDirty(!editor.state.doc.eq(baseline))
  }, [])

  const handleSave = useCallback(async () => {
    markSaving()
    setSaving(true)
    try {
      const document = docEditorRef.current?.getJSON()

      await onSave(country.id, {
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
      savedSnapshotRef.current = snapshotKey(snapshot)
      markFieldsClean()
      const editor = docEditorRef.current
      if (editor) docBaselineRef.current = editor.state.doc
      setDocDirty(false)
    } catch (err) {
      // 保存失败必须把状态从「保存中」拉回来：只 catch 不处理会永远转圈
      toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) })
      reportDirty(true)
    } finally {
      setSaving(false)
    }
  }, [
    country.id, country.parentId, country.system, country.geography, country.culture,
    name, flagUrl, headerUrl, editableCharIds, editableEventIds, tags,
    onSave, markSaving, markFieldsClean, snapshot,
  ])

  useEffect(() => {
    registerSaveHandler('country', handleSave)
    return () => registerSaveHandler('country', null)
  }, [handleSave, registerSaveHandler])

  useEditorDirty('country', country.id, fieldsDirty || docDirty, saving)

  const { characters: allCharacters } = useCharacterList()
  const { events: allEvents } = useEventList()

  const relatedCharacterItems: RelatedItem[] = useMemo(
    () =>
      allCharacters.map((c) => ({
        id: c.id,
        name: c.name,
        subtitle: c.aliases.length > 0 ? c.aliases.join('、') : undefined,
      })),
    [allCharacters],
  )

  const relatedEventItems: RelatedItem[] = useMemo(
    () =>
      allEvents.map((e) => ({
        id: e.id,
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

  return {
    name, setName,
    flagUrl, setFlagUrl,
    headerUrl, setHeaderUrl,
    saving,
    editableCharIds, setEditableCharIds,
    editableEventIds, setEditableEventIds,
    tags, setTags,
    handleSave,
    handleDocReady,
    handleDocChange,
    relatedCharacterItems,
    relatedEventItems,
    relatedCharacterIds,
    relatedEventIds,
  }
}

export type CountryForm = ReturnType<typeof useCountryForm>

/** 供 `CountryEditorInner` 的 props 使用（列表数据由 form hook 自行获取） */
export type { Character, Event } from '@/types'
