'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Save, ArrowLeft, Plus, X, Download, Film } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Character, CharacterCustomField, RelatedCharacter } from '@/types'
import type { CharacterFormData } from '../types'
import { useCharacter, useUpdateCharacter } from '../hooks/useCharacters'
import { useCharacterList } from '../hooks/useCharacters'
import { TagPicker } from '@/features/tags'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import type { RelatedItem } from '@/components/shared/RelatedItemsSelector'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { ImageGallery } from '@/components/shared/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { resolveImageUrl, saveBlobToDisk } from '@/lib/image-service'
import { downloadMedia } from '@/lib/download'
import { useCustomSections } from '@/features/custom-sections'
import { deleteRelation } from '@/features/relations/services'

interface CharacterEditorProps {
  editCharacterId: number
  onBack: () => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

const EXTRA_INFO_FIELDS = [
  { key: 'gender', label: '性别' },
  { key: 'orientation', label: '性取向' },
  { key: 'age', label: '年龄' },
  { key: 'weight', label: '体重' },
  { key: 'bloodType', label: '血型' },
  { key: 'hairColor', label: '发色' },
  { key: 'eyeColor', label: '瞳色' },
  { key: 'birthplace', label: '出生地' },
  { key: 'residence', label: '居住地' },
  { key: 'personality', label: '性格' },
  { key: 'hobbies', label: '爱好' },
  { key: 'skills', label: '擅长' },
  { key: 'affiliation', label: '阵营' },
  { key: 'weapon', label: '武器' },
  { key: 'pet', label: '宠物' },
  { key: 'ability', label: '能力' },
  { key: 'status', label: '状态' },
] as const

type ExtraInfoKey = (typeof EXTRA_INFO_FIELDS)[number]['key']

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

  if (loading && !character) {
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
  const kindLabel =
    character.entityKind === 'weapon' ? '武器' : character.entityKind === 'pet' ? '宠物' : '角色'
  const [name, setName] = useState(character.name)
  const [aliasesStr, setAliasesStr] = useState(safeAliasesJoin(character.aliases))
  const [race, setRace] = useState(character.race)
  const [element, setElement] = useState(character.element)
  const [occupation, setOccupation] = useState(character.occupation)
  const [nationalityLegacy, setNationalityLegacy] = useState(character.nationalityLegacy)
  const [countryId, setCountryId] = useState<number | undefined>(character.countryId)
  const [height, setHeight] = useState(character.height)
  const [birthday, setBirthday] = useState(character.birthday)
  const [extraInfo, setExtraInfo] = useState<Record<ExtraInfoKey, string>>({
    gender: character.gender ?? '',
    orientation: character.orientation ?? '',
    age: character.age ?? '',
    weight: character.weight ?? '',
    bloodType: character.bloodType ?? '',
    hairColor: character.hairColor ?? '',
    eyeColor: character.eyeColor ?? '',
    birthplace: character.birthplace ?? '',
    residence: character.residence ?? '',
    personality: character.personality ?? '',
    hobbies: character.hobbies ?? '',
    skills: character.skills ?? '',
    affiliation: character.affiliation ?? '',
    weapon: character.weapon ?? '',
    pet: character.pet ?? '',
    ability: character.ability ?? '',
    status: character.status ?? '',
  })
  const [hiddenFields, setHiddenFields] = useState<string[]>(character.hiddenFields ?? [])
  const [customFields, setCustomFields] = useState<CharacterCustomField[]>(
    character.customFields ?? [],
  )

  const [animationUrl, setAnimationUrl] = useState(character.animationUrl ?? '')
  const [animationType, setAnimationType] = useState<'video' | 'image'>(
    character.animationType ?? 'video',
  )
  const animationInputRef = useRef<HTMLInputElement | null>(null)

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
  const [relatedNations, setRelatedNations] = useState<number[]>(character.relatedNations ?? [])
  const [relatedNationLabels, setRelatedNationLabels] = useState<Record<number, string>>(
    character.relatedNationLabels ?? {},
  )
  const [relatedEvents, setRelatedEvents] = useState<number[]>(character.relatedEvents ?? [])
  const [relatedEventLabels, setRelatedEventLabels] = useState<Record<number, string>>(
    character.relatedEventLabels ?? {},
  )
  const [selectedCustomEntry, setSelectedCustomEntry] = useState('')
  const { sections: customSections, linkEntity, unlinkEntity, updateEntry } = useCustomSections()

  const relationSnapshot = useMemo(
    () =>
      JSON.stringify({
        characters: character.relatedCharacters ?? [],
        nations: character.relatedNations ?? [],
        nationLabels: character.relatedNationLabels ?? {},
        events: character.relatedEvents ?? [],
        eventLabels: character.relatedEventLabels ?? {},
      }),
    [
      character.relatedCharacters,
      character.relatedNations,
      character.relatedNationLabels,
      character.relatedEvents,
      character.relatedEventLabels,
    ],
  )
  const relationSnapshotRef = useRef(relationSnapshot)

  useEffect(() => {
    if (relationSnapshotRef.current === relationSnapshot) return
    relationSnapshotRef.current = relationSnapshot
    setRelatedCharacters(character.relatedCharacters ?? [])
    setRelatedNations(character.relatedNations ?? [])
    setRelatedNationLabels(character.relatedNationLabels ?? {})
    setRelatedEvents(character.relatedEvents ?? [])
    setRelatedEventLabels(character.relatedEventLabels ?? {})
  }, [
    relationSnapshot,
    character.relatedCharacters,
    character.relatedNations,
    character.relatedNationLabels,
    character.relatedEvents,
    character.relatedEventLabels,
  ])

  const [saving, setSaving] = useState(false)
  const docEditorRef = useRef<Editor | null>(null)
  const [docRevision, setDocRevision] = useState(0)
  const saveLockRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const saveRef = useRef<((silent?: boolean) => Promise<void>) | null>(null)
  const onSaveRef = useRef(onSave)
  const skipInitialAutosaveRef = useRef(true)

  const { characters: allCharacters } = useCharacterList()
  const { countries } = useCountryList()
  const { events: allEvents } = useEventList()

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
      Array.from(
        new Set(
          relatedCharacters
            .filter((rc) => rc.characterId !== undefined)
            .map((rc) => rc.characterId as number),
        ),
      ),
    [relatedCharacters],
  )

  const handleRelatedCharactersChange = useCallback(
    (ids: number[]) => {
      const next: RelatedCharacter[] = []
      for (const id of ids) {
        const existing = relatedCharacters.filter((rc) => rc.characterId === id)
        if (existing.length > 0) {
          next.push(...existing)
          continue
        }
        const c = allCharacters.find((ch) => ch.id === id)
        next.push({
          characterId: id,
          name: c ? c.name : '',
          relation: '',
        })
      }
      // 从选择器移除某个对象时，同时删除它的全部关系记录，避免同步逻辑又把关系补回来。
      for (const related of relatedCharacters) {
        if (related.characterId === undefined || ids.includes(related.characterId)) continue
        if (related.relationId) void deleteRelation(related.relationId)
      }
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

  const nationItems: RelatedItem[] = useMemo(
    () => countries.map((country) => ({ id: country.id as number, name: country.name })),
    [countries],
  )

  const eventItems: RelatedItem[] = useMemo(
    () =>
      allEvents.map((event) => ({
        id: event.id as number,
        name: event.title,
        subtitle: event.time,
      })),
    [allEvents],
  )

  const linkedCustomEntries = customSections.flatMap((section) =>
    section.entries
      .filter((entry) => entry.characterIds.includes(character.id as number))
      .map((entry) => ({ section, entry })),
  )
  const availableCustomEntries = customSections.flatMap((section) =>
    section.entries
      .filter((entry) => !entry.characterIds.includes(character.id as number))
      .map((entry) => ({ section, entry })),
  )

  const handleDocReady = useCallback((editor: Editor) => {
    docEditorRef.current = editor
    editor.on('update', () => setDocRevision((value) => value + 1))
  }, [])

  function parseAliases(str: string): string[] {
    return str
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const performSave = useCallback(async (silent = false) => {
    if (!name.trim()) return
    if (saveLockRef.current) {
      pendingSaveRef.current = true
      return
    }
    saveLockRef.current = true
    if (!silent) setSaving(true)
    try {
      const document = docEditorRef.current?.getJSON()

      await onSaveRef.current(character.id as number, {
        name,
        aliases: parseAliases(aliasesStr),
        race,
        element,
        occupation,
        nationalityLegacy,
        countryId,
        height,
        birthday,
        ...extraInfo,
        customFields,
        hiddenFields,
        animationUrl,
        animationType,
        avatarUrl,
        qAvatarUrl,
        headerUrl,
        bio: character.bio,
        lifeStory: character.lifeStory,
        document,
        relatedCharacters,
        relatedNations,
        relatedNationLabels,
        relatedEvents,
        relatedEventLabels,
        gallery: galleryUrls.map((url) => ({ url, caption: '' })),
        avatars: avatarUrls.map((url) => ({ url, type: 'portrait' as const })),
        tags,
      })
    } finally {
      saveLockRef.current = false
      if (!silent) setSaving(false)
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        window.setTimeout(() => {
          void saveRef.current?.(true)
        }, 120)
      }
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
    extraInfo,
    customFields,
    hiddenFields,
    animationUrl,
    animationType,
    relatedCharacters,
    relatedNations,
    relatedNationLabels,
    relatedEvents,
    relatedEventLabels,
    tags,
  ])

  useEffect(() => {
    saveRef.current = performSave
  }, [performSave])

  useEffect(() => {
    if (skipInitialAutosaveRef.current) {
      skipInitialAutosaveRef.current = false
      return
    }
    if (!name.trim()) return
    const timer = window.setTimeout(() => {
      void performSave(true)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [docRevision, name, performSave])

  const infoRows: Array<{
    key: string
    label: string
    value: string
    onChange: (value: string) => void
  }> = [
    { key: 'aliases', label: '别名', value: aliasesStr, onChange: setAliasesStr },
    { key: 'race', label: '种族', value: race, onChange: setRace },
    { key: 'element', label: '元素', value: element, onChange: setElement },
    { key: 'occupation', label: '职业', value: occupation, onChange: setOccupation },
    { key: 'height', label: '身高', value: height, onChange: setHeight },
    { key: 'birthday', label: '生日', value: birthday, onChange: setBirthday },
    ...EXTRA_INFO_FIELDS.map(({ key, label }) => ({
      key,
      label,
      value: extraInfo[key],
      onChange: (value: string) => setExtraInfo((current) => ({ ...current, [key]: value })),
    })),
  ]

  const fieldLabelOf = (key: string): string =>
    key === 'nationality'
      ? '国籍'
      : infoRows.find((row) => row.key === key)?.label ?? key

  const visibleInfoRows = infoRows.filter((row) => !hiddenFields.includes(row.key))

  const hideField = (key: string): void => {
    setHiddenFields((current) => (current.includes(key) ? current : [...current, key]))
  }

  const restoreField = (key: string): void => {
    setHiddenFields((current) => current.filter((item) => item !== key))
  }

  const handleAnimationUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const path = await saveBlobToDisk(file, 'animation')
      setAnimationUrl(path)
      setAnimationType(file.type.startsWith('video/') ? 'video' : 'image')
    } finally {
      if (animationInputRef.current) animationInputRef.current.value = ''
    }
  }

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
          <h2 className="text-lg text-ink">编辑{kindLabel}</h2>
        </div>
        <button
          onClick={() => void performSave()}
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
              accentColor={character.accentColor}
            />
          </section>

          {/* Name */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${kindLabel}名称`}
              className="w-full bg-transparent text-xl text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>

          {/* Basic info */}
          <section>
            <h3 className="mb-3 text-base text-ink">基本信息</h3>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="grid content-start gap-x-6 sm:grid-cols-2">
                {visibleInfoRows.map(({ key, label, value, onChange }) => (
                  <div
                    key={key}
                    className="group/field flex min-w-0 items-center gap-2 border-b border-line py-1.5"
                  >
                    <span className="w-[4.5rem] shrink-0 text-sm text-ink-muted">{label}</span>
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder={label}
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => hideField(key)}
                      title={`删除「${label}」字段`}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:text-error group-hover/field:opacity-100"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}

                {!hiddenFields.includes('nationality') ? (
                  <div className="group/field flex min-w-0 items-center gap-2 border-b border-line py-1.5">
                    <span className="w-[4.5rem] shrink-0 text-sm text-ink-muted">国籍</span>
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
                          onChange={(e) => setNationalityLegacy(e.target.value)}
                          placeholder="国籍"
                          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => hideField('nationality')}
                      title="删除「国籍」字段"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:text-error group-hover/field:opacity-100"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                ) : null}
              </div>

              {hiddenFields.length > 0 ? (
                <div className="col-span-full flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                  <span className="text-[10px] text-ink-faint">已隐藏字段：</span>
                  {hiddenFields.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => restoreField(key)}
                      title="点击恢复显示"
                      className="flex items-center gap-1 rounded border border-dashed border-line px-1.5 py-0.5 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                    >
                      {fieldLabelOf(key)}
                      <Plus size={10} strokeWidth={2} />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex gap-4 lg:flex-col">
                <div className="w-28 shrink-0">
                  <h4 className="mb-2 text-xs text-ink-muted">头像</h4>
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
                  {avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => void downloadMedia(avatarUrl, `${name}-头像`, 'avatar')}
                      className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-line px-1.5 py-1 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                    >
                      <Download size={11} strokeWidth={2} />
                      下载头像
                    </button>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 lg:max-w-[160px]">
                  <h4 className="mb-2 text-xs text-ink-muted">立绘</h4>
                  <div className="aspect-[9/16]">
                    <ImageGallery
                      mode="slider"
                      images={avatarUrls}
                      enableCrop
                      cropAspect={9 / 16}
                      onAdd={(path) => setAvatarUrls((prev) => [...prev, path])}
                      onRemove={(index) =>
                        setAvatarUrls((prev) => prev.filter((_, i) => i !== index))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Extra user-defined fields */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-4">
              <h3 className="text-base text-ink">附加信息</h3>
              <span className="text-[10px] text-ink-faint">自由补充任何设定</span>
            </div>
            {customFields.length > 0 ? (
              <div className="grid gap-x-6 sm:grid-cols-2">
                {customFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex min-w-0 items-center gap-1 border-b border-line py-1.5"
                  >
                    <input
                      value={field.label}
                      onChange={(event) =>
                        setCustomFields((current) =>
                          current.map((item) =>
                            item.id === field.id
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="字段名"
                      className="w-[4.5rem] shrink-0 bg-transparent text-sm text-ink-muted placeholder:text-ink-faint focus:outline-none"
                    />
                    <input
                      value={field.value}
                      onChange={(event) =>
                        setCustomFields((current) =>
                          current.map((item) =>
                            item.id === field.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="内容"
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        setCustomFields((current) =>
                          current.filter((item) => item.id !== field.id),
                        )
                      }
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:text-error"
                      title="删除字段"
                    >
                      <X size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <button
              onClick={() =>
                setCustomFields((current) => [
                  ...current,
                  {
                    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    label: '',
                    value: '',
                  },
                ])
              }
              className="mt-2 flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-muted hover:border-line-hover hover:text-ink"
            >
              <Plus size={12} strokeWidth={2} />
              添加额外的基本信息
            </button>
          </section>

          {/* OC animation */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-4">
              <h3 className="text-base text-ink">OC 动画</h3>
              <span className="text-[10px] text-ink-faint">支持 MP4 / WebM / GIF / WebP</span>
            </div>
            <input
              ref={animationInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,image/gif,image/webp,image/apng"
              className="hidden"
              onChange={(event) => void handleAnimationUpload(event)}
            />
            {animationUrl ? (
              <div className="relative w-full max-w-[440px] overflow-hidden rounded-lg border border-line bg-paper-card">
                {animationType === 'video' ? (
                  <video
                    src={resolveImageUrl(animationUrl, 'animation')}
                    controls
                    loop
                    playsInline
                    className="max-h-[360px] w-full bg-black/5 object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveImageUrl(animationUrl, 'animation')}
                    alt="OC 动画"
                    className="max-h-[360px] w-full object-contain"
                  />
                )}
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      void downloadMedia(animationUrl, `${name}-OC动画`, 'animation')
                    }
                    title="下载动画"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/85 hover:bg-black/60"
                  >
                    <Download size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => animationInputRef.current?.click()}
                    title="更换动画"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/85 hover:bg-black/60"
                  >
                    <Film size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnimationUrl('')}
                    title="删除动画"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/85 hover:bg-black/60"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => animationInputRef.current?.click()}
                className="flex h-24 w-full max-w-[440px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-ink-faint transition-colors hover:border-line-hover hover:text-ink"
              >
                <Film size={20} strokeWidth={1.5} />
                <span className="text-xs">上传 OC 动画</span>
                <span className="text-[10px]">本地保存，不会上传到网络</span>
              </button>
            )}
          </section>

          {/* Bio + LifeStory (merged into one document) */}
          <section>
            <h3 className="text-base text-ink mb-3">{kindLabel}详情</h3>
            <div className="character-detail border-t border-line pt-3">
              <DocumentEditor
                entityId={character.id as number}
                entityType="character"
                fallbackContent={mergeBioLifeStory(character.bio, character.lifeStory)}
                onReady={handleDocReady}
                placeholder="自定义内容，添加你的描述"
                onMentionClick={onMentionClick}
                onCharacterCount={onCharacterCount}
                onWikiLinkClick={onWikiLinkClick}
              />
            </div>
          </section>

          <div className="border-t border-line" />

          {/* Related Characters */}
          <section>
            <h3 className="text-base text-ink mb-3">
              {kindLabel === '角色' ? '相关人物' : '关联角色'}
            </h3>
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
                  <div
                    key={rc.relationId ?? `${rc.characterId ?? 'related'}-${idx}`}
                    className="flex items-center gap-2"
                  >
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
                        const removed = relatedCharacters[idx]
                        if (removed?.relationId) void deleteRelation(removed.relationId)
                        setRelatedCharacters((current) =>
                          current.filter((_, i) => i !== idx),
                        )
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

          <section>
            <h3 className="text-base text-ink mb-3">相关国家</h3>
            <RelatedItemsSelector
              items={nationItems}
              selectedIds={relatedNations}
              onChange={setRelatedNations}
              placeholder="搜索相关国家..."
              onNavigateItem={onNavigateToCountry}
            />
            {relatedNations.length > 0 ? (
              <div className="mt-3 space-y-2">
                {relatedNations.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-sm text-ink-muted">
                      {countries.find((country) => country.id === id)?.name ?? `国家 #${id}`}
                    </span>
                    <input
                      value={relatedNationLabels[id] ?? '属于'}
                      onChange={(event) =>
                        setRelatedNationLabels((current) => ({ ...current, [id]: event.target.value }))
                      }
                      placeholder="效忠、同盟..."
                      className="h-9 flex-1 rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className="border-t border-line" />

          <section>
            <h3 className="text-base text-ink mb-3">相关事件</h3>
            <RelatedItemsSelector
              items={eventItems}
              selectedIds={relatedEvents}
              onChange={setRelatedEvents}
              placeholder="搜索相关事件..."
            />
            {relatedEvents.length > 0 ? (
              <div className="mt-3 space-y-2">
                {relatedEvents.map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 truncate text-sm text-ink-muted">
                      {allEvents.find((event) => event.id === id)?.title ?? `事件 #${id}`}
                    </span>
                    <input
                      value={relatedEventLabels[id] ?? '参与'}
                      onChange={(event) =>
                        setRelatedEventLabels((current) => ({ ...current, [id]: event.target.value }))
                      }
                      placeholder="参与、见证..."
                      className="h-9 flex-1 rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {customSections.length > 0 ? (
            <section>
              <h3 className="text-base text-ink mb-3">相关自定义分类</h3>
              <div className="flex gap-2">
                <select
                  value={selectedCustomEntry}
                  onChange={(event) => setSelectedCustomEntry(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
                >
                  <option value="">选择分类下的条目，例如：信仰 · 大地与自然之神</option>
                  {customSections.map((section) => {
                    const options = availableCustomEntries.filter(
                      (item) => item.section.id === section.id,
                    )
                    if (options.length === 0) return null
                    return (
                      <optgroup key={section.id} label={section.name}>
                        {options.map(({ entry }) => (
                          <option key={entry.id} value={`${section.id}:${entry.id}`}>
                            {entry.name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
                <button
                  onClick={() => {
                    if (!selectedCustomEntry) return
                    const [sectionId, entryId] = selectedCustomEntry.split(':')
                    if (sectionId && entryId) {
                      linkEntity(sectionId, entryId, 'characterIds', character.id as number)
                    }
                    setSelectedCustomEntry('')
                  }}
                  disabled={!selectedCustomEntry}
                  className="h-9 rounded border border-line px-3 text-sm text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
                >
                  关联
                </button>
              </div>
              {linkedCustomEntries.length > 0 ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {linkedCustomEntries.map(({ section, entry }) => (
                      <span
                        key={`chip-${entry.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-line bg-paper-card px-2 py-1 text-xs text-ink"
                      >
                        <span className="text-ink-faint">{section.name} · </span>
                        {entry.name}
                        <button
                          onClick={() =>
                            unlinkEntity(
                              section.id,
                              entry.id,
                              'characterIds',
                              character.id as number,
                            )
                          }
                          className="text-ink-faint hover:text-error"
                          title="取消关联"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 space-y-0.5">
                    {linkedCustomEntries.map(({ section, entry }) => {
                      const meta = entry.characterLinks?.[String(character.id)] ?? {}
                      return (
                        <div
                          key={`relation-${entry.id}`}
                          className="flex items-center gap-2 border-b border-line py-1.5"
                        >
                          <span className="w-28 shrink-0 truncate text-sm text-ink-muted md:w-32">
                            {entry.name}
                          </span>
                          <input
                            value={meta.relation ?? ''}
                            onChange={(event) =>
                              updateEntry(section.id, entry.id, {
                                characterLinks: {
                                  ...(entry.characterLinks ?? {}),
                                  [String(character.id)]: {
                                    ...meta,
                                    relation: event.target.value,
                                  },
                                },
                              })
                            }
                            placeholder="关系，例如：信仰"
                            className="h-8 min-w-0 flex-1 rounded border border-line bg-paper-card px-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-line-hover"
                          />
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

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
