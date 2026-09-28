'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import type { Character, RelatedCharacter } from '@/types'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import type { CharacterFormData } from '../types'
import { useCharacterList } from './useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'

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

/**
 * 角色编辑表单：字段状态、外部更新回灌、关联/国籍派生、脏标记与保存。
 * 供 `CharacterEditor` 的壳与各 section 共用；除实体与保存回调外不接收 props。
 */
export function useCharacterForm(
  character: Character,
  onSave: (id: number, data: Partial<CharacterFormData>) => Promise<void>,
) {
  const [name, setName] = useState(character.name)
  const [aliasesStr, setAliasesStr] = useState(safeAliasesJoin(character.aliases))
  const [race, setRace] = useState(character.race)
  const [element, setElement] = useState(character.element)
  const [occupation, setOccupation] = useState(character.occupation)
  const [nationalityLegacy, setNationalityLegacy] = useState(character.nationalityLegacy)
  const [countryId, setCountryId] = useState<number | undefined>(character.countryId)
  const [height, setHeight] = useState(character.height)
  const [birthday, setBirthday] = useState(character.birthday)

  const [avatarUrl, setAvatarUrl] = useState(character.avatarUrl)
  const [headerUrl, setHeaderUrl] = useState(character.headerUrl ?? '')
  const [tags, setTags] = useState<number[]>(character.tags ?? [])
  const [avatarUrls, setAvatarUrls] = useState<string[]>(
    (Array.isArray(character.avatars) ? character.avatars : []).map((a) => (typeof a === 'string' ? a : a.url)),
  )
  const [galleryUrls, setGalleryUrls] = useState<string[]>(
    (Array.isArray(character.gallery) ? character.gallery : []).map((g) => (typeof g === 'string' ? g : g.url)),
  )
  const [relatedCharacters, setRelatedCharacters] = useState<RelatedCharacter[]>(
    character.relatedCharacters,
  )
  const [isMajor, setIsMajor] = useState(character.isMajor ?? false)

  const [saving, setSaving] = useState(false)
  const { markDirty, markSaving, markSaved, registerSaveHandler } = useSaveStatus()
  const docEditorRef = useRef<Editor | null>(null)
  const prevUpdatedAtRef = useRef(character.updatedAt)

  useEffect(() => {
    if (prevUpdatedAtRef.current !== character.updatedAt) {
      prevUpdatedAtRef.current = character.updatedAt
      setName(character.name)
      setAliasesStr(safeAliasesJoin(character.aliases))
      setRace(character.race)
      setElement(character.element)
      setOccupation(character.occupation)
      setNationalityLegacy(character.nationalityLegacy)
      setCountryId(character.countryId)
      setHeight(character.height)
      setBirthday(character.birthday)
      setAvatarUrl(character.avatarUrl)
      setHeaderUrl(character.headerUrl ?? '')
      setAvatarUrls(
        (Array.isArray(character.avatars) ? character.avatars : []).map((a) => (typeof a === 'string' ? a : a.url)),
      )
      setGalleryUrls(
        (Array.isArray(character.gallery) ? character.gallery : []).map((g) => (typeof g === 'string' ? g : g.url)),
      )
      setRelatedCharacters(character.relatedCharacters)
      setIsMajor(character.isMajor ?? false)
    }
  }, [character])

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
        nationalityLegacy,
        countryId,
        height,
        birthday,
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
      })
      markSaved()
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
    nationalityLegacy,
    countryId,
    height,
    birthday,
    relatedCharacters,
    tags,
    isMajor,
    onSave,
    markSaving,
    markSaved,
  ])

  useEffect(() => {
    registerSaveHandler('character', handleSave)
    return () => registerSaveHandler('character', null)
  }, [handleSave, registerSaveHandler])

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
    nationalityLegacy, setNationalityLegacy,
    countryId,
    height, setHeight,
    birthday, setBirthday,
    avatarUrl, setAvatarUrl,
    headerUrl, setHeaderUrl,
    tags, setTags,
    avatarUrls, setAvatarUrls,
    galleryUrls, setGalleryUrls,
    relatedCharacters, setRelatedCharacters,
    isMajor, setIsMajor,
    saving,
    markDirty,
    handleSave,
    handleDocReady,
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
