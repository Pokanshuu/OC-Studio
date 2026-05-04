'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigation } from '@/components/layout/NavigationContext'
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
import type { EventFormData } from '@/features/events/types'

type EventView = { sub: 'list' } | { sub: 'editor'; eventId: number }
type CharacterView = { sub: 'list' } | { sub: 'editor'; characterId: number }
type CountryView = { sub: 'list' } | { sub: 'editor'; countryId: number }

const PLACEHOLDER_MAP: Record<string, string> = {
  '关系图': '关系网络开发中...',
}

export default function Home() {
  const { activeItem, setActiveItem } = useNavigation()
  const [eventView, setEventView] = useState<EventView>({ sub: 'list' })
  const [characterView, setCharacterView] = useState<CharacterView>({ sub: 'list' })
  const [countryView, setCountryView] = useState<CountryView>({ sub: 'list' })
const [worldSelectedEntryId, setWorldSelectedEntryId] = useState<number | null>(null)

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
    setEventView({ sub: 'editor', eventId: id })
  }, [])

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
      refresh()
    }).catch(() => {
      // error handled via hook
    })
  }, [createEvent, creating, refresh])

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

  const handleBackToList = useCallback(() => {
    setEventView({ sub: 'list' })
  }, [])

  const handleSelectCharacter = useCallback((id: number) => {
    setCharacterView({ sub: 'editor', characterId: id })
  }, [])

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
      refreshCharacters()
    }).catch(() => {
      // error handled via hook
    })
  }, [createCharacter, creatingChar, refreshCharacters])

  const handleBackToCharacterList = useCallback(() => {
    setCharacterView({ sub: 'list' })
    refreshCharacters()
  }, [refreshCharacters])

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
    }).catch(() => {
      // error handled via hook
    })
  }, [createCountry, creatingCountry])

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
    setCountryView({ sub: 'editor', countryId: id })
  }, [])

  const handleBackToCountryList = useCallback(() => {
    setCountryView({ sub: 'list' })
  }, [])

  const handleTimelineSelectEvent = useCallback(
    (id: number) => {
      setEventView({ sub: 'editor', eventId: id })
      setActiveItem('事件')
    },
    [setActiveItem],
  )

  const handleRelatedItemNavigate = useCallback((id: number, type?: string) => {
    if (type === 'character') {
      setCharacterView({ sub: 'editor', characterId: id })
      setActiveItem('角色')
    } else if (type === 'event') {
      setEventView({ sub: 'editor', eventId: id })
      setActiveItem('事件')
    } else if (type === 'country') {
      setCountryView({ sub: 'editor', countryId: id })
      setActiveItem('国家')
    } else if (type === 'world') {
      setWorldSelectedEntryId(id)
      setActiveItem('世界观')
    }
  }, [setActiveItem])

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
  const showPlaceholder = activeItem !== null && !showEvents && !showCharacters && !showCountries && !showWorld && !showTimeline
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
    <>
      <div
        className="h-full"
        style={{
          display: showEvents && eventView.sub === 'editor' ? undefined : 'none',
        }}
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
        className="h-full"
        style={{
          display: showEvents && eventView.sub === 'list' ? undefined : 'none',
        }}
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
        className="h-full"
        style={{
          display: showCharacters && characterView.sub === 'editor' ? undefined : 'none',
        }}
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
        className="h-full"
        style={{
          display: showCharacters && characterView.sub === 'list' ? undefined : 'none',
        }}
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
        className="h-full"
        style={{
          display: showCountries && countryView.sub === 'editor' ? undefined : 'none',
        }}
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
        className="h-full"
        style={{
          display: showCountries && countryView.sub === 'list' ? undefined : 'none',
        }}
      >
        <CountryList
          onSelectCountry={handleSelectCountry}
          onCreateCountry={handleCreateCountry}
          onDeleteCountry={handleDeleteCountry}
        />
      </div>

      <div
        className="h-full"
        style={{
          display: showWorld ? undefined : 'none',
        }}
      >
        <WorldLayout onMentionClick={handleMentionClick} onCharacterCount={handleWorldCharCount} selectedEntryId={worldSelectedEntryId} onWikiLinkClick={handleWikiLinkClick} />
      </div>

      <div
        className="h-full"
        style={{
          display: showTimeline ? undefined : 'none',
        }}
      >
        <TimelineView onSelectEvent={handleTimelineSelectEvent} />
      </div>

      <div
        style={{
          display: showPlaceholder || activeItem === null ? undefined : 'none',
        }}
        className="flex h-full items-center justify-center"
      >
        <p className="text-ink-muted text-sm font-serif">
          {showPlaceholder ? placeholderText : '欢迎使用 OC Studio'}
        </p>
      </div>
    </>
  )
}
