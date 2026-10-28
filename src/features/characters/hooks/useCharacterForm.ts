'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { Character, GalleryImage, RelatedCharacter } from '@/types'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import type { CharacterFormData } from '../types'
import { useCharacterList } from './useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { toast } from 'sonner'
import { useEditorDirty } from '@/components/layout/useEditorDirty'
import { snapshotKey, useDirtySnapshot } from '@/lib/dirty'
import { parseTime, assembleTime } from '@/features/events/utils'

/** 存量数据里 aliases 可能是字符串（历史格式），统一成可编辑文本 */
export function safeAliasesJoin(aliases: string[]): string {
  if (!Array.isArray(aliases)) return (aliases as unknown as string) || ''
  return aliases.join('、')
}

function parseAliases(str: string): string[] {
  return str
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 图库/立绘在库里有对象与裸字符串两种历史形态，统一取 url */
function toUrls(images: Array<GalleryImage | string> | undefined): string[] {
  if (!Array.isArray(images)) return []
  return images.map((image) => (typeof image === 'string' ? image : image.url))
}

/** 表单里可编辑的全部字段 —— 装载、回灌、脏判断共用这一份形状 */
interface CharacterValues {
  name: string
  aliasesStr: string
  race: string
  element: string
  occupation: string
  faction: string
  nationalityLegacy: string
  countryId?: number
  height: string
  /** 生日拆成三段编辑，落库仍是 `年-月-日` 一个字符串（与事件时间同一套格式） */
  birthdayYear: string
  birthdayMonth: string
  birthdayDay: string
  avatarUrl: string
  headerUrl: string
  avatarUrls: string[]
  galleryUrls: string[]
  relatedCharacters: RelatedCharacter[]
  isMajor: boolean
  custom: Record<string, string>
  tags: number[]
}

function valuesFromEntity(character: Character): CharacterValues {
  const birthday = parseTime(character.birthday)
  return {
    name: character.name,
    aliasesStr: safeAliasesJoin(character.aliases),
    race: character.race,
    element: character.element,
    occupation: character.occupation,
    faction: character.faction,
    nationalityLegacy: character.nationalityLegacy,
    countryId: character.countryId,
    height: character.height,
    birthdayYear: birthday.year,
    birthdayMonth: birthday.month,
    birthdayDay: birthday.day,
    avatarUrl: character.avatarUrl,
    headerUrl: character.headerUrl ?? '',
    avatarUrls: toUrls(character.avatars),
    galleryUrls: toUrls(character.gallery),
    relatedCharacters: character.relatedCharacters ?? [],
    isMajor: character.isMajor ?? false,
    custom: character.custom ?? {},
    tags: character.tags ?? [],
  }
}

/**
 * 参与比对的值 —— 只放**会被保存的东西**，且用落库后的规范形态：
 * 别名按分隔符切分（`a,b` 与 `a、b` 是同一份数据）、关系只比 id+关系描述
 * （对象里的 `name` 会随改名变化，不该算这一次编辑）。
 */
function valuesSnapshot(values: CharacterValues): Record<string, unknown> {
  return {
    name: values.name,
    aliases: parseAliases(values.aliasesStr),
    race: values.race,
    element: values.element,
    occupation: values.occupation,
    faction: values.faction,
    nationalityLegacy: values.nationalityLegacy,
    countryId: values.countryId ?? null,
    height: values.height,
    birthday: assembleTime(values.birthdayYear, values.birthdayMonth, values.birthdayDay),
    avatarUrl: values.avatarUrl,
    headerUrl: values.headerUrl,
    avatars: values.avatarUrls,
    gallery: values.galleryUrls,
    related: values.relatedCharacters.map((rc) => ({
      characterId: rc.characterId ?? null,
      relation: rc.relation,
    })),
    isMajor: values.isMajor,
    custom: values.custom,
    tags: values.tags,
  }
}

/**
 * 角色编辑表单：字段状态、外部更新回灌、关联/国籍派生、脏标记与保存。
 * 供 `CharacterEditor` 的壳与各 section 共用；除实体与保存回调外不接收 props。
 */
export function useCharacterForm(
  character: Character,
  onSave: (id: number, data: Partial<CharacterFormData>) => Promise<void>,
) {
  /** 挂载那一刻的字段值：初始 state 与初始基线都从这里来，不会两边漂移 */
  const [initial] = useState(() => valuesFromEntity(character))

  const [name, setName] = useState(initial.name)
  const [aliasesStr, setAliasesStr] = useState(initial.aliasesStr)
  const [race, setRace] = useState(initial.race)
  const [element, setElement] = useState(initial.element)
  const [occupation, setOccupation] = useState(initial.occupation)
  const [faction, setFaction] = useState(initial.faction)
  const [nationalityLegacy, setNationalityLegacy] = useState(initial.nationalityLegacy)
  const [countryId, setCountryId] = useState<number | undefined>(initial.countryId)
  const [height, setHeight] = useState(initial.height)
  const [birthdayYear, setBirthdayYear] = useState(initial.birthdayYear)
  const [birthdayMonth, setBirthdayMonth] = useState(initial.birthdayMonth)
  const [birthdayDay, setBirthdayDay] = useState(initial.birthdayDay)

  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [headerUrl, setHeaderUrl] = useState(initial.headerUrl)
  const [tags, setTags] = useState<number[]>(initial.tags)
  const [avatarUrls, setAvatarUrls] = useState<string[]>(initial.avatarUrls)
  const [galleryUrls, setGalleryUrls] = useState<string[]>(initial.galleryUrls)
  const [relatedCharacters, setRelatedCharacters] = useState<RelatedCharacter[]>(
    initial.relatedCharacters,
  )
  const [isMajor, setIsMajor] = useState(initial.isMajor)
  /** 自定义字段的值：键 = 字段表里的 key。内置字段不走这里（各有各的列） */
  const [custom, setCustom] = useState<Record<string, string>>(initial.custom)

  const [saving, setSaving] = useState(false)
  const { markSaving, registerSaveHandler, reportDirty } = useSaveStatus()
  const docEditorRef = useRef<Editor | null>(null)
  /** 编辑器里「已保存」的那份文档：脏判断直接比 ProseMirror 文档，不比序列化文本 */
  const docBaselineRef = useRef<Editor['state']['doc'] | null>(null)
  const [docDirty, setDocDirty] = useState(false)
  const prevUpdatedAtRef = useRef(character.updatedAt)
  /** 上一次保存写进去的那份值：回读时据此认出「这是我自己写的」 */
  const savedSnapshotRef = useRef<string | null>(null)

  const values = useMemo<CharacterValues>(() => ({
    name, aliasesStr, race, element, occupation, faction, nationalityLegacy, countryId,
    height, birthdayYear, birthdayMonth, birthdayDay,
    avatarUrl, headerUrl, avatarUrls, galleryUrls, relatedCharacters,
    isMajor, custom, tags,
  }), [
    name, aliasesStr, race, element, occupation, faction, nationalityLegacy, countryId,
    height, birthdayYear, birthdayMonth, birthdayDay,
    avatarUrl, headerUrl, avatarUrls, galleryUrls, relatedCharacters,
    isMajor, custom, tags,
  ])

  const snapshot = useMemo(() => valuesSnapshot(values), [values])
  const { dirty: fieldsDirty, markClean: markFieldsClean } = useDirtySnapshot(snapshot)

  // 外部改写（别处保存 / 同步落地）后回灌，并把同一份值记为新的干净基线。
  // 自己刚保存的那份回读不回灌 —— 否则会把保存期间还在输入的字冲掉。
  useEffect(() => {
    if (saving || prevUpdatedAtRef.current === character.updatedAt) return
    prevUpdatedAtRef.current = character.updatedAt
    const next = valuesFromEntity(character)
    const nextKey = snapshotKey(valuesSnapshot(next))
    if (nextKey === savedSnapshotRef.current) return
    setName(next.name)
    setAliasesStr(next.aliasesStr)
    setRace(next.race)
    setElement(next.element)
    setOccupation(next.occupation)
    setFaction(next.faction)
    setNationalityLegacy(next.nationalityLegacy)
    setCountryId(next.countryId)
    setHeight(next.height)
    setBirthdayYear(next.birthdayYear)
    setBirthdayMonth(next.birthdayMonth)
    setBirthdayDay(next.birthdayDay)
    setAvatarUrl(next.avatarUrl)
    setHeaderUrl(next.headerUrl)
    setAvatarUrls(next.avatarUrls)
    setGalleryUrls(next.galleryUrls)
    setRelatedCharacters(next.relatedCharacters)
    setIsMajor(next.isMajor)
    setCustom(next.custom)
    setTags(next.tags)
    markFieldsClean(nextKey)
  }, [character, markFieldsClean, saving])

  const { characters: allCharacters } = useCharacterList()
  const { countries } = useCountryList()

  const characterItems: RelatedItem[] = useMemo(
    () =>
      allCharacters
        .filter((c) => c.id !== character.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          subtitle: c.aliases.length > 0 ? c.aliases.join('、') : undefined,
        })),
    [allCharacters, character.id],
  )

  const relatedCharacterIds = useMemo(
    () =>
      relatedCharacters
        .filter((rc): rc is RelatedCharacter & { characterId: number } => rc.characterId !== undefined)
        .map((rc) => rc.characterId),
    [relatedCharacters],
  )

  const handleRelatedCharactersChange = useCallback(
    (ids: number[]) => {
      const next: RelatedCharacter[] = ids.map((id) => {
        const existing = relatedCharacters.find((rc) => rc.characterId === id)
        if (existing) return existing
        const c = allCharacters.find((ch) => ch.id === id)
        return {
          characterId: id,
          name: c ? c.name : '',
          relation: '',
        }
      })
      setRelatedCharacters(next)
    },
    [allCharacters, relatedCharacters],
  )

  const countryItems: RelatedItem[] = useMemo(
    () =>
      countries.map((c) => ({
        id: c.id,
        name: c.name,
      })),
    [countries],
  )

  const selectedCountryIds = useMemo(
    () => (countryId !== undefined ? [countryId] : []),
    [countryId],
  )

  const handleCountryChange = useCallback(
    (ids: number[]) => {
      setCountryId(ids.length > 0 ? ids[0] : undefined)
    },
    [],
  )

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

  const setCustomValue = useCallback((key: string, value: string) => {
    setCustom((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    markSaving()
    setSaving(true)
    try {
      const document = docEditorRef.current?.getJSON()

      await onSave(character.id, {
        name,
        aliases: parseAliases(aliasesStr),
        race,
        element,
        occupation,
        faction,
        nationalityLegacy,
        countryId,
        height,
        birthday: assembleTime(birthdayYear, birthdayMonth, birthdayDay),
        avatarUrl,
        headerUrl,
        bio: character.bio,
        lifeStory: character.lifeStory,
        document,
        relatedCharacters,
        gallery: galleryUrls.map((url) => ({ url, caption: '' })),
        avatars: avatarUrls.map((url) => ({ url, type: 'portrait' as const })),
        tags,
        isMajor,
        custom,
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
    character.id,
    character.bio,
    character.lifeStory,
    avatarUrl,
    headerUrl,
    avatarUrls,
    galleryUrls,
    name,
    aliasesStr,
    race,
    element,
    occupation,
    faction,
    nationalityLegacy,
    countryId,
    height,
    birthdayYear,
    birthdayMonth,
    birthdayDay,
    relatedCharacters,
    tags,
    isMajor,
    custom,
    onSave,
    markSaving,
    markFieldsClean,
    snapshot,
  ])

  useEffect(() => {
    registerSaveHandler('character', handleSave)
    return () => registerSaveHandler('character', null)
  }, [handleSave, registerSaveHandler])

  useEditorDirty('character', character.id, fieldsDirty || docDirty, saving)

  // 名字下方的身份摘要（纯数据，不编辑器自身字段）
  const summaryLine = [
    occupation,
    countries.find((c) => c.id === countryId)?.name ?? nationalityLegacy,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    name, setName,
    aliasesStr, setAliasesStr,
    race, setRace,
    element, setElement,
    occupation, setOccupation,
    faction, setFaction,
    nationalityLegacy, setNationalityLegacy,
    countryId,
    height, setHeight,
    birthdayYear, setBirthdayYear,
    birthdayMonth, setBirthdayMonth,
    birthdayDay, setBirthdayDay,
    avatarUrl, setAvatarUrl,
    headerUrl, setHeaderUrl,
    tags, setTags,
    avatarUrls, setAvatarUrls,
    galleryUrls, setGalleryUrls,
    relatedCharacters, setRelatedCharacters,
    isMajor, setIsMajor,
    custom, setCustomValue,
    saving,
    handleSave,
    handleDocReady,
    handleDocChange,
    allCharacters,
    countries,
    characterItems,
    relatedCharacterIds,
    handleRelatedCharactersChange,
    countryItems,
    selectedCountryIds,
    handleCountryChange,
    summaryLine,
  }
}

export type CharacterForm = ReturnType<typeof useCharacterForm>
