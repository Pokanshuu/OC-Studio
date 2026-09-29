'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { Country, Character, Event } from '@/types'
import type { CountryFormData } from '../types'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
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

/**
 * 国家编辑表单：字段状态、关联项派生、脏标记与保存。
 * 供 `CountryEditor` 的壳与各 section 共用；除实体与保存回调外不接收 props。
 */
export function useCountryForm(
  country: Country,
  onSave: (id: number, data: Partial<CountryFormData>) => Promise<void>,
) {
  const [name, setName] = useState(country.name)
  const [flagUrl, setFlagUrl] = useState(country.flagUrl ?? '')
  const [headerUrl, setHeaderUrl] = useState(country.headerUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [editableCharIds, setEditableCharIds] = useState<number[]>(country.characters)
  const [editableEventIds, setEditableEventIds] = useState<number[]>(country.events)
  const [tags, setTags] = useState<number[]>(country.tags ?? [])

  const { markDirty, markSaving, markSaved, registerSaveHandler } = useSaveStatus()
  const isFirstRenderRef = useRef(true)
  const suppressDirtyRef = useRef(false)

  const docEditorRef = useRef<Editor | null>(null)

  // 任一字段变化即标记未保存（跳过首帧与保存后的程序化同步）
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (suppressDirtyRef.current) return
    markDirty()
  }, [name, flagUrl, headerUrl, editableCharIds, editableEventIds, tags, markDirty])

  const handleDocReady = useCallback((editor: Editor) => {
    docEditorRef.current = editor
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
      markSaved()
      suppressDirtyRef.current = true
      setTimeout(() => { suppressDirtyRef.current = false }, 0)
    } finally {
      setSaving(false)
    }
  }, [country.id, country.parentId, country.system, country.geography, country.culture, name, flagUrl, headerUrl, editableCharIds, editableEventIds, tags, onSave, markSaving, markSaved])

  useEffect(() => {
    registerSaveHandler('country', handleSave)
    return () => registerSaveHandler('country', null)
  }, [handleSave, registerSaveHandler])

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
    markDirty,
    handleSave,
    handleDocReady,
    relatedCharacterItems,
    relatedEventItems,
    relatedCharacterIds,
    relatedEventIds,
  }
}

export type CountryForm = ReturnType<typeof useCountryForm>

/** 供 `CountryEditorInner` 的 props 使用（列表数据由 form hook 自行获取） */
export type { Character, Event }
