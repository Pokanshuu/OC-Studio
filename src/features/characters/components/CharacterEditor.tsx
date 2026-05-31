'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
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
import { ImageUploader } from '@/components/shared/ImageUploader'
import { ImageGallery } from '@/components/shared/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'

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

export function CharacterEditor({ editCharacterId, onBack, onNavigateToCharacter, onNavigateToCountry, onMentionClick, onCharacterCount, onWikiLinkClick }: CharacterEditorProps) {
  const { character, loading, error, refresh } = useCharacter(editCharacterId)
  const { updateCharacter } = useUpdateCharacter()

  useEffect(() => {
    refresh()
  }, [editCharacterId, refresh])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-ink-muted">加载中...</span>
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
  const [qAvatarUrl, setQAvatarUrl] = useState(character.qAvatarUrl ?? '')
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

  const [saving, setSaving] = useState(false)
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
      setQAvatarUrl(character.qAvatarUrl ?? '')
      setHeaderUrl(character.headerUrl ?? '')
      setAvatarUrls(
        (Array.isArray(character.avatars) ? character.avatars : []).map((a) => (typeof a === 'string' ? a : a.url)),
      )
      setGalleryUrls(
        (Array.isArray(character.gallery) ? character.gallery : []).map((g) => (typeof g === 'string' ? g : g.url)),
      )
      setRelatedCharacters(character.relatedCharacters)
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
        qAvatarUrl,
        headerUrl,
        bio: character.bio,
        lifeStory: character.lifeStory,
        document,
        relatedCharacters,
        gallery: galleryUrls.map((url) => ({ url, caption: '' })),
        avatars: avatarUrls.map((url) => ({ url, type: 'portrait' as const })),
        tags,
      })
    } finally {
      setSaving(false)
    }
  }, [
    character.id,
    character.bio,
    character.lifeStory,
    avatarUrl,
    qAvatarUrl,
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
    onSave,
  ])

  const infoRows: [string, string][] = [
    ['别名', aliasesStr],
    ['种族', race],
    ['元素', element],
    ['职业', occupation],
    ['身高', height],
    ['生日', birthday],
  ]

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between max-md:fixed max-md:top-0 max-md:left-0 max-md:right-0 md:sticky md:top-0 z-10 border-b border-line px-4 max-md:h-[calc(60px+var(--safe-top))] md:h-[60px] max-md:pt-[var(--safe-top)] bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            data-mobile-back
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink active:bg-black/8 dark:active:bg-white/8"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <h2 className="text-lg text-ink">编辑角色</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          data-save-button
          className="touch-feedback flex h-9 items-center gap-1.5 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
        >
          <Save size={16} strokeWidth={2} />
          <span>{saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]">
        <div className="mx-auto w-full px-4 py-3 md:py-6 space-y-5 md:space-y-8 md:max-w-3xl md:px-8">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={headerUrl}
              avatarUrl={qAvatarUrl}
              onHeaderChange={setHeaderUrl}
              onAvatarChange={(path) => setQAvatarUrl(path)}
              onHeaderRemove={() => setHeaderUrl('')}
              onAvatarRemove={() => setQAvatarUrl('')}
            />
          </section>

          {/* Name */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="角色名称"
              className="w-full bg-transparent text-xl text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          {/* Basic info */}
          <section>
            <h3 className="text-base text-ink mb-3">基本信息</h3>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Info table */}
              <div className="flex-1 max-w-full md:max-w-[300px]">
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
                    <div key={label} className="flex items-center border-b border-line py-1.5">
                      <span className="w-20 md:w-24 inline-block shrink-0 text-sm text-ink-muted">{label}</span>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={label}
                        className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                      />
                    </div>
                  )
                })}

                {/* Nationality */}
                <div className="flex items-center border-b border-line py-1.5">
                   <span className="w-24 inline-block shrink-0 text-sm text-ink-muted">国籍</span>
                  <div className="flex-1">
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
                        onChange={(e) => setNationalityLegacy(e.target.value)}
                        placeholder="国籍"
                        className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* 头像 */}
              <div className="shrink-0 w-32">
                <h4 className="text-xs text-ink-muted mb-2">头像</h4>
                <ImageUploader
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                  onRemove={() => setAvatarUrl('')}
                  aspectRatio="1:1"
                  size="md"
                  enableCrop
                  cropAspect={1}
                  shape="rect"
                  placeholderText="上传头像"
                />
              </div>

              {/* 立绘 (portrait) */}
              <div className="flex-1 max-w-full md:max-w-[200px] md:ml-auto">
                <h4 className="text-xs text-ink-muted mb-2">立绘</h4>
                <div className="aspect-[9/16]">
                  <ImageGallery
                    mode="slider"
                    images={avatarUrls}
                    enableCrop
                    cropAspect={9 / 16}
                    onAdd={(path) => setAvatarUrls((prev) => [...prev, path])}
                    onRemove={(index) => setAvatarUrls((prev) => prev.filter((_, i) => i !== index))}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-line" />

          {/* Bio + LifeStory (merged into one document) */}
          <section>
            <h3 className="text-base text-ink mb-3">人物详情</h3>
            <DocumentEditor
              entityId={character.id as number}
              entityType="character"
              fallbackContent={mergeBioLifeStory(character.bio, character.lifeStory)}
              onReady={handleDocReady}
              placeholder="编写角色简介..."
              onMentionClick={onMentionClick}
              onCharacterCount={onCharacterCount}
              onWikiLinkClick={onWikiLinkClick}
            />
          </section>

          <div className="border-t border-line" />

          {/* Related Characters */}
          <section>
            <h3 className="text-base text-ink mb-3">相关人物</h3>
            <RelatedItemsSelector
              items={characterItems}
              selectedIds={relatedCharacterIds}
              onChange={handleRelatedCharactersChange}
              placeholder="搜索关联角色..."
              onNavigateItem={onNavigateToCharacter}
            />

            {relatedCharacters.length > 0 ? (
              <div className="mt-3 space-y-2">
                {relatedCharacters.map((rc, idx) => (
                  <div key={rc.characterId ?? idx} className="flex items-center gap-2">
                    <span className="text-sm text-ink-muted w-20 shrink-0 truncate">{rc.name}</span>
                    <span className="text-sm text-ink-muted shrink-0">关系：</span>
                    <input
                      type="text"
                      value={rc.relation}
                      onChange={(e) => {
                        const next = [...relatedCharacters]
                        next[idx] = { ...next[idx], relation: e.target.value }
                        setRelatedCharacters(next)
                      }}
                      placeholder="挚友、师徒..."
                      className="flex-1 h-9 rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setRelatedCharacters(relatedCharacters.filter((_, i) => i !== idx))
                        handleRelatedCharactersChange(relatedCharacterIds.filter((id) => id !== rc.characterId))
                      }}
                      className="text-ink-faint hover:text-error text-sm px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className="border-t border-line" />

          {/* Tags */}
          <section>
            <h3 className="text-base text-ink mb-3">标签</h3>
            <TagPicker selectedIds={tags} onChange={setTags} />
          </section>

          <div className="border-t border-line" />

          {/* Gallery */}
          <section>
            <h3 className="text-base text-ink mb-3">相册</h3>
            <ImageGallery
              mode="grid"
              images={galleryUrls}
              onAdd={(path) => setGalleryUrls((prev) => [...prev, path])}
              onRemove={(index) => setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
            />
          </section>
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
