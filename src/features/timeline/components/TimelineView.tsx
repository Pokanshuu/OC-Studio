'use client'

import { useMemo, useCallback, useState, useRef } from 'react'
import {
  DndContext,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import {
  Lock,
  Circle,
} from 'lucide-react'
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
import { useDevice } from '@/lib/use-device'
import { MobileActionSheet } from '@/components/shared/MobileActionSheet'
import { useTimelineEvents } from '../hooks/useTimelineEvents'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { PeriodDialog } from '@/components/shared/PeriodDialog'
import { PERIOD_COLORS } from '@/types'
import type { TimelineFilter } from '../services'
import { parseYear } from '@/features/events/utils'
import {
  LEFT_PADDING,
  LANE_HEIGHT,
  YEAR_TICK_HEIGHT,
  MAX_LANES,
} from '../constants'
import type { FilterOption } from '../types'
import { useTimelineLayout } from '../hooks/useTimelineLayout'
import { useTimelineViewport } from '../hooks/useTimelineViewport'
import { useTimelineContainerWidth } from '../hooks/useTimelineContainerWidth'
import { useTimelineDrag } from '../hooks/useTimelineDrag'
import { usePeriodEditor } from '../hooks/usePeriodEditor'
import { DraggableNode, StaticNode } from './EventNode'
import { PeriodBar } from './PeriodBar'
import { EmptyTimeline } from './EmptyTimeline'
import { BucketView } from './BucketView'
import { TimelineToolbar } from './TimelineToolbar'

interface TimelineViewProps {
  onSelectEvent: (id: number) => void
}

export function TimelineView({ onSelectEvent }: TimelineViewProps) {
  const { isMobile } = useDevice()
  const [editMode, setEditMode] = useState(false)
  const [filterMajor, setFilterMajor] = useState(false)
  const [characterFilter, setCharacterFilter] = useState<number | 'all'>('all')
  const [countryFilter, setCountryFilter] = useState<number | 'all'>('all')
  const [zoomRatio, setZoomRatio] = useState(1.0)

  const { characters } = useCharacterList()
  const { countries } = useCountryList()

  const characterOptions = useMemo<FilterOption[]>(() => {
    return [
      { value: 'all', label: '全部角色' },
      ...characters
        .filter((c) => c.id !== undefined)
        .map((c) => ({ value: c.id, label: c.name })),
    ]
  }, [characters])

  const countryOptions = useMemo<FilterOption[]>(() => {
    return [
      { value: 'all', label: '全部国家' },
      ...countries
        .filter((c) => c.id !== undefined)
        .map((c) => ({ value: c.id, label: c.name })),
    ]
  }, [countries])

  const timelineFilter = useMemo<TimelineFilter | undefined>(() => {
    const f: TimelineFilter = {}
    if (characterFilter !== 'all') f.characterId = characterFilter
    if (countryFilter !== 'all') f.countryId = countryFilter
    return Object.keys(f).length > 0 ? f : undefined
  }, [characterFilter, countryFilter])

  const { events, loading, error, refresh } = useTimelineEvents(timelineFilter)
  const periodEditor = usePeriodEditor()
  const { periods } = periodEditor

  const scrollRef = useRef<HTMLDivElement>(null)
  const containerWidth = useTimelineContainerWidth(scrollRef, events)

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  const handleDragEnd = useTimelineDrag(refresh)

  const {
    filtered,
    yearRange,
    autoPxPerYear,
    pxPerYear,
    density,
    displayPxPerYear,
    nodes,
    buckets,
    yearTicks,
    totalWidth,
    navTargets,
    periodLanes,
    periodsHeight,
    axisY,
  } = useTimelineLayout({ events, filterMajor, periods, containerWidth, zoomRatio })
  const {
    isFirstEvent,
    isLastEvent,
    navigateToEvent,
    handleZoomChange,
    handleZoomCommit,
  } = useTimelineViewport({
    scrollRef,
    containerWidth,
    zoomRatio,
    setZoomRatio,
    yearRange,
    autoPxPerYear,
    displayPxPerYear,
    totalWidth,
    navTargets,
    hasEvents: events.length > 0,
  })

  const isFiltering = characterFilter !== 'all' || countryFilter !== 'all' || filterMajor
  const canDrag = editMode && !isMobile && density === 'year'
  const showNav = !isMobile && navTargets.length > 1
  const showZoom = !isMobile && events.length > 0
  const inAggregation = density !== 'year'
  const hasContent = density === 'year' ? nodes.items.length > 0 : (buckets && (buckets.buckets.length > 0 || buckets.spanning.length > 0))

  // 工具栏 props 只写一次：三个渲染分支共用同一份，避免三处重复
  const toolbarProps = {
    filterMajor,
    setFilterMajor,
    editMode,
    onToggleEdit: toggleEditMode,
    zoomRatio,
    onZoomChange: handleZoomChange,
    onZoomCommit: handleZoomCommit,
    characterFilter,
    onCharacterFilterChange: setCharacterFilter,
    characterOptions,
    countryFilter,
    onCountryFilterChange: setCountryFilter,
    countryOptions,
    onAddPeriod: periodEditor.openNewPeriodDialog,
  }

  /** 空态/全被筛掉时的工具栏：导航与缩放都不展示 */
  const emptyToolbar = (
    <TimelineToolbar
      {...toolbarProps}
      showNav={false}
      onPrev={() => {}}
      onNext={() => {}}
      isFirst={true}
      isLast={true}
      showZoom={false}
    />
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-error">{error}</span>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col">
      {emptyToolbar}
      <div className="max-md:h-10 flex-shrink-0" />
      <EmptyTimeline />
      </div>
    )
  }

  if (filtered.length === 0 && events.length > 0) {
    return (
      <div className="flex h-full flex-col">
        {emptyToolbar}
      <div className="max-md:h-10 flex-shrink-0" />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ink-muted">
            {isFiltering ? '暂无符合筛选条件的事件' : '暂无事件，请先创建事件后查看时间线'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <TimelineToolbar
        {...toolbarProps}
        showNav={showNav}
        onPrev={() => navigateToEvent('prev')}
        onNext={() => navigateToEvent('next')}
        isFirst={isFirstEvent}
        isLast={isLastEvent}
        showZoom={showZoom}
      />
      <div className="max-md:h-10 flex-shrink-0" />

      <div ref={scrollRef} className="flex-1 overflow-x-auto" style={{ touchAction: 'pan-x' }}>
        <div
          className="relative min-h-full"
          style={{
            width: totalWidth > 0 ? totalWidth : '100%',
            minHeight: Math.max(
              300,
              axisY +
                MAX_LANES * LANE_HEIGHT +
                40,
            ),
          }}
          >
          {/* Period bars */}
          {periodLanes.rows.length > 0 && yearRange ? (
            <div className="absolute left-0 right-0" style={{ top: 4, height: periodsHeight }}>
              {periodLanes.rows.map(({ period, row }) => {
                const startYear = parseYear(period.startTime)
                const endYear = parseYear(period.endTime)
                if (startYear === null || endYear === null) return null
                const left = LEFT_PADDING + (startYear - yearRange.rangeStart) * displayPxPerYear
                const right = LEFT_PADDING + (endYear - yearRange.rangeStart) * displayPxPerYear
                const w = Math.max(right - left, 4)
                if (density !== 'year' && w < 40) return null
                const hex = PERIOD_COLORS.find(c => c.value === period.color)?.hex ?? '#F3EFE9'
                const hexDark = PERIOD_COLORS.find(c => c.value === period.color)?.hexDark ?? hex
                return (
                  <PeriodBar
                    key={period.id}
                    period={period}
                    left={left}
                    width={w}
                    hex={hex}
                    hexDark={hexDark}
                    row={row}
                    isMobile={isMobile}
                    onEdit={() => periodEditor.openEditPeriodDialog(period)}
                    onDelete={() => periodEditor.setDeleteTarget(period)}
                    onLongPress={() => periodEditor.openPeriodActionSheet(period)}
                  />
                )
              })}
            </div>
          ) : null}

          {/* Time axis line */}
          <div
            className="absolute left-0 right-0"
            style={{ top: axisY, height: 1, background: 'var(--color-line)' }}
          />

          {/* Year ticks */}
          {hasContent &&
            yearTicks.map((tick) => (
              <div
                key={tick.year}
                style={{ position: 'absolute', left: tick.x, top: 0, bottom: 0, pointerEvents: 'none' }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: axisY - YEAR_TICK_HEIGHT,
                    width: 1,
                    height: YEAR_TICK_HEIGHT,
                    background: 'var(--color-line)',
                  }}
                />
                <span
                  className="absolute text-xs text-ink-muted whitespace-nowrap"
                  style={{
                    left: 4,
                    top: axisY - YEAR_TICK_HEIGHT - 18,
                  }}
                >
                  {tick.year > 0 ? `${tick.year}年` : `前${Math.abs(tick.year)}年`}
                </span>
              </div>
            ))}

          {/* Individual event nodes (year view only) */}
          {density === 'year' ? (
            canDrag ? (
              <DndContext
                onDragEnd={(e) => {
                  void handleDragEnd(e, pxPerYear)
                }}
                modifiers={[restrictToHorizontalAxis]}
              >
                {nodes.items.map((item) => (
                  <DraggableNode
                    key={item.event.id}
                    event={item.event}
                    x={item.x}
                    y={axisY + 24 + item.lane * LANE_HEIGHT}
                    width={item.width}
                    onSelect={onSelectEvent}
                  />
                ))}
              </DndContext>
            ) : (
              nodes.items.map((item) => (
                <StaticNode
                  key={item.event.id}
                  event={item.event}
                  x={item.x}
                  y={axisY + 24 + item.lane * LANE_HEIGHT}
                  width={item.width}
                  onSelect={onSelectEvent}
                />
              ))
            )
          ) : null}

          {/* Time buckets (aggregation mode) */}
          {inAggregation && buckets ? (() => {
            const { buckets: bucketList, spanning } = buckets
            const spanningOffset = spanning.length > 0
              ? (Math.max(...spanning.map(s => s.lane)) + 1) * LANE_HEIGHT
              : 0
            return (
              <>
                {spanning.map((s) => (
                  <StaticNode
                    key={s.event.id}
                    event={s.event}
                    x={s.x}
                    y={axisY + 24 + s.lane * LANE_HEIGHT}
                    width={s.width}
                    onSelect={onSelectEvent}
                  />
                ))}
                <BucketView
                  buckets={bucketList}
                  onSelectEvent={onSelectEvent}
                  axisY={axisY}
                  spanningOffset={spanningOffset}
                />
              </>
            )
          })() : null}

          {/* Mode indicator */}
          {editMode && !isMobile && inAggregation && hasContent ? (
            <div
              className="absolute right-2 flex items-center gap-1 text-xs text-ink-faint"
              style={{ top: 8 }}
            >
              <Lock size={12} strokeWidth={2} />
              <span>聚合模式，拖拽已禁用</span>
            </div>
          ) : null}

        </div>
      </div>

      {/* Untimed events */}
      {nodes.withoutTime.length > 0 ? (
        <div className="shrink-0 border-t border-dashed border-line pl-4 pr-4 py-3 bg-paper md:static fixed bottom-[calc(60px+var(--safe-bottom))] left-0 right-0 z-10">
          <p className="mb-2 text-xs text-ink-faint">未标注时间的事件</p>
          <div className="flex flex-wrap gap-2">
            {nodes.withoutTime.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelectEvent(e.id)}
                className="touch-feedback flex items-center gap-1.5 px-2 py-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
              >
                {e.isMajor ? (
                  <Circle
                    size={8}
                    fill="var(--color-error)"
                    className="shrink-0 text-error"
                  />
                ) : null}
                {e.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <PeriodDialog
        key={periodEditor.editingPeriod?.id ?? 'new'}
        open={periodEditor.periodDialogOpen}
        period={periodEditor.editingPeriod}
        onSave={periodEditor.handlePeriodSave}
        onClose={periodEditor.closePeriodDialog}
      />

      <AlertDialog open={periodEditor.deleteTarget !== null} onOpenChange={(open) => { if (!open) periodEditor.setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除时期</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除「{periodEditor.deleteTarget?.name}」？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={periodEditor.handlePeriodDelete} className="bg-transparent border border-error text-error hover:bg-red-50">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileActionSheet
        open={periodEditor.actionSheet.open}
        onClose={() => periodEditor.setActionSheet((prev) => ({ ...prev, open: false }))}
        title={periodEditor.actionSheet.title}
        actions={periodEditor.actionSheet.actions}
      />
    </div>
  )
}

