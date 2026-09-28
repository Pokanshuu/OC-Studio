'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Save, ArrowLeft, X } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Character, RelatedCharacter } from '@/types'
import type { CharacterFormData } from '../types'
import { useCharacter, useUpdateCharacter } from '../hooks/useCharacters'
import { useCharacterList } from '../hooks/useCharacters'
import { TagPicker } from '@/features/tags'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import { ImageGallery } from '@/components/shared/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { Checkbox } from '@/components/ui/checkbox'
import { FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, PAGE_TITLE, SECTION_TITLE, SECTION_TITLE_BARE } from '@/lib/ui-tokens'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'

interface CharacterEditorProps {
  editCharacterId: number
  onBack: () => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

function safeAliasesJoin(aliases: string[]): string {
  if (!Array.isArray(aliases)) return (aliases as unknown as string) || ''
  return aliases.join('、')
}

/** 信息行占位符：只在「填错格式」的字段给示例，其余留空（标签已在左侧） */
const INFO_PLACEHOLDER: Record<string, string> = {
  别名: '多个用、分隔',
  身高: '170 cm',
  生日: '1998-03-12',
}

// 关系表表头
const REL_TH = 'pb-2 text-left text-[11px] font-normal tracking-[0.14em] text-ink-faint'

export function CharacterEditor({ editCharacterId, onBack, onNavigateToCharacter, onNavigateToCountry, onMentionClick, onCharacterCount, onWikiLinkClick }: CharacterEditorProps) {
  const { character, loading, error, refresh } = useCharacter(editCharacterId)
  const { updateCharacter } = useUpdateCharacter()

  useEffect(() => {
    refresh()
  }, [editCharacterId, refresh])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onBack}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          返回
        </button>
      </div>
    )
  }

  if (!character) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-ink-muted">角色不存在</span>
        <button
          onClick={onBack}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          返回
        </button>
      </div>
    )
  }

  return (
    <CharacterEditorInner
      key={character.id}
      character={character}
      onBack={onBack}
      onNavigateToCharacter={onNavigateToCharacter}
      onNavigateToCountry={onNavigateToCountry}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
      onSave={async (id, data) => {
        await updateCharacter(id, data)
      }}
    />
  )
}

function CharacterEditorInner({
  character,
  onBack,
  onSave,
  onNavigateToCharacter,
  onNavigateToCountry,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  character: Character
  onBack: () => void
  onSave: (id: number, data: Partial<CharacterFormData>) => Promise<void>
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
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
          id: c.id as number,
          name: c.name,
          subtitle: c.aliases.length > 0 ? c.aliases.join('、') : undefined,
        })),
    [allCharacters, character.id],
  )

  const relatedCharacterIds = useMemo(
    () =>
      relatedCharacters
        .filter((rc) => rc.characterId !== undefined)
        .map((rc) => rc.characterId as number),
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
        id: c.id as number,
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

  function parseAliases(str: string): string[] {
    return str
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const handleSave = useCallback(async () => {
    markSaving()
    setSaving(true)
    try {
      const document = docEditorRef.current?.getJSON()

      await onSave(character.id as number, {
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

  const infoRows: [string, string][] = [
    ['别名', aliasesStr],
    ['种族', race],
    ['元素', element],
    ['职业', occupation],
    ['身高', height],
    ['生日', birthday],
  ]

  // 名字下方的身份摘要（纯数据，不编辑器自身字段）
  const summaryLine = [
    occupation,
    countries.find((c) => c.id === countryId)?.name ?? nationalityLegacy,
  ]
    .filter(Boolean)
    .join(' · ')

  // 字段行统一样式见 @/lib/ui-tokens

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
          <h2 className={PAGE_TITLE}>编辑角色</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
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
              avatarUrl={avatarUrl}
              onHeaderChange={(path) => { setHeaderUrl(path); markDirty() }}
              onAvatarChange={(path) => { setAvatarUrl(path); markDirty() }}
              onHeaderRemove={() => { setHeaderUrl(''); markDirty() }}
              onAvatarRemove={() => { setAvatarUrl(''); markDirty() }}
            />
          </section>

          {/* ── 内容 ── */}
          <div className="mt-8">
            <div className="flex flex-col gap-8">
              {/* 身份区：名字 / 摘要（头像在头图上） */}
              <div className="flex min-w-0 flex-col gap-1">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); markDirty() }}
                  placeholder="角色名称"
                  className="w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
                />
                {summaryLine ? (
                  <p className="text-sm text-ink-muted">{summaryLine}</p>
                ) : null}
              </div>

              {/* Basic info */}
              <section>
                <h3 className={SECTION_TITLE}>基本信息</h3>
                <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                  {infoRows.map(([label]) => {
                    const value = label === '别名'
                      ? aliasesStr
                      : label === '种族'
                        ? race
                        : label === '元素'
                          ? element
                          : label === '职业'
                            ? occupation
                            : label === '身高'
                              ? height
                              : label === '生日'
                                ? birthday
                                : ''

                    const onChange = label === '别名'
                      ? (v: string) => setAliasesStr(v)
                      : label === '种族'
                        ? setRace
                        : label === '元素'
                          ? setElement
                          : label === '职业'
                            ? setOccupation
                            : label === '身高'
                              ? setHeight
                              : setBirthday

                    return (
                      <div key={label} className={FIELD_ROW}>
                        <span className={FIELD_LABEL}>{label}</span>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => { onChange(e.target.value); markDirty() }}
                          placeholder={INFO_PLACEHOLDER[label] ?? ''}
                          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                      </div>
                    )
                  })}

                  {/* Nationality */}
                  <div className={FIELD_ROW}>
                    <span className={FIELD_LABEL}>国籍</span>
                    <div className="min-w-0 flex-1">
                      {countries.length > 0 ? (
                        <RelatedItemsSelector
                          items={countryItems}
                          selectedIds={selectedCountryIds}
                          onChange={handleCountryChange}
                          placeholder="搜索国家..."
                          maxItems={1}
                          onNavigateItem={onNavigateToCountry}
                        />
                      ) : (
                        <input
                          type="text"
                          value={nationalityLegacy}
                          onChange={(e) => { setNationalityLegacy(e.target.value); markDirty() }}
                          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Major */}
                  <label className={`${FIELD_ROW} cursor-pointer`}>
                    <span className={FIELD_LABEL}>主要角色</span>
                    <Checkbox
                      checked={isMajor}
                      onCheckedChange={(checked) => { setIsMajor(checked === true); markDirty() }}
                    />
                  </label>

                  {/* Tags — 占满整行，避免长标签把网格挤歪 */}
                  <div className={`${FIELD_ROW_TOP} sm:col-span-2`}>
                    <span className={FIELD_LABEL}>标签</span>
                    <div className="min-w-0 flex-1">
                      <TagPicker selectedIds={tags} onChange={(ids) => { setTags(ids); markDirty() }} />
                    </div>
                  </div>
                </div>
              </section>

              <div className="border-t border-line" />

              {/* 立绘 */}
              <section>
                <h3 className={SECTION_TITLE}>立绘</h3>
                <ImageGallery
                  mode="grid"
                  gridAspect="portrait"
                  addTile
                  images={avatarUrls}
                  enableCrop
                  cropAspect={9 / 16}
                  onAdd={(path) => { setAvatarUrls((prev) => [...prev, path]); markDirty() }}
                  onRemove={(index) => { setAvatarUrls((prev) => prev.filter((_, i) => i !== index)); markDirty() }}
                />
              </section>

              <div className="border-t border-line" />

              {/* Bio + LifeStory (merged into one document) */}
              <section>
                <h3 className={SECTION_TITLE}>人物详情</h3>
                <DocumentEditor
                  entityId={character.id as number}
                  entityType="character"
                  fallbackContent={mergeBioLifeStory(character.bio, character.lifeStory)}
                  onReady={handleDocReady}
                  placeholder="编写角色简介..."
                  onMentionClick={onMentionClick}
                  onCharacterCount={onCharacterCount}
                  onWikiLinkClick={onWikiLinkClick}
                  onDocChange={markDirty}
                />
              </section>

              <div className="border-t border-line" />

              {/* 关系 */}
              <section>
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className={SECTION_TITLE_BARE}>关系</h3>
                  <RelatedItemsSelector
                    items={characterItems}
                    selectedIds={relatedCharacterIds}
                    onChange={handleRelatedCharactersChange}
                    placeholder="添加关联角色..."
                    onNavigateItem={onNavigateToCharacter}
                    hideSelected
                    panelAlign="right"
                  />
                </div>

                {relatedCharacters.length > 0 ? (
                  <table className="mt-4 w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={REL_TH}>对象</th>
                        <th className={REL_TH}>类型</th>
                        <th className={`${REL_TH} text-right`}>关系</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatedCharacters.map((rc, idx) => (
                        <tr key={rc.characterId ?? idx} className="border-t border-line">
                          <td className="py-2 pr-4 font-serif text-[13px] text-ink">
                            <button
                              type="button"
                              onClick={() => { if (rc.characterId != null) onNavigateToCharacter?.(rc.characterId) }}
                              className="transition-colors hover:text-ink-muted"
                            >
                              {rc.name}
                            </button>
                          </td>
                          <td className="py-2 pr-4 text-[13px] text-ink-muted">角色</td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-3">
                              <input
                                type="text"
                                value={rc.relation}
                                onChange={(e) => {
                                  const next = [...relatedCharacters]
                                  next[idx] = { ...next[idx], relation: e.target.value }
                                  setRelatedCharacters(next)
                                  markDirty()
                                }}
                                placeholder="关系"
                                className="w-32 bg-transparent text-right text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setRelatedCharacters(relatedCharacters.filter((_, i) => i !== idx))
                                  handleRelatedCharactersChange(relatedCharacterIds.filter((id) => id !== rc.characterId))
                                }}
                                className="text-ink-faint transition-colors hover:text-error"
                                title="移除"
                              >
                                <X size={12} strokeWidth={2} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </section>

              <div className="border-t border-line" />

              {/* Gallery */}
              <section>
                <h3 className={SECTION_TITLE}>相册</h3>
                <ImageGallery
                  mode="grid"
                  images={galleryUrls}
                  onAdd={(path) => { setGalleryUrls((prev) => [...prev, path]); markDirty() }}
                  onRemove={(index) => { setGalleryUrls((prev) => prev.filter((_, i) => i !== index)); markDirty() }}
                />
              </section>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

function mergeBioLifeStory(bio: string, lifeStory: string): string | undefined {
  if (!bio && !lifeStory) return undefined
  const parts: string[] = []
  if (bio) parts.push(bio)
  if (lifeStory) {
    parts.push('<h2>人物生平</h2>')
    parts.push(lifeStory)
  }
  return parts.join('\n')
}
