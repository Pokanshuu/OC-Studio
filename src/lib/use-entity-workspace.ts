'use client'

import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useNavigationSource } from '@/components/layout/NavigationSourceContext'
import { useEditor } from '@/components/layout/EditorContext'
import { useDevice } from '@/lib/use-device'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'
import { useWordCount } from '@/components/layout/WordCountContext'
import { useEntityNavigate } from '@/components/layout/EntityNavigateContext'
import { useSaveStatus } from '@/components/layout/SaveStatusContext'
import { useEventList, useEvent, useCreateEvent, useUpdateEvent, useDeleteEvent } from '@/features/events/hooks/useEvents'
import { useCharacterList, useCreateCharacter, useDeleteCharacter } from '@/features/characters/hooks/useCharacters'
import { useCreateCountry, useDeleteCountry } from '@/features/countries/hooks/useCountries'
import type { EventFormData } from '@/features/events/types'

export type EventView = { sub: 'list' } | { sub: 'editor'; eventId: number }
export type CharacterView = { sub: 'list' } | { sub: 'editor'; characterId: number }
export type CountryView = { sub: 'list' } | { sub: 'editor'; countryId: number }
const PLACEHOLDER_MAP: Record<string, string> = {}

/**
 * 工作台编排层：视图路由（列表 ⇄ 编辑器）、跨实体返回栈、未保存守卫、滑动动画、
 * 词数上报，以及四类实体的取数与增删改。page.tsx 只保留渲染。
 *
 * 抽出来的原因：page.tsx 曾把它和渲染混在一起共 770 行 —— 「编排」与「长什么样」
 * 是两件事，且编排部分是唯一需要理解返回栈/守卫时序的地方。
 */
export function useEntityWorkspace() {  const { activeItem: desktopActiveItem, setActiveItem } = useNavigation()
  const { source, setSource, clearSource } = useNavigationSource()
  const { setEditing, clearEditing, entityType, entityId } = useEditor()
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
  const mobileSetSection = mobileNav.setSection
  const mobileSetGallerySubTab = mobileNav.setGallerySubTab
  const [eventView, setEventView] = useState<EventView>({ sub: 'list' })
  const [characterView, setCharacterView] = useState<CharacterView>({ sub: 'list' })
  const [countryView, setCountryView] = useState<CountryView>({ sub: 'list' })
  const [worldSelectedEntryId, setWorldSelectedEntryId] = useState<number | null>(null)

  const crossBackRef = useRef<{
    activeItem: string | null
    eventView: EventView
    characterView: CharacterView
    countryView: CountryView
    source: ReturnType<typeof useNavigationSource>['source']
    mobileSection?: import('@/components/layout/MobileNavigationContext').MobileSection
    mobileGallerySubTab?: import('@/components/layout/MobileNavigationContext').GallerySubTab
  } | null>(null)

  // 从编辑器/图谱/相册/世界观跳走前记录返回现场（返回时恢复）
  const rememberCrossBack = useCallback(() => {
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
  }, [eventView, characterView, countryView, activeItem, source, mobileNav.section, mobileNav.gallerySubTab])

  const { setActiveEntity, status: saveStatus, resetStatus } = useSaveStatus()
  useEffect(() => {
    setActiveEntity(
      activeItem === '事件' ? 'event'
      : activeItem === '角色' ? 'character'
      : activeItem === '国家' ? 'country'
      : activeItem === '世界观' ? 'world'
      : null,
    )
  }, [activeItem, setActiveEntity])

  // 编辑器实体切换（进入/离开/跨实体跳转）时重置全局保存状态，
  // 防止上一个编辑器的 dirty 残留导致新编辑器出现「未保存」误报。
  // 注意：父级 effect 在子编辑器挂载 effect 之后运行，可顺带清掉挂载期噪声。
  useEffect(() => {
    resetStatus()
  }, [entityType, entityId, resetStatus])

  const saveStatusRef = useRef(saveStatus)
  // 只在 confirmLeave 里被读（事件处理器），按 React 规则不在 render 期写 ref
  useLayoutEffect(() => {
    saveStatusRef.current = saveStatus
  }, [saveStatus])
  const [leaveConfirm, setLeaveConfirm] = useState<{ open: boolean; onConfirm: (() => void) | null }>({
    open: false,
    onConfirm: null,
  })

  // 有未保存改动时先弹 AlertDialog 确认，确认后执行 action
  const confirmLeave = useCallback((action: () => void) => {
    if (saveStatusRef.current !== 'dirty') {
      action()
    } else {
      setLeaveConfirm({ open: true, onConfirm: action })
    }
  }, [])

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
    const doCreate = () => {
      createEvent({
        title: '新事件',
        time: '',
        location: '',
        summary: '',
        isMajor: false,
        content: '',
        tags: [],
      }).then((id) => {
        rememberCrossBack()
        setEventView({ sub: 'editor', eventId: id })
        setActiveItem('事件')
        if (isMobile) {
          mobileSetSection('gallery')
          mobileSetGallerySubTab('events')
        }
        setEditing('event', id)
        clearSource()
        refresh()
      }).catch(() => {
        // error handled via hook
      })
    }
    confirmLeave(doCreate)
  }, [createEvent, creating, refresh, setEditing, confirmLeave, rememberCrossBack, setActiveItem, isMobile, mobileSetSection, mobileSetGallerySubTab, clearSource])

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
    confirmLeave(() => {
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
    })
  }, [source, setActiveItem, clearSource, restoreCrossBack, clearEditing, isMobile, mobileSetSection, confirmLeave])

  const handleSelectCharacter = useCallback((id: number) => {
    setSource('characterList')
    setCharacterView({ sub: 'editor', characterId: id })
    setEditing('character', id)
  }, [setSource, setEditing])

  const handleCreateCharacter = useCallback(() => {
    if (creatingChar) return
    const doCreate = () => {
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
        tags: [],
      }).then((id) => {
        rememberCrossBack()
        setCharacterView({ sub: 'editor', characterId: id })
        setActiveItem('角色')
        if (isMobile) {
          mobileSetSection('gallery')
          mobileSetGallerySubTab('characters')
        }
        setEditing('character', id)
        clearSource()
        refreshCharacters()
      }).catch(() => {
        // error handled via hook
      })
    }
    confirmLeave(doCreate)
  }, [createCharacter, creatingChar, refreshCharacters, setEditing, confirmLeave, rememberCrossBack, setActiveItem, isMobile, mobileSetSection, mobileSetGallerySubTab, clearSource])

  const handleBackToCharacterList = useCallback(() => {
    confirmLeave(() => {
      (document.activeElement as HTMLElement | null)?.blur()
      clearEditing()
      if (restoreCrossBack()) return
      setCharacterView({ sub: 'list' })
      refreshCharacters()
      clearSource()
    })
  }, [refreshCharacters, clearSource, restoreCrossBack, clearEditing, confirmLeave])

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
    const doCreate = () => {
      createCountry({
        name: '新国家',
        parentId: null,
        description: '',
        system: '',
        geography: '',
        culture: '',
        tags: [],
      }).then((id) => {
        rememberCrossBack()
        setCountryView({ sub: 'editor', countryId: id })
        setActiveItem('国家')
        if (isMobile) {
          mobileSetSection('gallery')
          mobileSetGallerySubTab('countries')
        }
        setEditing('country', id)
        clearSource()
      }).catch(() => {
        // error handled via hook
      })
    }
    confirmLeave(doCreate)
  }, [createCountry, creatingCountry, setEditing, confirmLeave, rememberCrossBack, setActiveItem, isMobile, mobileSetSection, mobileSetGallerySubTab, clearSource])

  // 命令面板「快速新建」事件监听
  useEffect(() => {
    const handler = (e: Event) => {
      const type = (e as CustomEvent).detail?.type
      if (type === 'character') handleCreateCharacter()
      else if (type === 'event') handleCreateEvent()
      else if (type === 'country') handleCreateCountry()
    }
    window.addEventListener('oc:create-entity', handler)
    return () => window.removeEventListener('oc:create-entity', handler)
  }, [handleCreateCharacter, handleCreateEvent, handleCreateCountry])

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
    confirmLeave(() => {
      (document.activeElement as HTMLElement | null)?.blur()
      clearEditing()
      if (restoreCrossBack()) return
      setCountryView({ sub: 'list' })
      clearSource()
    })
  }, [clearSource, restoreCrossBack, clearEditing, confirmLeave])

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
    // 同类型实体间跳转会因 key 变化重挂编辑器 → 未保存改动会丢失，需确认
    const willRemount =
      (type === 'character' && characterView.sub === 'editor') ||
      (type === 'event' && eventView.sub === 'editor') ||
      (type === 'country' && countryView.sub === 'editor')

    const doNavigate = () => {
      rememberCrossBack()

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
    }

    if (willRemount) confirmLeave(doNavigate)
    else doNavigate()
  }, [eventView, characterView, countryView, setActiveItem, clearSource, setEditing, isMobile, mobileSetSection, mobileSetGallerySubTab, confirmLeave, rememberCrossBack])

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

  return {
    activeItem,
    characters,
    charactersError,
    charactersLoading,
    characterView,
    charSlide,
    countrySlide,
    countryView,
    events,
    eventsError,
    eventSlide,
    eventsLoading,
    eventView,
    handleBackToCharacterList,
    handleBackToCountryList,
    handleBackToList,
    handleCharacterCharCount,
    handleCountryCharCount,
    handleCreateCharacter,
    handleCreateCountry,
    handleCreateEvent,
    handleDeleteCharacter,
    handleDeleteCountry,
    handleDeleteEvent,
    handleEventCharCount,
    handleMentionClick,
    handleRelatedItemNavigate,
    handleSaveEvent,
    handleSelectCharacter,
    handleSelectCountry,
    handleSelectEvent,
    handleTimelineSelectEvent,
    handleWikiLinkClick,
    handleWorldCharCount,
    leaveConfirm,
    placeholderText,
    selectedEvent,
    setActiveItem,
    setLeaveConfirm,
    setSource,
    showAlbum,
    showCharacters,
    showCountries,
    showEvents,
    showPlaceholder,
    showRelations,
    showTimeline,
    showWorld,
    worldSelectedEntryId,
  }
}



