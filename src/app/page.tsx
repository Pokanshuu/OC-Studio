'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useNavigationSource } from '@/components/layout/NavigationSourceContext'
import { useEditor } from '@/components/layout/EditorContext'
import { useDevice } from '@/lib/use-device'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'
import { useWordCount } from '@/components/layout/WordCountContext'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
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
import { GlobalAlbum } from '@/components/shared/GlobalAlbum'
const RelationGraph = dynamic(
  () => import('@/features/relations').then((mod) => ({ default: mod.RelationGraph })),
  { ssr: false },
)
import type { EventFormData } from '@/features/events/types'

type EventView = { sub: 'list' } | { sub: 'editor'; eventId: number }
type CharacterView = { sub: 'list' } | { sub: 'editor'; characterId: number }
type CountryView = { sub: 'list' } | { sub: 'editor'; countryId: number }

const PLACEHOLDER_MAP: Record<string, string> = {}

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
  }, [source, setActiveItem, clearSource, restoreCrossBack, clearEditing, isMobile, mobileSetSection])

  const handleSelectCharacter = useCallback((id: number) => {
    setSource('characterList')
    setCharacterView({ sub: 'editor', characterId: id })
    setEditing('character', id)
  }, [setSource, setEditing])

  const handleCreateCharacter = useCallback(() => {
    if (creatingChar) return
    createCharacter({
      name: '新角色',
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
    }).then((id) => {
      setCharacterView({ sub: 'editor', characterId: id })
      setEditing('character', id)
      refreshCharacters()
    }).catch(() => {
      // error handled via hook
    })
  }, [createCharacter, creatingChar, refreshCharacters, setEditing])

  const handleBackToCharacterList = useCallback(() => {
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
      activeItem === '关系图'
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
      setCharacterView({ sub: 'editor', characterId: id })
      setActiveItem('角色')
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
  }, [eventView, characterView, countryView, activeItem, source, setActiveItem, clearSource, setEditing, isMobile, mobileNav.section, mobileNav.gallerySubTab, mobileSetSection, mobileSetGallerySubTab])

  const handleMentionClick = useCallback((id: string, entityType?: string) => {
    const numId = Number(id)
    if (Number.isNaN(numId)) return
    handleRelatedItemNavigate(numId, entityType)
  }, [handleRelatedItemNavigate])

  const handleWikiLinkClick = useCallback((id: string) => {
    const numId = Number(id)
    if (Number.isNaN(numId)) return
    handleRelatedItemNavigate(numId, 'world')
  }, [handleRelatedItemNavigate])

  const showEvents = activeItem === '事件'
  const showCharacters = activeItem === '角色'
  const showCountries = activeItem === '国家'
  const showWorld = activeItem === '世界观'
  const showTimeline = activeItem === '时间线'
  const showRelations = activeItem === '关系图'
  const showAlbum = activeItem === '相册'
  const showPlaceholder = activeItem !== null && !showEvents && !showCharacters && !showCountries && !showWorld && !showTimeline && !showRelations && !showAlbum
  const placeholderText = activeItem !== null
    ? (PLACEHOLDER_MAP[activeItem] ?? '功能开发中...')
    : null

  const { setWordCount } = useWordCount()

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
    if (showEvents && eventView.sub === 'editor') setWordCount(eventCountRef.current)
    else if (showCharacters && characterView.sub === 'editor') setWordCount(characterCountRef.current)
    else if (showCountries && countryView.sub === 'editor') setWordCount(countryCountRef.current)
    else if (showWorld) setWordCount(worldCountRef.current)
    else setWordCount(0)
  }, [showEvents, showCharacters, showCountries, showWorld, eventView, characterView, countryView, setWordCount])

  const { setNavigateHandler } = useEntityNavigate()

  useEffect(() => {
    setNavigateHandler((id: number, type: string) => {
      handleRelatedItemNavigate(id, type)
    })
  }, [setNavigateHandler, handleRelatedItemNavigate])

  return (
    <div className="section-stack">
      <div
        className="h-full section-fade overflow-y-auto"
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
        className="h-full section-fade overflow-y-auto"
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
        className="h-full section-fade overflow-y-auto"
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
        className="h-full section-fade overflow-y-auto"
        data-visible={(showCharacters && characterView.sub === 'list') ? "true" : "false"}
        data-animate={charSlide === 'to-editor' ? 'slide-out-left' : charSlide === 'to-list' ? 'slide-in-left' : undefined}
      >
        <CharacterList
          characters={characters}
          loading={charactersLoading}
          error={charactersError}
          onSelectCharacter={handleSelectCharacter}
          onCreateCharacter={handleCreateCharacter}
          onDeleteCharacter={handleDeleteCharacter}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto"
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
        className="h-full section-fade overflow-y-auto"
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
        className="h-full section-fade overflow-y-auto"
        data-visible={showWorld ? "true" : "false"}
      >
        <WorldLayout onMentionClick={handleMentionClick} onCharacterCount={handleWorldCharCount} selectedEntryId={worldSelectedEntryId} onWikiLinkClick={handleWikiLinkClick} />
      </div>

      <div
        className="h-full section-fade overflow-y-auto"
        data-visible={showTimeline ? "true" : "false"}
      >
        <TimelineView onSelectEvent={handleTimelineSelectEvent} />
      </div>

      <div
        className="h-full section-fade overflow-y-auto"
        data-visible={showAlbum ? "true" : "false"}
      >
        <GlobalAlbum
          onNavigate={(id, type) => handleRelatedItemNavigate(id, type)}
        />
      </div>

      <div
        className="h-full section-fade overflow-y-auto"
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
        data-visible={(showPlaceholder || activeItem === null) ? "true" : "false"}
        className="h-full section-fade flex items-center justify-center"
      >
        <p className="text-ink-muted text-sm font-serif">
          {showPlaceholder ? placeholderText : '欢迎使用 OC Studio'}
        </p>
      </div>
    </div>
  )
}
