'use client'

import { memo, useMemo, useCallback, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import {
  Lock,
  LockOpen,
  Circle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useDevice } from '@/lib/use-device'
import { useTimelineEvents } from '../hooks/useTimelineEvents'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { updateEventTime } from '../services'
import type { TimelineFilter } from '../services'
import {
  parseYear,
  computeDensity,
  densityLabel,
  buildBuckets,
  buildYearTicks,
  type TimelineDensity,
  type TimeBucket,
  type YearTick,
} from '../utils'
import type { TimelineEvent } from '../types'

interface TimelineViewProps {
  onSelectEvent: (id: number) => void
}

const LEFT_PADDING = 64
const RIGHT_PADDING = 64
const TOP_AXIS_Y = 40
const LANE_HEIGHT = 48
const YEAR_TICK_HEIGHT = 8
const MAX_LANES = 8
const DEFAULT_PX_PER_YEAR = 120
const MIN_PX_PER_YEAR = 12
const MAX_PX_PER_YEAR = 120
const ZOOM_SNAP_STEP = 10

function shiftYear(time: string, delta: number): string {
  if (!time) return String(delta)
  const match = /^(-?\d+)(.*)$/.exec(time)
  if (!match) return String(delta)
  const year = parseInt(match[1], 10) + delta
  return `${year}${match[2]}`
}

interface ComputedEvent {
  event: TimelineEvent
  x: number
  lane: number
}

function assignLanes(sortedByX: ComputedEvent[]): ComputedEvent[] {
  const laneEnds: number[] = []
  return sortedByX.map((item) => {
    const nodeStart = item.x
    const nodeEnd = item.x + 140
    let lane = 0
    for (; lane < MAX_LANES; lane++) {
      if (!(lane in laneEnds) || laneEnds[lane] <= nodeStart) {
        laneEnds[lane] = nodeEnd
        return { ...item, lane }
      }
    }
    laneEnds.push(nodeEnd)
    return { ...item, lane }
  })
}

const DraggableNode = memo(function DraggableNode({
  event,
  x,
  y,
  onSelect,
}: {
  event: TimelineEvent
  x: number
  y: number
  onSelect: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `event-${event.id}`,
    data: { event, startX: x },
  })

  const finalX = transform ? x + transform.x : x

  return (
    <div
      ref={setNodeRef}
      className="absolute flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-paper-card px-2 py-1 text-sm text-ink transition-colors hover:border-line-hover will-change-transform"
      style={{
        top: y,
        transform: `translateX(${finalX}px)`,
      }}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(event.id)
      }}
      title={event.summary || event.title}
    >
      {event.isMajor ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-error" />
      ) : null}
      <span className="truncate max-w-[120px]">{event.title}</span>
    </div>
  )
})

const StaticNode = memo(function StaticNode({
  event,
  x,
  y,
  onSelect,
}: {
  event: TimelineEvent
  x: number
  y: number
  onSelect: (id: number) => void
}) {
  return (
    <div
      className="absolute flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-paper-card px-2 py-1 text-sm text-ink transition-colors hover:border-line-hover will-change-transform"
      style={{
        top: y,
        transform: `translateX(${x}px)`,
      }}
      title={event.summary || event.title}
      onClick={() => onSelect(event.id)}
    >
      {event.isMajor ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-error" />
      ) : null}
      <span className="truncate max-w-[120px]">{event.title}</span>
    </div>
  )
})

function EmptyTimeline() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-ink-muted">
        暂无事件，请先创建事件后查看时间线
      </p>
    </div>
  )
}

interface FilterOption {
  value: number | 'all'
  label: string
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: number | 'all'
  onChange: (val: number | 'all') => void
  options: FilterOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 4 })
    }
  }, [open])

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node
    const overlay = document.getElementById('overlay-root')
    if (triggerRef.current && !triggerRef.current.contains(target)) {
      if (panelRef.current && !panelRef.current.contains(target)) {
        if (overlay && overlay.contains(target)) return
        setOpen(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, handleClickOutside])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1 rounded border border-line bg-paper-card/60 px-3 text-sm text-ink transition-colors hover:border-line-hover"
      >
        <span className="max-w-[120px] truncate">{selectedLabel}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-30 mt-1 flex max-h-64 flex-col overflow-auto rounded-md border border-line bg-paper/70 backdrop-blur-md p-1 shadow-none ring-1 ring-black/5 pointer-events-auto"
              style={{ left: pos.x, top: pos.y }}
            >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-left text-sm transition-colors ${
                value === opt.value
                  ? 'bg-paper-card text-ink'
                  : 'text-ink hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
            </div>,
            document.getElementById('overlay-root')!,
          )
        : null}
    </div>
  )
}

function BucketView({
  buckets,
  onSelectEvent,
}: {
  buckets: TimeBucket[]
  onSelectEvent: (id: number) => void
}) {
  return (
    <>
      {buckets.map((bucket) => (
        <div
          key={bucket.startYear}
          className="absolute rounded-md border border-line bg-paper-card py-1.5 px-2"
          style={{
            left: bucket.x,
            top: TOP_AXIS_Y + 24,
            width: Math.max(bucket.width - 8, 120),
          }}
        >
          <div className="mb-1.5 text-xs text-ink-muted font-mono border-b border-line pb-1">
            {bucket.label}
          </div>
          {bucket.events.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              className="flex h-6 w-full items-center gap-1 rounded px-1 text-xs text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 truncate"
              title={event.summary || event.title}
            >
              {event.isMajor ? (
                <Circle
                  size={6}
                  fill="var(--color-error)"
                  className="shrink-0 text-error"
                />
              ) : null}
              <span className="truncate">{event.title}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  )
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
        .map((c) => ({ value: c.id as number, label: c.name })),
    ]
  }, [characters])

  const countryOptions = useMemo<FilterOption[]>(() => {
    return [
      { value: 'all', label: '全部国家' },
      ...countries
        .filter((c) => c.id !== undefined)
        .map((c) => ({ value: c.id as number, label: c.name })),
    ]
  }, [countries])

  const timelineFilter = useMemo<TimelineFilter | undefined>(() => {
    const f: TimelineFilter = {}
    if (characterFilter !== 'all') f.characterId = characterFilter
    if (countryFilter !== 'all') f.countryId = countryFilter
    return Object.keys(f).length > 0 ? f : undefined
  }, [characterFilter, countryFilter])

  const { events, loading, error, refresh } = useTimelineEvents(timelineFilter)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [navEdge, setNavEdge] = useState({ prev: true, next: false })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [dragId, setDragId] = useState<number | null>(null)
  const centerYearRef = useRef<number | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0) {
        setContainerWidth(rect.width)
      }
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  const handleDragEnd = useCallback(
    async (e: DragEndEvent, pxPerYear: number) => {
      const { active, delta } = e
      const data = active.data.current as
        | { event: TimelineEvent; startX: number }
        | undefined
      if (!data) return

      const deltaYears = Math.round(delta.x / pxPerYear)
      if (deltaYears === 0) return

      const newTime = shiftYear(data.event.time, deltaYears)
      try {
        await updateEventTime(data.event.id, newTime)
        refresh()
      } catch {
        // silently ignore drag errors
      }
    },
    [refresh],
  )

  const filtered = useMemo(() => {
    return filterMajor ? events.filter((e) => e.isMajor) : events
  }, [events, filterMajor])

  const yearRange = useMemo(() => {
    const withTime = filtered.filter((e) => !!e.time)
    if (withTime.length === 0) return null
    const years = withTime.map((e) => parseYear(e.time) ?? 0)
    const minYear = Math.min(...years)
    const maxYear = Math.max(...years)
    return {
      minYear,
      maxYear,
      rangeStart: minYear - 1,
      totalYears: maxYear - minYear + 1 + 1,
    }
  }, [filtered])

  const autoPxPerYear = useMemo(() => {
    if (!yearRange || yearRange.totalYears <= 0) return DEFAULT_PX_PER_YEAR
    const availableWidth = containerWidth - LEFT_PADDING - RIGHT_PADDING
    if (availableWidth <= 0) return DEFAULT_PX_PER_YEAR
    const raw = availableWidth / yearRange.totalYears
    return Math.max(MIN_PX_PER_YEAR, Math.min(MAX_PX_PER_YEAR, raw))
  }, [containerWidth, yearRange])

  const pxPerYear = useMemo(() => {
    return Math.round(autoPxPerYear * zoomRatio)
  }, [autoPxPerYear, zoomRatio])

  const density = useMemo<TimelineDensity>(() => {
    return computeDensity(pxPerYear)
  }, [pxPerYear])

  const displayPxPerYear = useMemo(() => {
    if (density === 'year') return pxPerYear
    return Math.max(Math.round(pxPerYear * 0.2), 2)
  }, [density, pxPerYear])

  const nodes = useMemo(() => {
    const withTime = filtered.filter((e) => !!e.time)
    const withoutTime = filtered.filter((e) => !e.time)

    if (density !== 'year' || !yearRange || withTime.length === 0) {
      return { items: [] as ComputedEvent[], withoutTime }
    }

    const raw = withTime.map((e) => ({
      event: e,
      x: LEFT_PADDING + ((parseYear(e.time) ?? 0) - yearRange.rangeStart) * pxPerYear,
      lane: 0,
    }))

    raw.sort((a, b) => a.x - b.x)
    const assigned = assignLanes(raw)

    return { items: assigned, withoutTime }
  }, [filtered, yearRange, pxPerYear, density])

  const visibleNodes = useMemo(() => {
    if (density !== 'year' || nodes.items.length === 0) return nodes.items
    if (containerWidth <= 0) return nodes.items
    const buffer = containerWidth * 0.2
    const startX = scrollLeft - buffer
    const endX = scrollLeft + containerWidth + buffer
    const filtered = nodes.items.filter(
      (item) =>
        item.x >= startX && item.x <= endX ||
        item.event.id === dragId,
    )
    const result = filtered.length === 0 ? nodes.items : filtered
    return result
  }, [density, nodes.items, scrollLeft, containerWidth, dragId])

  const buckets = useMemo(() => {
    const withTime = filtered.filter((e) => !!e.time)
    if (density === 'year' || !yearRange || withTime.length === 0) return null
    return buildBuckets(
      withTime,
      density,
      yearRange.rangeStart,
      yearRange.totalYears,
      displayPxPerYear,
      LEFT_PADDING,
    )
  }, [filtered, density, yearRange, displayPxPerYear])

  const yearTicks = useMemo<YearTick[]>(() => {
    if (!yearRange) return []
    return buildYearTicks(
      density,
      yearRange.rangeStart,
      yearRange.totalYears,
      displayPxPerYear,
      LEFT_PADDING,
    )
  }, [density, yearRange, displayPxPerYear])

  const totalWidth = useMemo(() => {
    if (!yearRange) return 0
    const hasContent = density === 'year' ? nodes.items.length > 0 : (buckets && buckets.length > 0)
    if (!hasContent) return 0
    const effectivePx = density === 'year' ? pxPerYear : displayPxPerYear
    return LEFT_PADDING + yearRange.totalYears * effectivePx + RIGHT_PADDING
  }, [yearRange, nodes.items.length, density, buckets, pxPerYear, displayPxPerYear])

  const navTargets = useMemo(() => {
    if (density === 'year') return nodes.items
    if (buckets) {
      return buckets.map((b) => ({
        event: b.events[0],
        x: b.x,
        lane: 0,
      }))
    }
    return []
  }, [density, nodes.items, buckets])

  const isFirstEvent = navTargets.length <= 1 || navEdge.prev
  const isLastEvent = navTargets.length <= 1 || navEdge.next

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let raf = 0
    function updateEdge(): void {
      const container = scrollRef.current
      if (!container) return
      const sl = container.scrollLeft
      const maxScroll = container.scrollWidth - container.clientWidth
      const prev = sl <= 1
      const next = sl >= maxScroll - 1

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setNavEdge({ prev, next })
        setScrollLeft(sl)
      })
    }

    updateEdge()
    el.addEventListener('scroll', updateEdge, { passive: true })
    return () => {
      el.removeEventListener('scroll', updateEdge)
      cancelAnimationFrame(raf)
    }
  }, [totalWidth])

  const navigateToEvent = useCallback(
    (direction: 'prev' | 'next') => {
      const container = scrollRef.current
      if (!container || navTargets.length < 2) return

      const viewCenter = container.scrollLeft + container.clientWidth / 2

      let nearestIdx = 0
      let nearestDist = Infinity
      for (let i = 0; i < navTargets.length; i++) {
        const dist = Math.abs(navTargets[i].x - viewCenter)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestIdx = i
        }
      }

      const targetIdx =
        direction === 'prev'
          ? Math.max(0, nearestIdx - 1)
          : Math.min(navTargets.length - 1, nearestIdx + 1)

      if (targetIdx === nearestIdx) return

      const targetX = navTargets[targetIdx].x
      container.scrollTo({
        left: Math.max(0, targetX - container.clientWidth / 2),
        behavior: 'smooth',
      })
    },
    [navTargets],
  )

  const handleZoomChange = useCallback(
    (value: number) => {
      const container = scrollRef.current
      if (container && yearRange) {
        const viewCenter = container.scrollLeft + container.clientWidth / 2
        const centerYear = yearRange.rangeStart + (viewCenter - LEFT_PADDING) / pxPerYear
        centerYearRef.current = centerYear
      }
      setZoomRatio(value / 100)
    },
    [yearRange, pxPerYear],
  )

  const handleZoomCommit = useCallback(
    (value: number) => {
      const px = autoPxPerYear * (value / 100)
      const snapped = Math.round(px / ZOOM_SNAP_STEP) * ZOOM_SNAP_STEP
      const snappedRatio = snapped / autoPxPerYear

      const container = scrollRef.current
      if (container && yearRange) {
        const viewCenter = container.scrollLeft + container.clientWidth / 2
        const centerYear = yearRange.rangeStart + (viewCenter - LEFT_PADDING) / pxPerYear
        centerYearRef.current = centerYear
      }

      setZoomRatio(snappedRatio)
    },
    [autoPxPerYear, yearRange, pxPerYear],
  )

  const handleWheelZoom = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      setZoomRatio((prev) => {
        const next = Math.max(0.1, Math.min(1.0, prev + -e.deltaY * 0.005))
        const container = scrollRef.current
        if (container && yearRange) {
          const viewCenter = container.scrollLeft + container.clientWidth / 2
          const centerYear = yearRange.rangeStart + (viewCenter - LEFT_PADDING) / pxPerYear
          centerYearRef.current = centerYear
        }
        return next
      })
    },
    [yearRange, pxPerYear],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheelZoom, { passive: false })
    return () => el.removeEventListener('wheel', handleWheelZoom)
  }, [handleWheelZoom])

  useLayoutEffect(() => {
    if (centerYearRef.current === null || !yearRange) return
    const container = scrollRef.current
    if (!container) return

    const newCenterX = LEFT_PADDING + (centerYearRef.current - yearRange.rangeStart) * pxPerYear
    container.scrollLeft = newCenterX - container.clientWidth / 2
    centerYearRef.current = null
  }, [pxPerYear, yearRange])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-ink-muted">加载中...</span>
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
      <TimelineToolbar
        filterMajor={filterMajor}
        setFilterMajor={setFilterMajor}
        editMode={editMode}
        onToggleEdit={toggleEditMode}
        showNav={false}
        onPrev={() => {}}
        onNext={() => {}}
        isFirst={true}
        isLast={true}
        showZoom={false}
        zoomRatio={zoomRatio}
        onZoomChange={handleZoomChange}
        onZoomCommit={handleZoomCommit}
        density={'year'}
        characterFilter={characterFilter}
        onCharacterFilterChange={setCharacterFilter}
        characterOptions={characterOptions}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
        countryOptions={countryOptions}
      />
      <EmptyTimeline />
      </div>
    )
  }

  const isFiltering = characterFilter !== 'all' || countryFilter !== 'all' || filterMajor

  if (filtered.length === 0 && events.length > 0) {
    return (
      <div className="flex h-full flex-col">
        <TimelineToolbar
          filterMajor={filterMajor}
          setFilterMajor={setFilterMajor}
          editMode={editMode}
          onToggleEdit={toggleEditMode}
          showNav={false}
          onPrev={() => {}}
          onNext={() => {}}
          isFirst={true}
          isLast={true}
          showZoom={false}
          zoomRatio={zoomRatio}
          onZoomChange={handleZoomChange}
          onZoomCommit={handleZoomCommit}
          density={'year'}
          characterFilter={characterFilter}
          onCharacterFilterChange={setCharacterFilter}
          characterOptions={characterOptions}
          countryFilter={countryFilter}
          onCountryFilterChange={setCountryFilter}
          countryOptions={countryOptions}
        />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-ink-muted">
            {isFiltering ? '暂无符合筛选条件的事件' : '暂无事件，请先创建事件后查看时间线'}
          </p>
        </div>
      </div>
    )
  }

  const canDrag = editMode && !isMobile && density === 'year'
  const showNav = !isMobile && navTargets.length > 1
  const showZoom = !isMobile && events.length > 0
  const inAggregation = density !== 'year'
  const hasContent = density === 'year' ? nodes.items.length > 0 : (buckets && buckets.length > 0)

  return (
    <div className="flex flex-col min-h-full">
      <TimelineToolbar
        filterMajor={filterMajor}
        setFilterMajor={setFilterMajor}
        editMode={editMode}
        onToggleEdit={toggleEditMode}
        showNav={showNav}
        onPrev={() => navigateToEvent('prev')}
        onNext={() => navigateToEvent('next')}
        isFirst={isFirstEvent}
        isLast={isLastEvent}
        showZoom={showZoom}
        zoomRatio={zoomRatio}
        onZoomChange={handleZoomChange}
        onZoomCommit={handleZoomCommit}
        density={density}
        characterFilter={characterFilter}
        onCharacterFilterChange={setCharacterFilter}
        characterOptions={characterOptions}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
        countryOptions={countryOptions}
      />

      <div ref={scrollRef} className="flex-1 overflow-x-auto">
        <div
          className="relative min-h-full"
          style={{
            width: totalWidth > 0 ? totalWidth : '100%',
            minHeight: Math.max(
              300,
              TOP_AXIS_Y +
                MAX_LANES * LANE_HEIGHT +
                (nodes.withoutTime.length > 0 ? 120 : 0) +
                40,
            ),
          }}
        >
          {/* Time axis line */}
          <div
            className="absolute left-0 right-0"
            style={{ top: TOP_AXIS_Y, height: 1, background: 'var(--color-line)' }}
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
                    top: TOP_AXIS_Y - YEAR_TICK_HEIGHT,
                    width: 1,
                    height: YEAR_TICK_HEIGHT,
                    background: 'var(--color-line)',
                  }}
                />
                <span
                  className="absolute text-xs text-ink-muted whitespace-nowrap"
                  style={{
                    left: 4,
                    top: TOP_AXIS_Y - YEAR_TICK_HEIGHT - 18,
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
                onDragStart={(e) => {
                  setDragId(e.active.data.current?.event?.id as number | undefined ?? null)
                }}
                onDragEnd={(e) => {
                  setDragId(null)
                  void handleDragEnd(e, pxPerYear)
                }}
                modifiers={[restrictToHorizontalAxis]}
              >
                {visibleNodes.map((item) => (
                  <DraggableNode
                    key={item.event.id}
                    event={item.event}
                    x={item.x}
                    y={TOP_AXIS_Y + 24 + item.lane * LANE_HEIGHT}
                    onSelect={onSelectEvent}
                  />
                ))}
              </DndContext>
            ) : (
              visibleNodes.map((item) => (
                <StaticNode
                  key={item.event.id}
                  event={item.event}
                  x={item.x}
                  y={TOP_AXIS_Y + 24 + item.lane * LANE_HEIGHT}
                  onSelect={onSelectEvent}
                />
              ))
            )
          ) : null}

          {/* Time buckets (aggregation mode) */}
          {inAggregation && buckets ? (
            <BucketView buckets={buckets} onSelectEvent={onSelectEvent} />
          ) : null}

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

          {/* Untimed events */}
          {nodes.withoutTime.length > 0 ? (
            <div
              className="absolute left-0 right-0 border-t border-dashed border-line px-4 py-3"
              style={{
                top: TOP_AXIS_Y + 24 + MAX_LANES * LANE_HEIGHT + 16,
              }}
            >
              <p className="mb-2 text-xs text-ink-faint">未标注时间的事件</p>
              <div className="flex flex-wrap gap-2">
                {nodes.withoutTime.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEvent(e.id)}
                    className="flex items-center gap-1.5 rounded border border-line bg-paper-card px-2 py-1 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
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
        </div>
      </div>
    </div>
  )
}

function TimelineToolbar({
  filterMajor,
  setFilterMajor,
  editMode,
  onToggleEdit,
  showNav,
  onPrev,
  onNext,
  isFirst,
  isLast,
  showZoom,
  zoomRatio,
  onZoomChange,
  onZoomCommit,
  density,
  characterFilter,
  onCharacterFilterChange,
  characterOptions,
  countryFilter,
  onCountryFilterChange,
  countryOptions,
}: {
  filterMajor: boolean
  setFilterMajor: (v: boolean) => void
  editMode: boolean
  onToggleEdit: () => void
  showNav: boolean
  onPrev: () => void
  onNext: () => void
  isFirst: boolean
  isLast: boolean
  showZoom: boolean
  zoomRatio: number
  onZoomChange: (value: number) => void
  onZoomCommit: (value: number) => void
  density: TimelineDensity
  characterFilter: number | 'all'
  onCharacterFilterChange: (val: number | 'all') => void
  characterOptions: FilterOption[]
  countryFilter: number | 'all'
  onCountryFilterChange: (val: number | 'all') => void
  countryOptions: FilterOption[]
}) {
  return (
    <div className="flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 min-h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <h2 className="text-lg text-ink">时间线</h2>
        <Separator orientation="vertical" className="h-4 !self-center" />
        <button
          onClick={() => setFilterMajor(true)}
          className={`h-9 rounded border px-3 text-xs transition-colors ${
            filterMajor
              ? 'border-line-hover bg-paper-card/60 text-ink'
              : 'border-line text-ink-muted hover:text-ink'
          }`}
        >
          大事表
        </button>
        <button
          onClick={() => setFilterMajor(false)}
          className={`h-9 rounded border px-3 text-xs transition-colors ${
            !filterMajor
              ? 'border-line-hover bg-paper-card/60 text-ink'
              : 'border-line text-ink-muted hover:text-ink'
          }`}
        >
          全部事件
        </button>

        <Separator orientation="vertical" className="h-4 !self-center" />
        <FilterSelect
          value={characterFilter}
          onChange={onCharacterFilterChange}
          options={characterOptions}
          placeholder="全部角色"
        />
        <FilterSelect
          value={countryFilter}
          onChange={onCountryFilterChange}
          options={countryOptions}
          placeholder="全部国家"
        />

        {showNav ? (
          <>
            <Separator orientation="vertical" className="h-4 !self-center" />
            <button
              onClick={onPrev}
              disabled={isFirst}
              className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
                isFirst
                  ? 'text-ink-faint cursor-default'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="上一个事件"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              onClick={onNext}
              disabled={isLast}
              className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
                isLast
                  ? 'text-ink-faint cursor-default'
                  : 'text-ink-muted hover:text-ink'
              }`}
              title="下一个事件"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {density !== 'year' ? (
          <span className="text-xs text-ink-muted border border-line rounded px-2 py-0.5">
            {densityLabel(density)}
          </span>
        ) : null}

        {showZoom ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-ink-faint">百年</span>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={Math.round(zoomRatio * 100)}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              onMouseUp={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
              className="h-8 w-32 cursor-pointer appearance-none bg-transparent
                [&::-webkit-slider-runnable-track]:h-1
                [&::-webkit-slider-runnable-track]:rounded
                [&::-webkit-slider-runnable-track]:bg-line
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:-mt-1
                [&::-webkit-slider-thumb]:h-3.5
                [&::-webkit-slider-thumb]:w-3.5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-ink-muted
                [&::-webkit-slider-thumb]:border
                [&::-webkit-slider-thumb]:border-line
                [&::-moz-range-track]:h-1
                [&::-moz-range-track]:rounded
                [&::-moz-range-track]:bg-line
                [&::-moz-range-thumb]:h-3.5
                [&::-moz-range-thumb]:w-3.5
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-ink-muted
                [&::-moz-range-thumb]:border-line"
            />
            <span className="text-[10px] text-ink-faint">年</span>
          </div>
        ) : null}

        <button
          onClick={onToggleEdit}
          className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
            editMode ? 'text-ink' : 'text-ink-muted hover:text-ink'
          }`}
          title={editMode ? '锁定时间轴' : '解锁时间轴'}
        >
          {editMode ? (
            <LockOpen size={16} strokeWidth={2} />
          ) : (
            <Lock size={16} strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  )
}
