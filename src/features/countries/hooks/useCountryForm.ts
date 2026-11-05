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
import { describeDocDiff, sameDocIgnoringTrailingSpacer, snapshotKey, useDirtySnapshot } from '@/lib/dirty'
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
  tags: number[]
}

function valuesFromEntity(country: Country): CountryValues {
  return {
    name: country.name,
    flagUrl: country.flagUrl ?? '',
    headerUrl: country.headerUrl ?? '',
    tags: country.tags ?? [],
  }
}

/** 只比**会被保存到国家这一行**的东西（相关角色 / 事件是实体侧字段，单独判脏） */
function valuesSnapshot(values: CountryValues): Record<string, unknown> {
  return {
    name: values.name,
    flagUrl: values.flagUrl,
    headerUrl: values.headerUrl,
    tags: values.tags,
  }
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort((x, y) => x - y)
  const right = [...b].sort((x, y) => x - y)
  return left.every((value, index) => value === right[index])
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
  const [tags, setTags] = useState(initial.tags)

  const { characters: allCharacters } = useCharacterList()
  const { events: allEvents } = useEventList()

  /**
   * 「相关角色 / 相关事件」= **实体侧的查询结果**（阶段二·一）。
   *
   * 本地只在用户动过之后才有一份覆盖（`null` = 还没动过，跟着查询走）：
   * 这样外部改了角色国籍，列表会自动跟着变，不需要镜像、也不需要「回灌」这两个列表。
   */
  const derivedCharacterIds = useMemo(
    () => allCharacters.filter((item) => item.countryId === country.id).map((item) => item.id),
    [allCharacters, country.id],
  )
  const derivedEventIds = useMemo(
    () => allEvents.filter((item) => (item.countries ?? []).includes(country.id)).map((item) => item.id),
    [allEvents, country.id],
  )

  const [editedCharIds, setEditedCharIds] = useState<number[] | null>(null)
  const [editedEventIds, setEditedEventIds] = useState<number[] | null>(null)

  const characterIds = editedCharIds ?? derivedCharacterIds
  const eventIds = editedEventIds ?? derivedEventIds

  const { markSaving, registerSaveHandler, reportDirty } = useSaveStatus()
  const docEditorRef = useRef<Editor | null>(null)
  const docBaselineRef = useRef<Editor['state']['doc'] | null>(null)
  /** 诊断：正文第一次变脏时把差异打一次 log，别每敲一个字都刷屏 */
  const docDiffLoggedRef = useRef(false)
  const [docDirty, setDocDirty] = useState(false)
  const prevUpdatedAtRef = useRef(country.updatedAt)
  /** 上一次保存写进去的那份值：回读时据此认出「这是我自己写的」 */
  const savedSnapshotRef = useRef<string | null>(null)

  const values = useMemo<CountryValues>(() => ({
    name, flagUrl, headerUrl, tags,
  }), [name, flagUrl, headerUrl, tags])

  const snapshot = useMemo(() => valuesSnapshot(values), [values])
  const { dirty: fieldsDirty, diffSummary, markClean: markFieldsClean } = useDirtySnapshot(snapshot)

  /** 名单是实体侧字段：脏 = 「动过」且与查询结果不同 */
  const listsDirty =
    (editedCharIds !== null && !sameIds(editedCharIds, derivedCharacterIds)) ||
    (editedEventIds !== null && !sameIds(editedEventIds, derivedEventIds))

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
    setTags(next.tags)
    // 名单没有本地副本要回灌：清掉覆盖就自动跟着查询走
    setEditedCharIds(null)
    setEditedEventIds(null)
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
        characters: characterIds,
        events: eventIds,
        tags,
      })
      savedSnapshotRef.current = snapshotKey(snapshot)
      markFieldsClean()
      // 名单已写进实体侧，覆盖层清空 → 重新跟着查询走
      setEditedCharIds(null)
      setEditedEventIds(null)
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
    name, flagUrl, headerUrl, characterIds, eventIds, tags,
    onSave, markSaving, markFieldsClean, reportDirty, snapshot,
  ])

  useEffect(() => {
    registerSaveHandler('country', handleSave)
    return () => registerSaveHandler('country', null)
  }, [handleSave, registerSaveHandler])

  useEditorDirty(
    'country',
    country.id,
    fieldsDirty || docDirty || listsDirty,
    saving,
    [
      fieldsDirty ? `字段 ${diffSummary}` : '',
      docDirty ? '正文文档与基线不同' : '',
      listsDirty ? '关联名单变了' : '',
    ].filter(Boolean).join(' + '),
  )

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
    () => characterIds.filter((id): id is number => typeof id === 'number'),
    [characterIds],
  )

  const relatedEventIds = useMemo(
    () => eventIds.filter((id): id is number => typeof id === 'number'),
    [eventIds],
  )

  return {
    name, setName,
    flagUrl, setFlagUrl,
    headerUrl, setHeaderUrl,
    saving,
    docDirty,
    /** 名单：`editable*` 是给 UI 的名字，值来自「查询 + 本地覆盖」 */
    editableCharIds: characterIds,
    setEditableCharIds: setEditedCharIds,
    editableEventIds: eventIds,
    setEditableEventIds: setEditedEventIds,
    tags, setTags,
    handleSave,
    handleDocReady,
    handleDocChange,
    relatedCharacterItems,
    relatedEventItems,
    relatedCharacterIds: characterIds,
    relatedEventIds: eventIds,
  }
}

export type CountryForm = ReturnType<typeof useCountryForm>

/** 供 `CountryEditorInner` 的 props 使用（列表数据由 form hook 自行获取） */
export type { Character, Event } from '@/types'
