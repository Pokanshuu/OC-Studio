'use client'

import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { Country, GalleryImage } from '@/types'
import type { CountryFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { toast } from 'sonner'
import { useEditorDirty } from '@/components/layout/useEditorDirty'
import { describeDocDiff, sameDocNodeIgnoringTrailingSpacer, snapshotKey, useDirtySnapshot } from '@/lib/dirty'
import { docRevisionChanged } from '@/lib/save-revision'
import { useSavePipeline } from '@/lib/use-save-pipeline'
import { FACT_RELATION, type RelationCandidate, type RelationRow, type RelationTargetKind } from '@/components/shared/relations/types'
import { useAutoSave } from '@/components/layout/use-auto-save'
import { legacyBodySections, type LegacyBodySections } from '@/lib/body-content'

/** 政治制度 / 地理环境 / 人文风貌三段合并成一份正文文档 */
export function mergeCountrySections(system: string, geography: string, culture: string): LegacyBodySections | undefined {
  return legacyBodySections([
    { heading: '政治制度', content: system },
    { heading: '地理环境', content: geography },
    { heading: '人文风貌', content: culture },
  ])
}

/** 表单里可编辑的全部字段 —— 装载、回灌、脏判断共用这一份形状 */
interface CountryValues {
  name: string
  description: string
  flagUrl: string
  headerUrl: string
  gallery: GalleryImage[]
  tags: number[]
  /** 自建字段（键 = 字段表里的 key） */
  custom: Record<string, string>
}

function valuesFromEntity(country: Country): CountryValues {
  return {
    name: country.name,
    description: country.description,
    flagUrl: country.flagUrl ?? '',
    headerUrl: country.headerUrl ?? '',
    gallery: country.gallery ?? [],
    tags: country.tags ?? [],
    custom: { ...(country.custom ?? {}) },
  }
}

/** 只比**会被保存到国家这一行**的东西（相关角色 / 事件是实体侧字段，单独判脏） */
function valuesSnapshot(values: CountryValues): Record<string, unknown> {
  return {
    name: values.name,
    description: values.description,
    flagUrl: values.flagUrl,
    headerUrl: values.headerUrl,
    gallery: values.gallery.map((image) => image.url),
    tags: values.tags,
    custom: values.custom,
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
  const [description, setDescription] = useState(initial.description)
  const [flagUrl, setFlagUrl] = useState(initial.flagUrl)
  const [headerUrl, setHeaderUrl] = useState(initial.headerUrl)
  const [gallery, setGallery] = useState<GalleryImage[]>(initial.gallery)
  const [tags, setTags] = useState(initial.tags)
  const [custom, setCustom] = useState<Record<string, string>>(initial.custom)

  const setCustomValue = useCallback((key: string, value: string) => {
    setCustom((prev) => ({ ...prev, [key]: value }))
  }, [])

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
    name, description, flagUrl, headerUrl, gallery, tags, custom,
  }), [name, description, flagUrl, headerUrl, gallery, tags, custom])

  const snapshot = useMemo(() => valuesSnapshot(values), [values])
  const { dirty: fieldsDirty, diffSummary, markClean: markFieldsClean } = useDirtySnapshot(snapshot)

  /** 名单是实体侧字段：脏 = 「动过」且与查询结果不同 */
  const listsDirty =
    (editedCharIds !== null && !sameIds(editedCharIds, derivedCharacterIds)) ||
    (editedEventIds !== null && !sameIds(editedEventIds, derivedEventIds))

  /**
   * 统一的脏口径：字段 / 正文 / 成员关系**任何一项**不同都算脏。
   * 自动保存、返回判断、全局状态栏、离场屏障全都消费这一个值 ——
   * 以前 listsDirty 只进了 `useEditorDirty`，于是「只改名单」既不自动保存也不计入 dirty。
   */
  const isDirty = fieldsDirty || docDirty || listsDirty

  /** 最后一次确认保存的字段签名；await 结束后据此判断「这期间又改了吗」 */
  const savedFieldsKeyRef = useRef<string>(snapshotKey(valuesSnapshot(initial)))

  /**
   * 保存是在 await 之后才执行的，必须读「此刻」的值而不是发起保存那一刻的 render 闭包。
   * 用 layout effect 同步：离散输入事件提交后、微任务恢复前一定拿得到新值。
   */
  const latestRef = useRef({
    values,
    editedCharIds,
    editedEventIds,
    derivedCharacterIds,
    derivedEventIds,
  })
  useLayoutEffect(() => {
    latestRef.current = { values, editedCharIds, editedEventIds, derivedCharacterIds, derivedEventIds }
  }, [values, editedCharIds, editedEventIds, derivedCharacterIds, derivedEventIds])

  /** 读当前（非 render 快照）是否还有未保存的修订 */
  const isDirtyNow = useCallback(() => {
    const current = latestRef.current
    if (snapshotKey(valuesSnapshot(current.values)) !== savedFieldsKeyRef.current) return true
    const characters = current.editedCharIds ?? current.derivedCharacterIds
    const events = current.editedEventIds ?? current.derivedEventIds
    if (!sameIds(characters, current.derivedCharacterIds)) return true
    if (!sameIds(events, current.derivedEventIds)) return true
    const editor = docEditorRef.current
    const baseline = docBaselineRef.current
    return editor !== null && baseline !== null && docRevisionChanged(editor.state.doc, baseline)
  }, [])

  // 外部改写后回灌的逻辑在保存流水线之后（它要读 `saving`；放在前面会踩 TDZ）。

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
    if (next) next = !sameDocNodeIgnoringTrailingSpacer(editor.state.doc, baseline)
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

  /**
   * 提交一版修订。
   *
   * **保存开始时**捕获不可变文档节点和字段签名；成功后只确认这一版：
   * 文档基线 = 捕获的节点（不是保存完成时的 `editor.state.doc`），字段基线 = 提交的签名。
   * await 期间用户继续输入的内容由 `isDirtyNow()` 重新比出来，保持 dirty、继续保存。
   */
  const commit = useCallback(async () => {
    const submitted = latestRef.current
    const submittedValues = submitted.values
    const submittedKey = snapshotKey(valuesSnapshot(submittedValues))
    const submittedCharacters = submitted.editedCharIds ?? submitted.derivedCharacterIds
    const submittedEvents = submitted.editedEventIds ?? submitted.derivedEventIds
    const editor = docEditorRef.current
    const submittedDoc = editor ? editor.state.doc : null
    const document = submittedDoc ? submittedDoc.toJSON() : undefined

    markSaving()
    try {
      await onSave(country.id, {
        name: submittedValues.name,
        parentId: country.parentId,
        description: submittedValues.description,
        document,
        system: country.system,
        geography: country.geography,
        culture: country.culture,
        flagUrl: submittedValues.flagUrl,
        headerUrl: submittedValues.headerUrl,
        gallery: submittedValues.gallery,
        characters: submittedCharacters,
        events: submittedEvents,
        tags: submittedValues.tags,
        custom: submittedValues.custom,
      })

      savedSnapshotRef.current = submittedKey
      savedFieldsKeyRef.current = submittedKey
      markFieldsClean(submittedKey)
      // 名单已写进实体侧，覆盖层可清空 → 重新跟着查询走；
      // 但 await 期间如果又加了成员，覆盖层必须保留，否则新加的那个会被当没发生。
      // 同步改 latestRef：离场屏障的下一轮会在 React 提交 state 之前就重新判断 dirty，
      // 只看 state 的话会误判「仍然脏」并再存一遍。
      const latest = latestRef.current
      if (sameIds(latest.editedCharIds ?? latest.derivedCharacterIds, submittedCharacters)) {
        latest.editedCharIds = null
        setEditedCharIds(null)
      }
      if (sameIds(latest.editedEventIds ?? latest.derivedEventIds, submittedEvents)) {
        latest.editedEventIds = null
        setEditedEventIds(null)
      }
      if (editor && submittedDoc) {
        docBaselineRef.current = submittedDoc
        const stillDirty = docRevisionChanged(editor.state.doc, submittedDoc)
        setDocDirty(stillDirty)
        docDiffLoggedRef.current = stillDirty
      }
    } catch (err) {
      // 保存失败必须把状态从「保存中」拉回来：只 catch 不处理会永远转圈
      toast.error('保存失败', { description: err instanceof Error ? err.message : String(err) })
      reportDirty(true)
      throw err
    }
  }, [
    country.id, country.parentId, country.system, country.geography, country.culture,
    onSave, markSaving, markFieldsClean, reportDirty,
  ])

  const { save: saveNow, saving } = useSavePipeline({ isDirty: isDirtyNow, commit })
  /**
   * 兼容既有调用点（`onBeforeOpen` / 工具栏按钮的 props 是 `() => void | Promise<void>`）。
   * 真正的结果由流水线和离场屏障消费；这里拿到的是「这一轮已经跑完」。
   */
  const handleSave = useCallback(async (): Promise<void> => {
    await saveNow()
  }, [saveNow])

  // 外部改写后回灌，并把同一份值记为新的干净基线。
  // 自己刚保存的那份回读不回灌 —— 否则会把保存期间还在输入的字冲掉。
  useEffect(() => {
    if (saving || prevUpdatedAtRef.current === country.updatedAt) return
    prevUpdatedAtRef.current = country.updatedAt
    const next = valuesFromEntity(country)
    const nextKey = snapshotKey(valuesSnapshot(next))
    if (nextKey === savedSnapshotRef.current) return
    setName(next.name)
    setDescription(next.description)
    setFlagUrl(next.flagUrl)
    setHeaderUrl(next.headerUrl)
    setGallery(next.gallery)
    setTags(next.tags)
    setCustom(next.custom)
    // 名单没有本地副本要回灌：清掉覆盖就自动跟着查询走
    setEditedCharIds(null)
    setEditedEventIds(null)
    savedFieldsKeyRef.current = nextKey
    markFieldsClean(nextKey)
  }, [country, markFieldsClean, saving])

  useEffect(() => {
    registerSaveHandler('country', saveNow)
    return () => registerSaveHandler('country', null)
  }, [registerSaveHandler, saveNow])

  useEditorDirty(
    'country',
    country.id,
    isDirty,
    saving,
    [
      fieldsDirty ? `字段 ${diffSummary}` : '',
      docDirty ? '正文文档与基线不同' : '',
      listsDirty ? '关联名单变了' : '',
    ].filter(Boolean).join(' + '),
  )

  // 停手 1.5 秒自动落地：常驻挂载的编辑器没有「卸载」可挂，只能主动写
  useAutoSave({ dirty: isDirty, saving, save: saveNow })

  /**
   * 关系组件的数据：国家侧没有自己的关系数组，成员名单是**实体侧的查询**
   * （`docs/模板.md §1.4`）。所以这里只有事实边（居民 / 发生于），关系名只读；
   * 新增 / 移除仍走「查询 + 本地覆盖」，保存时才写回实体侧（`membership.ts`）。
   */
  const relationRows = useMemo<RelationRow[]>(() => {
    const characterById = new Map(allCharacters.map((item) => [item.id, item]))
    const eventById = new Map(allEvents.map((item) => [item.id, item]))
    const rows: RelationRow[] = []

    characterIds.forEach((id, index) => {
      const target = characterById.get(id)
      rows.push({
        key: `character-${id}-${index}`,
        kind: 'character',
        targetId: id,
        name: target?.name ?? '未命名',
        relation: FACT_RELATION.belongs,
        relationEditable: false,
        index,
      })
    })

    eventIds.forEach((id, index) => {
      const target = eventById.get(id)
      rows.push({
        key: `event-${id}-${index}`,
        kind: 'event',
        targetId: id,
        name: target?.title ?? '未命名',
        relation: FACT_RELATION.occurredAt,
        relationEditable: false,
        index,
      })
    })

    return rows
  }, [allCharacters, allEvents, characterIds, eventIds])

  const relationCandidates = useMemo<RelationCandidate[]>(() => {
    const linkedCharacters = new Set(characterIds)
    const linkedEvents = new Set(eventIds)
    return [
      ...allCharacters
        // 已经有别的国籍的人不做候选：保存时 `applyCountryCharacters` 不会抢过来，
        // 加进来只会在保存后凭空消失
        .filter(
          (item) =>
            !linkedCharacters.has(item.id) &&
            (item.countryId === undefined || item.countryId === null || item.countryId === country.id),
        )
        .map((item) => ({
          kind: 'character' as const,
          targetId: item.id,
          name: item.name,
          subtitle: item.aliases.length > 0 ? item.aliases.join('、') : undefined,
        })),
      ...allEvents
        .filter((item) => !linkedEvents.has(item.id))
        .map((item) => ({
          kind: 'event' as const,
          targetId: item.id,
          name: item.title,
          subtitle: item.time || undefined,
        })),
    ]
  }, [allCharacters, allEvents, characterIds, country.id, eventIds])

  const addRelation = useCallback(
    (kind: RelationTargetKind, targetId: number) => {
      if (kind === 'character') {
        setEditedCharIds([...characterIds, targetId])
      } else if (kind === 'event') {
        setEditedEventIds([...eventIds, targetId])
      }
    },
    [characterIds, eventIds],
  )

  const removeRelation = useCallback(
    (row: RelationRow) => {
      if (row.index === undefined) return
      if (row.kind === 'character') {
        setEditedCharIds(characterIds.filter((_, index) => index !== row.index))
      } else if (row.kind === 'event') {
        setEditedEventIds(eventIds.filter((_, index) => index !== row.index))
      }
    },
    [characterIds, eventIds],
  )

  return {
    name, setName,
    description, setDescription,
    flagUrl, setFlagUrl,
    headerUrl, setHeaderUrl,
    gallery, setGallery,
    custom, setCustomValue,
    saving,
    /** 字段 / 正文 / 成员关系任一有未保存改动（自动保存与离场判断共用这一项） */
    dirty: isDirty,
    docDirty,
    tags, setTags,
    handleSave,
    saveNow,
    handleDocReady,
    handleDocChange,
    relationRows,
    relationCandidates,
    addRelation,
    removeRelation,
  }
}

export type CountryForm = ReturnType<typeof useCountryForm>

/** 供 `CountryEditorInner` 的 props 使用（列表数据由 form hook 自行获取） */
export type { Character, Event } from '@/types'
