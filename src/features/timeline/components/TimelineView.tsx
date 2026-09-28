'use client'

import { useMemo, useCallback, useState, useRef, useEffect, useLayoutEffect, startTransition } from 'react'
import {
  DndContext,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import {
  Lock,
  Circle,
  Pencil,
  Trash2,
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
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { useTimelineEvents } from '../hooks/useTimelineEvents'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { usePeriods } from '@/features/periods'
import { PeriodDialog } from '@/components/shared/PeriodDialog'
import { PERIOD_COLORS } from '@/types'
import { updateEventTime } from '../services'
import type { TimelineFilter } from '../services'
import { parseYear, addOneYear } from '@/features/events/utils'
import {
  computeDensity,
  buildBuckets,
  buildYearTicks,
  type TimelineDensity,
  type YearTick,
} from '../utils'
import type { TimelineEvent } from '../types'
import {
  LEFT_PADDING,
  RIGHT_PADDING,
  TOP_AXIS_Y,
  LANE_HEIGHT,
  YEAR_TICK_HEIGHT,
  MAX_LANES,
  DEFAULT_PX_PER_YEAR,
  MIN_PX_PER_YEAR,
  MAX_PX_PER_YEAR,
  ZOOM_SNAP_STEP,
} from '../constants'
import { assignLanes, shiftYear } from '../utils'
import type { ComputedEvent, FilterOption } from '../types'
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
  const { periods, addPeriod, updatePeriod, removePeriod } = usePeriods()
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<import('@/types').Period | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<import('@/types').Period | null>(null)
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [navEdge, setNavEdge] = useState({ prev: true, next: false })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [dragId, setDragId] = useState<number | null>(null)
  const zoomOffsetRef = useRef(0)
  const zoomOriginRef = useRef(0)
  const oldScaleRef = useRef(0)
  const didZoomRef = useRef(false)
  const zoomRatioRef = useRef(zoomRatio)
  zoomRatioRef.current = zoomRatio
  const pinchRef = useRef<{ active: boolean; initialDistance: number; initialZoomRatio: number }>({
    active: false,
    initialDistance: 0,
    initialZoomRatio: 0,
  })
  const pinchRafRef = useRef(0)
  const latestPinchRef = useRef(0)
  const suppressScrollRef = useRef(false)
  const initialZoomSetRef = useRef(false)

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
  }, [events])

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  const handleDragEnd = useCallback(
    async (e: DragEndEvent, pxPerYear: number) => {
      const { active, delta } = e
      const data = active.data.current as
        | { event: TimelineEvent; startX: number; type: 'move' | 'resize-left' | 'resize-right' }
        | undefined
      if (!data) return

      const deltaYears = Math.round(delta.x / pxPerYear)
      if (deltaYears === 0) return

      if (data.type === 'resize-left') {
        const newTime = shiftYear(data.event.time, deltaYears)
        try {
          await updateEventTime(data.event.id, newTime, data.event.endTime)
          refresh()
        } catch { /* ignore */ }
      } else if (data.type === 'resize-right') {
        const endTime = data.event.endTime || addOneYear(data.event.time)
        const newEndTime = shiftYear(endTime, deltaYears)
        try {
          await updateEventTime(data.event.id, data.event.time, newEndTime)
          refresh()
        } catch { /* ignore */ }
      } else {
        const newTime = shiftYear(data.event.time, deltaYears)
        const newEndTime = data.event.endTime
          ? shiftYear(data.event.endTime, deltaYears)
          : undefined
        try {
          await updateEventTime(data.event.id, newTime, newEndTime)
          refresh()
        } catch { /* ignore */ }
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
    const startYears = withTime.map((e) => parseYear(e.time) ?? 0)
    const endYears = withTime.map((e) => {
      const endTime = e.endTime || addOneYear(e.time)
      return parseYear(endTime) ?? (parseYear(e.time) ?? 0) + 1
    })
    const minYear = Math.min(...startYears)
    const maxYear = Math.max(...startYears, ...endYears)
    return {
      minYear,
      maxYear,
      rangeStart: minYear - 1,
      totalYears: maxYear - minYear + 1 + 1,
    }
  }, [filtered])

  useEffect(() => {
    if (initialZoomSetRef.current) return
    if (!yearRange || containerWidth <= 0) return

    const availableWidth = containerWidth - LEFT_PADDING - RIGHT_PADDING
    if (availableWidth <= 0) return

    const raw = availableWidth / yearRange.totalYears
    const autoPx = Math.max(MIN_PX_PER_YEAR, Math.min(MAX_PX_PER_YEAR, raw))

    if (autoPx < 40) {
      const targetRatio = Math.min(Math.ceil(40 / autoPx), 5.0)
      setZoomRatio(targetRatio)
    }

    initialZoomSetRef.current = true
  }, [containerWidth, yearRange])

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
    return Math.max(Math.round(pxPerYear * 0.2), 0.5)
  }, [density, pxPerYear])

  const displayPxRef = useRef(displayPxPerYear)
  displayPxRef.current = displayPxPerYear

  if (!didZoomRef.current) {
    oldScaleRef.current = displayPxPerYear
  }

  const applyZoom = useCallback((newRatio: number, originX: number) => {
    const container = scrollRef.current
    if (container) {
      zoomOriginRef.current = originX
      zoomOffsetRef.current = container.scrollLeft + originX - LEFT_PADDING
      oldScaleRef.current = displayPxRef.current
      didZoomRef.current = true
    }
    startTransition(() => { setZoomRatio(Math.max(0.1, Math.min(5.0, newRatio))) })
  }, [])

  const nodes = useMemo(() => {
    const withTime = filtered.filter((e) => !!e.time)
    const withoutTime = filtered.filter((e) => !e.time)

    if (density !== 'year' || !yearRange || withTime.length === 0) {
      return { items: [] as ComputedEvent[], withoutTime }
    }

    const raw = withTime.map((e) => {
      const startYear = parseYear(e.time) ?? 0
      const x = LEFT_PADDING + (startYear - yearRange.rangeStart) * pxPerYear
      const effectiveEndTime = e.endTime || addOneYear(e.time)
      const endYear = parseYear(effectiveEndTime) ?? startYear + 1
      const endX = LEFT_PADDING + (endYear - yearRange.rangeStart) * pxPerYear
      const width = Math.max(endX - x, 8)
      return { event: e, x, width, lane: 0 }
    })

    raw.sort((a, b) => a.x - b.x)
    const assigned = assignLanes(raw)

    return { items: assigned, withoutTime }
  }, [filtered, yearRange, pxPerYear, density])

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
    const hasContent = density === 'year' ? nodes.items.length > 0 : (buckets && (buckets.buckets.length > 0 || buckets.spanning.length > 0))
    if (!hasContent) return 0
    const effectivePx = density === 'year' ? pxPerYear : displayPxPerYear
    return LEFT_PADDING + yearRange.totalYears * effectivePx + RIGHT_PADDING
  }, [yearRange, nodes.items.length, density, buckets, pxPerYear, displayPxPerYear])

  const navTargets = useMemo(() => {
    if (density === 'year') return nodes.items
    if (buckets) {
      const bucketTargets = buckets.buckets.map((b) => ({
        event: b.events[0],
        x: b.x,
        lane: 0,
      }))
      const spanningTargets = buckets.spanning.map((s) => ({
        event: s.event,
        x: s.x,
        lane: s.lane,
      }))
      return [...bucketTargets, ...spanningTargets].sort((a, b) => a.x - b.x)
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

      if (suppressScrollRef.current) return

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
      applyZoom(value / 100, scrollRef.current?.clientWidth ? scrollRef.current.clientWidth / 2 : 0)
    },
    [applyZoom],
  )

  const handleZoomCommit = useCallback(
    (value: number) => {
      const px = autoPxPerYear * (value / 100)
      const snapped = Math.round(px / ZOOM_SNAP_STEP) * ZOOM_SNAP_STEP
      const snappedRatio = snapped / autoPxPerYear
      applyZoom(snappedRatio, scrollRef.current?.clientWidth ? scrollRef.current.clientWidth / 2 : 0)
    },
    [autoPxPerYear, applyZoom],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const origin = e.clientX - rect.left
        const newRatio = zoomRatioRef.current - e.deltaY * 0.005
        applyZoom(newRatio, origin)
      } else {
        e.preventDefault()
        el.scrollLeft += e.deltaX + e.deltaY
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [events.length > 0, applyZoom])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const getTouchDistance = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        el.style.touchAction = 'none'
        const dist = getTouchDistance(e.touches)
        latestPinchRef.current = dist
        pinchRef.current = {
          active: true,
          initialDistance: dist,
          initialZoomRatio: zoomRatioRef.current,
        }
        const rect = el.getBoundingClientRect()
        const origin = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        zoomOriginRef.current = origin
        zoomOffsetRef.current = el.scrollLeft + origin - LEFT_PADDING
        oldScaleRef.current = displayPxRef.current
        didZoomRef.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current.active || e.touches.length !== 2) return
      e.preventDefault()
      latestPinchRef.current = getTouchDistance(e.touches)
      const rect = el.getBoundingClientRect()
      zoomOriginRef.current = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      if (pinchRafRef.current) return
      pinchRafRef.current = requestAnimationFrame(() => {
        pinchRafRef.current = 0
        const scale = latestPinchRef.current / pinchRef.current.initialDistance
        const newRatio = pinchRef.current.initialZoomRatio * scale
        applyZoom(newRatio, zoomOriginRef.current)
      })
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current.active = false
        el.style.touchAction = 'pan-x'
      }
      if (e.touches.length === 0) {
        const sl = el.scrollLeft
        const maxScroll = el.scrollWidth - el.clientWidth
        setNavEdge({ prev: sl <= 1, next: sl >= maxScroll - 1 })
        setScrollLeft(sl)
      }
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: false })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd)
    el.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      if (pinchRafRef.current) {
        cancelAnimationFrame(pinchRafRef.current)
        pinchRafRef.current = 0
      }
      el.style.touchAction = ''
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [events.length > 0, applyZoom])

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const oldScale = oldScaleRef.current
    oldScaleRef.current = displayPxPerYear
    didZoomRef.current = false
    if (oldScale === displayPxPerYear) return

    const newScroll = LEFT_PADDING + zoomOffsetRef.current * (displayPxPerYear / oldScale) - zoomOriginRef.current
    suppressScrollRef.current = true
    container.scrollLeft = newScroll
    requestAnimationFrame(() => { suppressScrollRef.current = false })
  }, [displayPxPerYear])

  const handlePeriodSave = useCallback(async (data: { name: string; startTime: string; endTime: string; color: string }) => {
    if (editingPeriod?.id) {
      await updatePeriod(editingPeriod.id, data)
    } else {
      await addPeriod(data)
    }
  }, [editingPeriod, addPeriod, updatePeriod])

  const handlePeriodDelete = useCallback(async () => {
    if (deleteTarget?.id) {
      await removePeriod(deleteTarget.id)
    }
    setDeleteTarget(null)
  }, [deleteTarget, removePeriod])

  const openPeriodActionSheet = useCallback((period: import('@/types').Period) => {
    setActionSheet({
      open: true,
      title: period.name,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => { setEditingPeriod(period); setPeriodDialogOpen(true) } },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(period) },
      ],
    })
  }, [])

  const periodLanes = useMemo(() => {
    if (periods.length === 0) return { rows: [] as { period: import('@/types').Period; row: number }[], maxRows: 0 }
    const sorted = [...periods].sort((a, b) => {
      const aY = parseYear(a.startTime) ?? 0
      const bY = parseYear(b.startTime) ?? 0
      if (aY !== bY) return aY - bY
      return a.startTime.localeCompare(b.startTime)
    })
    const laneEnds: number[] = []
    const rows: { period: import('@/types').Period; row: number }[] = []
    let maxRow = 0
    for (const p of sorted) {
      const s = parseYear(p.startTime) ?? 0
      let row = 0
      for (; row < MAX_LANES; row++) {
        if (!(row in laneEnds) || laneEnds[row] <= s) {
          laneEnds[row] = parseYear(p.endTime) ?? s
          if (row > maxRow) maxRow = row
          rows.push({ period: p, row })
          break
        }
      }
    }
    return { rows, maxRows: maxRow + 1 }
  }, [periods])

  const periodsHeight = periodLanes.maxRows > 0 ? periodLanes.maxRows * 28 + 4 : 0
  const axisY = TOP_AXIS_Y + periodsHeight + 4

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
        onAddPeriod={() => { setEditingPeriod(undefined); setPeriodDialogOpen(true) }}
      />
      <div className="max-md:h-10 flex-shrink-0" />
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
        onAddPeriod={() => { setEditingPeriod(undefined); setPeriodDialogOpen(true) }}
      />
      <div className="max-md:h-10 flex-shrink-0" />
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
  const hasContent = density === 'year' ? nodes.items.length > 0 : (buckets && (buckets.buckets.length > 0 || buckets.spanning.length > 0))

  return (
    <div className="flex flex-col h-full">
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
        onAddPeriod={() => { setEditingPeriod(undefined); setPeriodDialogOpen(true) }}
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
                const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
                const hex = PERIOD_COLORS.find(c => c.value === period.color)?.hex ?? '#F3EFE9'
                const hexDark = PERIOD_COLORS.find(c => c.value === period.color)?.hexDark ?? hex
                return (
                  <PeriodBar
                    key={period.id}
                    period={period}
                    left={left}
                    width={w}
                    isDark={isDark}
                    hex={hex}
                    hexDark={hexDark}
                    row={row}
                    isMobile={isMobile}
                    onEdit={() => { setEditingPeriod(period); setPeriodDialogOpen(true) }}
                    onDelete={() => setDeleteTarget(period)}
                    onLongPress={() => openPeriodActionSheet(period)}
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
                onDragStart={(e) => {
                  setDragId(e.active.data.current?.event?.id as number | undefined ?? null)
                }}
                onDragEnd={(e) => {
                  setDragId(null)
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
        key={editingPeriod?.id ?? 'new'}
        open={periodDialogOpen}
        period={editingPeriod}
        onSave={handlePeriodSave}
        onClose={() => { setPeriodDialogOpen(false); setEditingPeriod(undefined) }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除时期</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除「{deleteTarget?.name}」？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handlePeriodDelete} className="bg-transparent border border-error text-error hover:bg-red-50">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileActionSheet
        open={actionSheet.open}
        onClose={() => setActionSheet((prev) => ({ ...prev, open: false }))}
        title={actionSheet.title}
        actions={actionSheet.actions}
      />
    </div>
  )
}


