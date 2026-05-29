'use client'

import { memo, useMemo, useCallback, useState, useRef, useEffect, useLayoutEffect, startTransition } from 'react'
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
  Plus,
  X,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
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
import { useLongPress } from '@/lib/useLongPress'
import { MobileActionSheet, type ActionItem } from '@/components/shared/MobileActionSheet'
import { useTimelineEvents } from '../hooks/useTimelineEvents'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { usePeriods } from '@/features/periods'
import { PeriodDialog } from '@/components/shared/PeriodDialog'
import { MobileFilterBar } from '@/components/layout/MobileFilterBar'
import { PERIOD_COLORS } from '@/types'
import { updateEventTime } from '../services'
import type { TimelineFilter } from '../services'
import { parseYear, addOneYear } from '@/features/events/utils'
import {
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
const minBarWidth = 80

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
  width: number
  lane: number
}

function assignLanes(sortedByX: ComputedEvent[]): ComputedEvent[] {
  const laneEnds: number[] = []
  return sortedByX.map((item) => {
    const nodeStart = item.x
    const nodeEnd = item.x + item.width
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
  width,
  onSelect,
}: {
  event: TimelineEvent
  x: number
  y: number
  width: number
  onSelect: (id: number) => void
}) {
  const bodyDrag = useDraggable({
    id: `event-body-${event.id}`,
    data: { event, startX: x, type: 'move' },
  })

  const leftDrag = useDraggable({
    id: `event-left-${event.id}`,
    data: { event, startX: x, type: 'resize-left' },
  })

  const rightDrag = useDraggable({
    id: `event-right-${event.id}`,
    data: { event, startX: x, type: 'resize-right' },
  })

  const dragDelta = (bodyDrag.transform || leftDrag.transform || rightDrag.transform)?.x ?? 0
  const isRange = !!event.endTime
  const barWidth = isRange ? Math.max(width, minBarWidth) : undefined

  return (
    <div
      ref={bodyDrag.setNodeRef}
      className={`touch-feedback absolute flex items-center gap-1.5 rounded-md border border-line bg-paper-card px-2 py-1 text-sm text-ink transition-colors hover:border-line-hover ${isRange ? 'bg-ink-muted/10' : ''}`}
      style={{
        left: x + dragDelta,
        top: y,
        width: barWidth,
        height: 32,
      }}
      {...bodyDrag.listeners}
      {...bodyDrag.attributes}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(event.id)
      }}
      title={event.summary || event.title}
    >
      {event.isMajor ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-error" />
      ) : null}
      <span className="truncate sticky left-2">{event.title}</span>
      {isRange ? (
        <>
          <div
            ref={leftDrag.setNodeRef}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
            {...leftDrag.listeners}
            {...leftDrag.attributes}
          />
          <div
            ref={rightDrag.setNodeRef}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
            {...rightDrag.listeners}
            {...rightDrag.attributes}
          />
        </>
      ) : null}
    </div>
  )
})

const StaticNode = memo(function StaticNode({
  event,
  x,
  y,
  width,
  onSelect,
}: {
  event: TimelineEvent
  x: number
  y: number
  width: number
  onSelect: (id: number) => void
}) {
  const isRange = !!event.endTime
  return (
    <div
      className={`touch-feedback absolute flex items-center gap-1.5 rounded-md border border-line bg-paper-card px-2 py-1 text-sm text-ink transition-colors hover:border-line-hover ${isRange ? 'bg-ink-muted/10' : ''}`}
      style={{
        left: x,
        top: y,
        width: isRange ? width : undefined,
        height: 32,
      }}
      title={event.summary || event.title}
      onClick={() => onSelect(event.id)}
    >
      {event.isMajor ? (
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-error" />
      ) : null}
      <span className="truncate sticky left-2">{event.title}</span>
    </div>
  )
})

function PeriodBar({
  period,
  left,
  width,
  isDark,
  hex,
  hexDark,
  row,
  isMobile,
  onEdit,
  onDelete,
  onLongPress,
}: {
  period: import('@/types').Period
  left: number
  width: number
  isDark: boolean
  hex: string
  hexDark: string
  row: number
  isMobile: boolean
  onEdit: () => void
  onDelete: () => void
  onLongPress?: () => void
}) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div
      className="touch-feedback absolute group flex items-center rounded"
      style={{
        left,
        top: row * 28,
        width,
        height: 24,
        backgroundColor: isDark ? hexDark : hex,
      }}
      onClick={onEdit}
      title={period.name}
      {...longPress}
    >
      <span className="truncate sticky left-2 px-2 text-xs text-ink font-medium leading-4">
        {period.name}
      </span>
      {!isMobile ? (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-paper-card border border-line text-ink-muted group-hover:flex hover:text-error"
        >
          <X size={10} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}

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
        className="touch-feedback flex md:h-9 h-7 items-center gap-1 rounded border border-line bg-paper-card/60 md:px-3 px-2 md:text-sm text-[11px] text-ink transition-colors hover:border-line-hover"
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
  axisY,
  spanningOffset = 0,
}: {
  buckets: TimeBucket[]
  onSelectEvent: (id: number) => void
  axisY: number
  spanningOffset?: number
}) {
  const bucketTop = axisY + 24 + spanningOffset
  return (
    <>
      {buckets.map((bucket) => (
        <div
          key={bucket.startYear}
          className="absolute rounded-md border border-line bg-paper-card py-1.5 px-2"
          style={{
            left: bucket.x,
            top: bucketTop,
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
              className="flex h-6 w-full items-center gap-1 rounded px-1 text-xs text-ink-muted transition-colors hover:text-ink hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/8 dark:active:bg-white/8 truncate"
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
              {event.endTime ? (
                <span className="shrink-0 text-[10px] text-ink-faint ml-1">
                  {event.time}~{event.endTime}
                </span>
              ) : null}
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
  }, [events.length > 0])

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
  }, [events.length > 0])

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
                className="touch-feedback flex items-center gap-1.5 rounded border border-line bg-paper-card px-2 py-1 text-sm text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
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
  onAddPeriod,
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
  onAddPeriod?: () => void
}) {
  return (
    <>
      {/* Desktop toolbar */}
      <div className="max-md:hidden flex items-center justify-between sticky top-0 z-10 border-b border-line px-6 py-3 h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h2 className="text-lg text-ink font-serif font-bold">时间线</h2>
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
          <FilterSelect value={characterFilter} onChange={onCharacterFilterChange} options={characterOptions} placeholder="全部角色" />
          <FilterSelect value={countryFilter} onChange={onCountryFilterChange} options={countryOptions} placeholder="全部国家" />
          {showNav ? (
            <>
              <Separator orientation="vertical" className="h-4 !self-center" />
              <button onClick={onPrev} disabled={isFirst}
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${isFirst ? 'text-ink-faint cursor-default' : 'text-ink-muted hover:text-ink'}`}
                title="上一个事件"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <button onClick={onNext} disabled={isLast}
                className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${isLast ? 'text-ink-faint cursor-default' : 'text-ink-muted hover:text-ink'}`}
                title="下一个事件"
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </>
          ) : null}
          {onAddPeriod ? (
            <>
              <Separator orientation="vertical" className="h-4 !self-center" />
              <button onClick={onAddPeriod}
                className="flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink"
                title="添加时期"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {showZoom ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink-faint">百年</span>
              <input type="range" min={10} max={500} step={1}
                value={Math.round(zoomRatio * 100)}
                onChange={(e) => onZoomChange(Number(e.target.value))}
                onMouseUp={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => onZoomCommit(Number((e.target as HTMLInputElement).value))}
                className="h-8 w-32 cursor-pointer appearance-none bg-transparent
                  [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded [&::-webkit-slider-runnable-track]:bg-line
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5
                  [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted
                  [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line
                  [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded [&::-moz-range-track]:bg-line
                  [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0"
              />
              <span className="text-[10px] text-ink-faint">年</span>
            </div>
          ) : null}
          <button onClick={onToggleEdit}
            className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${editMode ? 'text-ink' : 'text-ink-muted hover:text-ink'}`}
            title={editMode ? '锁定时间轴' : '解锁时间轴'}
          >
            {editMode ? <LockOpen size={16} strokeWidth={2} /> : <Lock size={16} strokeWidth={2} />}
          </button>
        </div>
      </div>

      {/* Mobile filter bar */}
      <MobileFilterBar>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterMajor(true)}
            className={`touch-feedback h-7 rounded border px-1.5 text-[11px] transition-colors ${filterMajor ? 'border-line-hover bg-paper-card/60 text-ink' : 'border-line text-ink-muted hover:text-ink'}`}
          >
            大事表
          </button>
          <button
            onClick={() => setFilterMajor(false)}
            className={`touch-feedback h-7 rounded border px-1.5 text-[11px] transition-colors ${!filterMajor ? 'border-line-hover bg-paper-card/60 text-ink' : 'border-line text-ink-muted hover:text-ink'}`}
          >
            全部事件
          </button>
          <FilterSelect value={characterFilter} onChange={onCharacterFilterChange} options={characterOptions} placeholder="全部角色" />
          <FilterSelect value={countryFilter} onChange={onCountryFilterChange} options={countryOptions} placeholder="全部国家" />
        </div>
        {onAddPeriod ? (
          <button onClick={onAddPeriod}
            className="flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink active:bg-black/8 dark:active:bg-white/8"
            title="添加时期"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        ) : null}
      </MobileFilterBar>
    </>
  )
}
