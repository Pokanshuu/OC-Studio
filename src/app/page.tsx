'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useNavigationSource } from '@/components/layout/NavigationSourceContext'
import { useEditor } from '@/components/layout/EditorContext'
import { useDevice } from '@/lib/use-device'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'
import { useWordCount } from '@/components/layout/WordCountContext'
import { toast } from 'sonner'
import { db } from '@/lib/db'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { CustomSectionView } from '@/features/custom-sections'
import { EventList } from '@/features/events/components/EventList'
import { EventEditor } from '@/features/events/components/EventEditor'
import { useEventList, useEvent, useCreateEvent, useUpdateEvent, useDeleteEvent } from '@/features/events/hooks/useEvents'
import { CharacterList } from '@/features/characters/components/CharacterList'
import { CharacterEditor } from '@/features/characters/components/CharacterEditor'
import { useCharacterList, useCreateCharacter, useDeleteCharacter } from '@/features/characters/hooks/useCharacters'
import { CountryList } from '@/features/countries/components/CountryList'
import { CountryEditor } from '@/features/countries/components/CountryEditor'
import { useCreateCountry, useDeleteCountry } from '@/features/countries/hooks/useCountries'
import { WorldLayout } from '@/features/world/components/WorldLayout'
import { TimelineView } from '@/features/timeline/components/TimelineView'
import { NovelView } from '@/features/novel/NovelView'
import { GlobalAlbum } from '@/components/shared/GlobalAlbum'
const RelationGraph = dynamic(
  () => import('@/features/relations').then((mod) => ({ default: mod.RelationGraph })),
  { ssr: false },
)
const MapView = dynamic(
  () => import('@/features/map').then((mod) => ({ default: mod.MapView })),
  { ssr: false },
)
const MapManager = dynamic(
  () => import('@/features/map').then((mod) => ({ default: mod.MapManager })),
  { ssr: false },
)
import { TreeTableView } from '@/features/tree-table'
import { purgeExpiredTrash, TRASH_RETENTION_KEY } from '@/features/trash/services'
import type { EventFormData } from '@/features/events/types'
import type { CharacterKind } from '@/types'

type EventView = { sub: 'list' } | { sub: 'editor'; eventId: number }
type CharacterView = { sub: 'list' } | { sub: 'editor'; characterId: number }
type CountryView = { sub: 'list' } | { sub: 'editor'; countryId: number }

const PLACEHOLDER_MAP: Record<string, string> = {}

type ReferenceType = 'character' | 'event' | 'country' | 'world'

async function resolveReference(
  id: number,
  type?: string,
): Promise<ReferenceType | null> {
  const exists = async (kind: ReferenceType): Promise<boolean> => {
    if (kind === 'character') {
      const row = await db.characters.get(id)
      return Boolean(row && !row.deleted)
    }
    if (kind === 'event') {
      const row = await db.events.get(id)
      return Boolean(row && !row.deleted)
    }
    if (kind === 'country') {
      const row = await db.countries.get(id)
      return Boolean(row && !row.deleted)
    }
    const row = await db.worldEntries.get(id)
    return Boolean(row && !row.deleted)
  }

  if (type === 'character' || type === 'event' || type === 'country' || type === 'world') {
    return (await exists(type)) ? type : null
  }

  for (const kind of ['character', 'event', 'country', 'world'] as const) {
    if (await exists(kind)) return kind
  }
  return null
}

export default function Home() {
  const { activeItem: desktopActiveItem, setActiveItem } = useNavigation()
  const { source, setSource, clearSource } = useNavigationSource()
  const { setEditing, clearEditing } = useEditor()
  const { isMobile } = useDevice()
  const mobileNav = useMobileNavigation()
  const activeItem = isMobile
    ? (mobileNav.section === 'gallery'
        ? ({ characters: '角色', events: '事件', countries: '国家' } as const)[mobileNav.gallerySubTab]
        : mobileNav.section === 'wiki' ? '世界观'
        : mobileNav.section === 'timeline' ? '时间线'
        : mobileNav.section === 'relations' ? '关系图'
        : mobileNav.section === 'album' ? '相册'
        : desktopActiveItem)
    : desktopActiveItem
  const characterKind: CharacterKind =
    activeItem === '武器' ? 'weapon' : activeItem === '宠物' ? 'pet' : 'character'
  const [mapEditorOpen, setMapEditorOpen] = useState(false)

  useEffect(() => {
    const runPurge = () => {
      const raw = Number(window.localStorage.getItem(TRASH_RETENTION_KEY))
      const days = Number.isFinite(raw) && raw >= 0 ? raw : 3
      if (days > 0) void purgeExpiredTrash(days)
    }
    runPurge()
    const timer = window.setInterval(runPurge, 6 * 60 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const [eventView, setEventView] = useState<EventView>({ sub: 'list' })
  const [characterView, setCharacterView] = useState<CharacterView>({ sub: 'list' })
  const [countryView, setCountryView] = useState<CountryView>({ sub: 'list' })
  const [worldSelectedEntryId, setWorldSelectedEntryId] = useState<number | null>(null)

  // Slide animation tracking for editor↔list transitions
  const prevEventSub = useRef(eventView.sub)
  const prevCharSub = useRef(characterView.sub)
  const prevCountrySub = useRef(countryView.sub)
  type SlideAnim = 'to-editor' | 'to-list' | null
  const [eventSlide, setEventSlide] = useState<SlideAnim>(null)
  const [charSlide, setCharSlide] = useState<SlideAnim>(null)
  const [countrySlide, setCountrySlide] = useState<SlideAnim>(null)

  useEffect(() => {
    const prev = prevEventSub.current
    const curr = eventView.sub
    if (prev !== curr) {
      setEventSlide(curr === 'editor' ? 'to-editor' : 'to-list')
      const t = setTimeout(() => setEventSlide(null), 150)
      prevEventSub.current = curr
      return () => clearTimeout(t)
    }
  }, [eventView.sub])

  useEffect(() => {
    const prev = prevCharSub.current
    const curr = characterView.sub
    if (prev !== curr) {
      setCharSlide(curr === 'editor' ? 'to-editor' : 'to-list')
      const t = setTimeout(() => setCharSlide(null), 150)
      prevCharSub.current = curr
      return () => clearTimeout(t)
    }
  }, [characterView.sub])

  useEffect(() => {
    const prev = prevCountrySub.current
    const curr = countryView.sub
    if (prev !== curr) {
      setCountrySlide(curr === 'editor' ? 'to-editor' : 'to-list')
      const t = setTimeout(() => setCountrySlide(null), 150)
      prevCountrySub.current = curr
      return () => clearTimeout(t)
    }
  }, [countryView.sub])

  const {
    events,
    loading: eventsLoading,
    error: eventsError,
    refresh,
  } = useEventList()

  const currentEventId = useMemo(
    () => (eventView.sub === 'editor' ? eventView.eventId : null),
    [eventView],
  )

  const { event: selectedEvent, refresh: refreshEvent } = useEvent(currentEventId)
  const { createEvent, creating } = useCreateEvent()
  const { updateEvent, updating } = useUpdateEvent()
  const { deleteEvent, deleting } = useDeleteEvent()

  const {
    characters,
    loading: charactersLoading,
    error: charactersError,
    refresh: refreshCharacters,
  } = useCharacterList()

  const { createCharacter, creating: creatingChar } = useCreateCharacter()
  const { deleteCharacter, deleting: deletingChar } = useDeleteCharacter()

  // 在“角色 / 武器 / 宠物”之间切换时，回到对应列表，避免停留在上一类的编辑页。
  useEffect(() => {
    if (characterView.sub !== 'editor') return
    const current = characters.find((item) => item.id === characterView.characterId)
    if (!current) return
    if ((current.entityKind ?? 'character') !== characterKind) {
      setCharacterView({ sub: 'list' })
    }
  }, [characterKind, characterView, characters])

  const { createCountry, creating: creatingCountry } = useCreateCountry()
  const { deleteCountry, deleting: deletingCountry } = useDeleteCountry()

  const handleSelectEvent = useCallback((id: number) => {
    setSource('eventList')
    setEventView({ sub: 'editor', eventId: id })
    setEditing('event', id)
  }, [setSource, setEditing])

  const handleCreateEvent = useCallback(() => {
    if (creating) return
    createEvent({
      title: '新事件',
      time: '',
      location: '',
      summary: '',
      isMajor: false,
      content: '',
      tags: [],
    }).then((id) => {
      setEventView({ sub: 'editor', eventId: id })
      setEditing('event', id)
      refresh()
    }).catch(() => {
      // error handled via hook
    })
  }, [createEvent, creating, refresh, setEditing])

  const handleSaveEvent = useCallback(
    async (id: number, data: Partial<EventFormData>) => {
      if (updating) return
      await updateEvent(id, data)
      refresh()
      refreshEvent()
    },
    [updateEvent, updating, refresh, refreshEvent],
  )

  const handleDeleteEvent = useCallback(
    (id: number) => {
      if (deleting) return
      deleteEvent(id).then(() => {
        refresh()
      }).catch(() => {
        // error handled via hook
      })
    },
    [deleteEvent, deleting, refresh],
  )

  const mobileSetSection = mobileNav.setSection
  const mobileSetGallerySubTab = mobileNav.setGallerySubTab

  const crossBackRef = useRef<{
    activeItem: string | null
    eventView: EventView
    characterView: CharacterView
    countryView: CountryView
    source: ReturnType<typeof useNavigationSource>['source']
    mobileSection?: import('@/components/layout/MobileNavigationContext').MobileSection
    mobileGallerySubTab?: import('@/components/layout/MobileNavigationContext').GallerySubTab
  } | null>(null)

  const restoreCrossBack = useCallback(() => {
    const saved = crossBackRef.current
    if (!saved) return false
    crossBackRef.current = null
    setEventView(saved.eventView)
    setCharacterView(saved.characterView)
    setCountryView(saved.countryView)
    if (saved.activeItem) {
      setActiveItem(saved.activeItem)
    }
    if (saved.source) {
      setSource(saved.source)
    } else {
      clearSource()
    }
    if (saved.mobileSection) {
      mobileSetSection(saved.mobileSection)
    }
    if (saved.mobileGallerySubTab) {
      mobileSetGallerySubTab(saved.mobileGallerySubTab)
    }
    const restoredView = saved.eventView.sub === 'editor' || saved.characterView.sub === 'editor' || saved.countryView.sub === 'editor'
    if (restoredView) {
      if (saved.eventView.sub === 'editor') setEditing('event', saved.eventView.eventId)
      else if (saved.characterView.sub === 'editor') setEditing('character', saved.characterView.characterId)
      else if (saved.countryView.sub === 'editor') setEditing('country', saved.countryView.countryId)
    }
    return true
  }, [setActiveItem, setSource, clearSource, mobileSetSection, mobileSetGallerySubTab, setEditing])

  const handleBackToList = useCallback(() => {
    const el = document.activeElement as HTMLElement | null
    el?.blur()
    // 延迟导航，让 blur 和键盘收起动画先完成，避免 editor display:none 与 TipTap blur 清理冲突
    const doNav = () => {
      clearEditing()
      if (restoreCrossBack()) return
      if (source === 'timeline') {
        setEventView({ sub: 'list' })
        setActiveItem('时间线')
        if (isMobile) {
          mobileSetSection('timeline')
        }
      } else {
        setEventView({ sub: 'list' })
      }
      clearSource()
    }
    // 使用 setTimeout 而非 rAF：键盘收起是异步动画，rAF 太早
    setTimeout(doNav, 50)
  }, [source, setActiveItem, clearSource, restoreCrossBack, clearEditing, isMobile, mobileSetSection])

  const handleSelectCharacter = useCallback((id: number) => {
    setSource('characterList')
    setCharacterView({ sub: 'editor', characterId: id })
    setEditing('character', id)
  }, [setSource, setEditing])

  const handleCreateCharacter = useCallback((folderId?: string | null) => {
    if (creatingChar) return
    const kindLabel =
      characterKind === 'weapon' ? '武器' : characterKind === 'pet' ? '宠物' : '角色'
    createCharacter({
      name: `新${kindLabel}`,
      entityKind: characterKind,
      folderId: folderId ?? null,
      aliases: [],
      race: '',
      element: '',
      occupation: '',
      nationalityLegacy: '',
      height: '',
      birthday: '',
      avatarUrl: '',
      bio: '',
      lifeStory: '',
      relatedCharacters: [],
      gallery: [],
      avatars: [],
      tags: [],
    }).then((id) => {
      setCharacterView({ sub: 'editor', characterId: id })
      setEditing('character', id)
      refreshCharacters()
    }).catch(() => {
      // error handled via hook
    })
  }, [createCharacter, creatingChar, refreshCharacters, setEditing, characterKind])

  const handleBackToCharacterList = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur()
    clearEditing()
    if (restoreCrossBack()) return
    setCharacterView({ sub: 'list' })
    refreshCharacters()
    clearSource()
  }, [refreshCharacters, clearSource, restoreCrossBack, clearEditing])

  const handleDeleteCharacter = useCallback(
    (id: number) => {
      if (deletingChar) return
      deleteCharacter(id).then(() => {
        refreshCharacters()
      }).catch(() => {
        // error handled via hook
      })
    },
    [deleteCharacter, deletingChar, refreshCharacters],
  )

  const handleCreateCountry = useCallback(() => {
    if (creatingCountry) return
    createCountry({
      name: '新国家',
      parentId: null,
      description: '',
      system: '',
      geography: '',
      culture: '',
      tags: [],
    }).then((id) => {
      setCountryView({ sub: 'editor', countryId: id })
      setEditing('country', id)
    }).catch(() => {
      // error handled via hook
    })
  }, [createCountry, creatingCountry, setEditing])

  const handleDeleteCountry = useCallback(
    (id: number) => {
      if (deletingCountry) return
      deleteCountry(id).catch(() => {
        // error handled via hook
      })
    },
    [deleteCountry, deletingCountry],
  )

  const handleSelectCountry = useCallback((id: number) => {
    setSource('countryList')
    setCountryView({ sub: 'editor', countryId: id })
    setEditing('country', id)
  }, [setSource, setEditing])

  const handleBackToCountryList = useCallback(() => {
    (document.activeElement as HTMLElement | null)?.blur()
    clearEditing()
    if (restoreCrossBack()) return
    setCountryView({ sub: 'list' })
    clearSource()
  }, [clearSource, restoreCrossBack, clearEditing])

  const handleTimelineSelectEvent = useCallback(
    (id: number) => {
      setSource('timeline')
      setEventView({ sub: 'editor', eventId: id })
      setActiveItem('事件')
      if (isMobile) {
        mobileSetSection('gallery')
        mobileSetGallerySubTab('events')
      }
      setEditing('event', id)
    },
    [setSource, setActiveItem, setEditing, isMobile, mobileSetSection, mobileSetGallerySubTab],
  )

  const handleRelatedItemNavigate = useCallback((id: number, type?: string) => {
    if (
      eventView.sub === 'editor' ||
      characterView.sub === 'editor' ||
      countryView.sub === 'editor' ||
      activeItem === '关系图' ||
      activeItem === '相册' ||
      activeItem === '世界观'
    ) {
      crossBackRef.current = {
        activeItem,
        eventView,
        characterView,
        countryView,
        source,
        mobileSection: mobileNav.section,
        mobileGallerySubTab: mobileNav.gallerySubTab,
      }
    }

    if (type === 'character') {
      const target = characters.find((item) => item.id === id)
      const targetKind = target?.entityKind ?? 'character'
      setCharacterView({ sub: 'editor', characterId: id })
      setActiveItem(
        targetKind === 'weapon' ? '武器' : targetKind === 'pet' ? '宠物' : '角色',
      )
      if (isMobile) {
        mobileSetSection('gallery')
        mobileSetGallerySubTab('characters')
      }
      setEditing('character', id)
      clearSource()
    } else if (type === 'event') {
      setEventView({ sub: 'editor', eventId: id })
      setActiveItem('事件')
      if (isMobile) {
        mobileSetSection('gallery')
        mobileSetGallerySubTab('events')
      }
      setEditing('event', id)
      clearSource()
    } else if (type === 'country') {
      setCountryView({ sub: 'editor', countryId: id })
      setActiveItem('国家')
      if (isMobile) {
        mobileSetSection('gallery')
        mobileSetGallerySubTab('countries')
      }
      setEditing('country', id)
      clearSource()
    } else if (type === 'world') {
      setWorldSelectedEntryId(id)
      setActiveItem('世界观')
      if (isMobile) {
        mobileSetSection('wiki')
      }
      clearSource()
    }
  }, [eventView, characterView, countryView, activeItem, source, setActiveItem, clearSource, setEditing, isMobile, mobileNav.section, mobileNav.gallerySubTab, mobileSetSection, mobileSetGallerySubTab, characters])

  const handleMentionClick = useCallback(async (id: string, entityType?: string) => {
    const numId = Number(id)
    if (Number.isNaN(numId)) return
    const resolved = await resolveReference(numId, entityType)
    if (!resolved) {
      toast.error('这条引用已失效：原内容可能已被删除')
      return
    }
    handleRelatedItemNavigate(numId, resolved)
  }, [handleRelatedItemNavigate])

  const handleWikiLinkClick = useCallback(async (id: string) => {
    const numId = Number(id)
    if (Number.isNaN(numId)) return
    const resolved = await resolveReference(numId, 'world')
    if (!resolved) {
      toast.error('这个内链已失效：原词条可能已被删除')
      return
    }
    handleRelatedItemNavigate(numId, resolved)
  }, [handleRelatedItemNavigate])

  const showEvents = activeItem === '事件'
  const showCharacters =
    activeItem === '角色' || activeItem === '武器' || activeItem === '宠物'
  const showCountries = activeItem === '国家'
  const showWorld = activeItem === '世界观'
  const showNovel = activeItem === '小说'
  const showTreeTable = activeItem === '树表'
  const showMapGenerator = activeItem === '地图生成器'
  const showMapManager = activeItem === '地图'
  const showTimeline = activeItem === '时间线'
  const showRelations = activeItem === '关系图'
  const showAlbum = activeItem === '相册'
  const customSectionId = activeItem?.startsWith('custom:') ? activeItem.slice(7) : null
  const showCustomSection = customSectionId !== null
  const showPlaceholder = activeItem !== null && !showEvents && !showCharacters && !showCountries && !showWorld && !showNovel && !showTreeTable && !showMapGenerator && !showMapManager && !showTimeline && !showRelations && !showAlbum && !showCustomSection
  const placeholderText = activeItem !== null
    ? (PLACEHOLDER_MAP[activeItem] ?? '功能开发中...')
    : null

  const { setWordCount, setWordCountLabel } = useWordCount()

  const eventCountRef = useRef(0)
  const characterCountRef = useRef(0)
  const countryCountRef = useRef(0)
  const worldCountRef = useRef(0)

  const handleEventCharCount = useCallback((count: number) => {
    eventCountRef.current = count
    setWordCount(count)
  }, [setWordCount])

  const handleCharacterCharCount = useCallback((count: number) => {
    characterCountRef.current = count
    setWordCount(count)
  }, [setWordCount])

  const handleCountryCharCount = useCallback((count: number) => {
    countryCountRef.current = count
    setWordCount(count)
  }, [setWordCount])

  const handleWorldCharCount = useCallback((count: number) => {
    worldCountRef.current = count
    setWordCount(count)
  }, [setWordCount])

  useEffect(() => {
    if (showEvents && eventView.sub === 'editor') {
      setWordCountLabel('事件正文字数')
      setWordCount(eventCountRef.current)
    } else if (showCharacters && characterView.sub === 'editor') {
      setWordCountLabel('角色正文字数')
      setWordCount(characterCountRef.current)
    } else if (showCountries && countryView.sub === 'editor') {
      setWordCountLabel('国家正文字数')
      setWordCount(countryCountRef.current)
    } else if (showWorld) {
      setWordCountLabel('词条字数')
      setWordCount(worldCountRef.current)
    } else if (!showNovel) {
      setWordCountLabel('字数')
      setWordCount(0)
    }
  }, [showEvents, showCharacters, showCountries, showWorld, showNovel, eventView, characterView, countryView, setWordCount, setWordCountLabel])

  const { setNavigateHandler } = useEntityNavigate()

  useEffect(() => {
    setNavigateHandler((id: number, type: string) => {
      handleRelatedItemNavigate(id, type)
    })
  }, [setNavigateHandler, handleRelatedItemNavigate])

  return (
    <div className="section-stack">
      <div
        className="h-full section-fade overflow-y-auto max-md:pb-[var(--safe-bottom)]"
        data-visible={(showEvents && eventView.sub === 'editor') ? "true" : "false"}
        data-animate={eventSlide === 'to-editor' ? 'slide-in-right' : eventSlide === 'to-list' ? 'slide-out-right' : undefined}
      >
        {selectedEvent ? (
          <EventEditor
            event={selectedEvent}
            onBack={handleBackToList}
            onSave={handleSaveEvent}
            onMentionClick={handleMentionClick}
            onNavigateItem={(id, type) => handleRelatedItemNavigate(id, type)}
            onCharacterCount={handleEventCharCount}
            onWikiLinkClick={handleWikiLinkClick}
          />
        ) : null}
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={(showEvents && eventView.sub === 'list') ? "true" : "false"}
        data-animate={eventSlide === 'to-editor' ? 'slide-out-left' : eventSlide === 'to-list' ? 'slide-in-left' : undefined}
      >
        <EventList
          events={events}
          loading={eventsLoading}
          error={eventsError}
          onSelectEvent={handleSelectEvent}
          onCreateEvent={handleCreateEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pb-[var(--safe-bottom)]"
        data-visible={(showCharacters && characterView.sub === 'editor') ? "true" : "false"}
        data-animate={charSlide === 'to-editor' ? 'slide-in-right' : charSlide === 'to-list' ? 'slide-out-right' : undefined}
      >
        {characterView.sub === 'editor' ? (
          <CharacterEditor
            editCharacterId={characterView.characterId}
            onBack={handleBackToCharacterList}
            onNavigateToCharacter={(id) => handleRelatedItemNavigate(id, 'character')}
            onNavigateToCountry={(id) => handleRelatedItemNavigate(id, 'country')}
            onMentionClick={handleMentionClick}
            onCharacterCount={handleCharacterCharCount}
            onWikiLinkClick={handleWikiLinkClick}
          />
        ) : null}
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={(showCharacters && characterView.sub === 'list') ? "true" : "false"}
        data-animate={charSlide === 'to-editor' ? 'slide-out-left' : charSlide === 'to-list' ? 'slide-in-left' : undefined}
      >
        <CharacterList
          characters={characters}
          kind={characterKind}
          loading={charactersLoading}
          error={charactersError}
          onSelectCharacter={handleSelectCharacter}
          onCreateCharacter={handleCreateCharacter}
          onDeleteCharacter={handleDeleteCharacter}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pb-[var(--safe-bottom)]"
        data-visible={(showCountries && countryView.sub === 'editor') ? "true" : "false"}
        data-animate={countrySlide === 'to-editor' ? 'slide-in-right' : countrySlide === 'to-list' ? 'slide-out-right' : undefined}
      >
        {countryView.sub === 'editor' ? (
          <CountryEditor
            editCountryId={countryView.countryId}
            onBack={handleBackToCountryList}
            onNavigateToCharacter={(id) => handleRelatedItemNavigate(id, 'character')}
            onNavigateToEvent={(id) => handleRelatedItemNavigate(id, 'event')}
            onMentionClick={handleMentionClick}
            onCharacterCount={handleCountryCharCount}
            onWikiLinkClick={handleWikiLinkClick}
          />
        ) : null}
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={(showCountries && countryView.sub === 'list') ? "true" : "false"}
        data-animate={countrySlide === 'to-editor' ? 'slide-out-left' : countrySlide === 'to-list' ? 'slide-in-left' : undefined}
      >
        <CountryList
          onSelectCountry={handleSelectCountry}
          onCreateCountry={handleCreateCountry}
          onDeleteCountry={handleDeleteCountry}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showWorld ? "true" : "false"}
      >
        <WorldLayout onMentionClick={handleMentionClick} onCharacterCount={handleWorldCharCount} selectedEntryId={worldSelectedEntryId} onWikiLinkClick={handleWikiLinkClick} />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showNovel ? "true" : "false"}
      >
        <NovelView />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showTreeTable ? "true" : "false"}
      >
        <TreeTableView />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showMapManager ? "true" : "false"}
      >
        {mapEditorOpen ? (
          <MapView
            active={showMapManager}
            mode="editor"
            onCloseEditor={() => setMapEditorOpen(false)}
          />
        ) : (
          <MapManager
            onOpenMap={() => setActiveItem('地图生成器')}
            onEditMap={() => setMapEditorOpen(true)}
          />
        )}
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showMapGenerator ? "true" : "false"}
      >
        <MapView active={showMapGenerator} />
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={showTimeline ? "true" : "false"}
      >
        <TimelineView onSelectEvent={handleTimelineSelectEvent} />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showAlbum ? "true" : "false"}
      >
        <GlobalAlbum
          onNavigate={(id, type) => handleRelatedItemNavigate(id, type)}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={showRelations ? "true" : "false"}
      >
        <RelationGraph
          visible={showRelations}
          onNavigateToCharacter={(id) => {
            setSource('relations')
            handleRelatedItemNavigate(id, 'character')
          }}
          onNavigateToEvent={(id) => {
            setSource('relations')
            handleRelatedItemNavigate(id, 'event')
          }}
          onNavigateToCountry={(id) => {
            setSource('relations')
            handleRelatedItemNavigate(id, 'country')
          }}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showCustomSection ? "true" : "false"}
      >
        {customSectionId ? (
          <CustomSectionView
            sectionId={customSectionId}
            onDeleted={() => setActiveItem(null)}
          />
        ) : null}
      </div>

      <div
        data-visible={(showPlaceholder || activeItem === null) ? "true" : "false"}
        className="h-full section-fade flex items-center justify-center max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
      >
        <p className="text-ink-muted text-sm font-serif">
          {showPlaceholder ? placeholderText : '欢迎使用 OC Studio'}
        </p>
      </div>
    </div>
  )
}
