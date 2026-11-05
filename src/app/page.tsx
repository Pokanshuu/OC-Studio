'use client'

import dynamic from 'next/dynamic'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EventList } from '@/features/events/components/EventList'
import { EventEditor } from '@/features/events/components/EventEditor'
import { CharacterList } from '@/features/characters/components/CharacterList'
import { CharacterEditor } from '@/features/characters/components/CharacterEditor'
import { CountryList } from '@/features/countries/components/CountryList'
import { CountryEditor } from '@/features/countries/components/CountryEditor'
import { WorldLayout } from '@/features/world/components/WorldLayout'
import { TimelineView } from '@/features/timeline/components/TimelineView'
import { GlobalAlbum } from '@/components/shared/GlobalAlbum'
import { Dashboard } from '@/features/dashboard'
import { CategorySection } from '@/features/categories/CategorySection'
import { categoryIdFromItem, isCategoryItem } from '@/lib/categories/types'
import { isToolItem } from '@/lib/entry-kinds'
import { ToolSection } from '@/features/tools/ToolSection'
import { useEntityWorkspace } from '@/lib/use-entity-workspace'

const MapView = dynamic(() => import('@/features/map').then((mod) => ({ default: mod.MapView })), {
  ssr: false,
})

const TreeTable = dynamic(() => import('@/features/tree-table').then((mod) => ({ default: mod.TreeTable })), {
  ssr: false,
})

const InspirationSection = dynamic(() => import('@/features/inspirations').then((mod) => ({ default: mod.InspirationSection })), { 
  ssr: false,
})

const NovelSection = dynamic(() => import('@/features/novel').then((mod) => ({ default: mod.NovelSection })), {
  ssr: false,
})

const RelationGraph = dynamic(
  () => import('@/features/relations').then((mod) => ({ default: mod.RelationGraph })),
  { ssr: false },
)

export default function Home() {
  const {
    activeItem,
    characters,
    charactersError,
    charactersLoading,
    characterView,
    charSlide,
    categoryEntryTarget,
    clearCategoryEntryTarget,
    clearNovelEntryTarget,
    clearWorldSelectedEntry,
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
    handleTimelineSelectCharacter,
    handleTimelineSelectEvent,
    handleWikiLinkClick,
    handleWorldCharCount,
    leaveConfirm,
    novelEntryTarget,
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
    showNovel,
    showTreeTable,
    showMap,
    showTimeline,
    showWorld,
    worldSelectedEntryId,
  } = useEntityWorkspace()

  return (    <div className="section-stack">
      <div
        className="h-full section-fade overflow-y-auto max-md:pb-[var(--safe-bottom)]"
        data-visible={(showEvents && eventView.sub === 'editor') ? "true" : "false"}
        data-animate={eventSlide === 'to-editor' ? 'slide-in-right' : eventSlide === 'to-list' ? 'slide-out-right' : undefined}
      >
        {selectedEvent ? (
          <EventEditor
            key={selectedEvent.id}
            event={selectedEvent}
            onBack={handleBackToList}
            onCreate={handleCreateEvent}
            onSave={handleSaveEvent}
            onNavigateToEvent={handleSelectEvent}
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
            onCreate={handleCreateCharacter}
            onNavigateToCharacter={(id) => handleRelatedItemNavigate(id, 'character')}
            onNavigateToCountry={(id) => handleRelatedItemNavigate(id, 'country')}
            onNavigateToWorld={(id) => handleWikiLinkClick(String(id))}
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
            key={countryView.countryId}
            editCountryId={countryView.countryId}
            onBack={handleBackToCountryList}
            onCreate={handleCreateCountry}
            onNavigateToCountry={handleSelectCountry}
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
        <WorldLayout onMentionClick={handleMentionClick} onCharacterCount={handleWorldCharCount} selectedEntryId={worldSelectedEntryId} onSelectedEntryConsumed={clearWorldSelectedEntry} onWikiLinkClick={handleWikiLinkClick} />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={activeItem !== null && isCategoryItem(activeItem) ? "true" : "false"}
      >
        {activeItem !== null && isCategoryItem(activeItem) ? (
          <CategorySection
            key={categoryIdFromItem(activeItem)}
            categoryId={categoryIdFromItem(activeItem)}
            openEntryRequest={
              categoryEntryTarget !== null && categoryEntryTarget.item === activeItem
                ? { entryId: categoryEntryTarget.entryId, nonce: categoryEntryTarget.nonce }
                : null
            }
            onOpenEntryConsumed={clearCategoryEntryTarget}
            onMentionClick={handleMentionClick}
            onCharacterCount={handleWorldCharCount}
            onWikiLinkClick={handleWikiLinkClick}
          />
        ) : null}
      </div>

      <div
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={showTimeline ? "true" : "false"}
      >
        <TimelineView
          onSelectEvent={handleTimelineSelectEvent}
          onSelectCharacter={handleTimelineSelectCharacter}
        />
      </div>

      {/* 灵感：随手记。不是实体，不进词条树 / 相册 / 关系图 */}
      <div
        className="h-full section-fade overflow-hidden section-fade-no-gutter max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={activeItem === '灵感' ? "true" : "false"}
      >
        <InspirationSection />
      </div>

      <div
        className="h-full section-fade overflow-y-auto section-fade-no-gutter"
        data-visible={showNovel ? "true" : "false"}
      >
        <NovelSection
          openEntryRequest={novelEntryTarget}
          onOpenEntryConsumed={clearNovelEntryTarget}
          onWikiLinkClick={handleWikiLinkClick}
        />
      </div>

      <div
        className="h-full section-fade overflow-hidden section-fade-no-gutter"
        data-visible={showMap ? "true" : "false"}
      >
        <MapView />
      </div>

      <div
        className="h-full section-fade overflow-auto section-fade-no-gutter"
        data-visible={showTreeTable ? "true" : "false"}
      >
        <TreeTable onNavigate={(id, type) => handleRelatedItemNavigate(id, type)} />
      </div>

      {/* 工具：插件提供的能力面板（`工具:<插件 id>`），不是内容，不进词条树 / 相册 */}
      <div
        className="h-full section-fade overflow-hidden section-fade-no-gutter max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
        data-visible={isToolItem(activeItem) ? "true" : "false"}
      >
        {isToolItem(activeItem) && activeItem !== null ? <ToolSection item={activeItem} /> : null}
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
          onNavigateToWorld={(id) => {
            setSource('relations')
            handleRelatedItemNavigate(id, 'world')
          }}
        />
      </div>

      <div
        data-visible={(showPlaceholder || activeItem === null) ? "true" : "false"}
        className="h-full section-fade overflow-y-auto max-md:pt-[calc(60px+var(--safe-top))] max-md:pb-[calc(60px+var(--safe-bottom))]"
      >
        {showPlaceholder ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-serif text-sm text-ink-faint">{placeholderText}</p>
          </div>
        ) : (
          <Dashboard
            onNavigate={handleRelatedItemNavigate}
            onOpenSection={(item) => setActiveItem(item)}
          />
        )}
      </div>

      <AlertDialog
        open={leaveConfirm.open}
        onOpenChange={(open) => {
          if (!open) setLeaveConfirm({ open: false, onConfirm: null })
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的更改</AlertDialogTitle>
            <AlertDialogDescription>
              当前编辑器有未保存的更改，离开后这些改动将会丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                leaveConfirm.onConfirm?.()
                setLeaveConfirm({ open: false, onConfirm: null })
              }}
            >
              放弃并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


