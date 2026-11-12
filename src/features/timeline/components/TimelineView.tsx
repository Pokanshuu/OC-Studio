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
import { useSettings } from '@/lib/settings'
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
} from '../constants'
import type { FilterOption } from '../types'
import { useTimelineLayout } from '../hooks/useTimelineLayout'
import { useTimelineViewport } from '../hooks/useTimelineViewport'
import { useTimelineContainerWidth } from '../hooks/useTimelineContainerWidth'
import { useTimelineDrag } from '../hooks/useTimelineDrag'
import { usePeriodEditor } from '../hooks/usePeriodEditor'
import { DraggableNode, StaticNode } from './EventNode'
import { ParticipantTracks, TRACK_ROW_HEIGHT, type ParticipantTrackRow } from './ParticipantTracks'
import { PeriodBar } from './PeriodBar'
import { EmptyTimeline } from './EmptyTimeline'
import { BucketView } from './BucketView'
import { TimelineToolbar } from './TimelineToolbar'
import { useExportCenter } from '@/components/shared/export/ExportCenterHost'

interface TimelineViewProps {
  onSelectEvent: (id: number) => void
  /** 打开角色（出生节点点进来时用） */
  onSelectCharacter: (id: number) => void
  /** 打开国家（建立 / 结束时间节点点进来时用） */
  onSelectCountry?: (id: number) => void
}

export function TimelineView({ onSelectEvent, onSelectCharacter, onSelectCountry }: TimelineViewProps) {
  const { isMobile } = useDevice()
  const { settings, updateSetting } = useSettings()
  const [editMode, setEditMode] = useState(false)
  const openExportCenter = useExportCenter()
  const [filterMajor, setFilterMajor] = useState(false)
  const [characterFilter, setCharacterFilter] = useState<number | 'all'>('all')
  const [countryFilter, setCountryFilter] = useState<number | 'all'>('all')
  const [zoomRatio, setZoomRatio] = useState(1.0)
  /** 悬停的事件关系线：只显示这一条的关系名 */
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null)
  /** 选中事件：点参与条只选中并聚焦，不直接跳走 */
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  /** 角色多于 8 个时默认折叠成一行，点开才铺满 */
  const [showAllCharacterTracks, setShowAllCharacterTracks] = useState(false)

  const detail = settings.timelineDetail === 'detailed'
  const showTracks = settings.timelineShowTracks

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

  /**
   * 伪节点分发：出生节点打开角色、国家节点打开国家，其余是真事件。
   * 以前靠 id 负数判断出生；国家节点也负数，所以必须看 `kind`。
   */
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events])
  const handleSelect = useCallback(
    (id: number) => {
      const event = eventById.get(id)
      if (event?.kind === 'birth' && event.characterId !== undefined) {
        onSelectCharacter(event.characterId)
        return
      }
      if (event?.kind === 'country' && event.countryId !== undefined) {
        onSelectCountry?.(event.countryId)
        return
      }
      onSelectEvent(id)
    },
    [eventById, onSelectCharacter, onSelectCountry, onSelectEvent],
  )

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

  /**
   * 事件之间的关系线（`docs/时间线.md` §4）：只画**当前视图里都看得见**的一对；
   * 目标被筛掉就不画，免得线指向空气。正交折线：水平 → 垂直 → 水平。
   */
  const connections = useMemo(() => {
    if (density !== 'year') return [] as { id: string; d: string; relation: string; labelX: number; labelY: number; fromId: number; toId: number }[]
    const byId = new Map(nodes.items.map((item) => [item.event.id, item]))
    const seen = new Set<string>()
    const out: { id: string; d: string; relation: string; labelX: number; labelY: number; fromId: number; toId: number }[] = []
    for (const item of nodes.items) {
      if (item.event.kind !== undefined) continue
      for (const rel of item.event.relations ?? []) {
        const target = byId.get(rel.targetId)
        if (!target || target.event.kind !== undefined || target.event.id === item.event.id) continue
        const pair = item.event.id < target.event.id
          ? `${item.event.id}-${target.event.id}`
          : `${target.event.id}-${item.event.id}`
        if (seen.has(pair)) continue
        seen.add(pair)
        const sy = axisY + 24 + item.lane * LANE_HEIGHT + 16
        const ty = axisY + 24 + target.lane * LANE_HEIGHT + 16
        const forward = target.x >= item.x
        const sx = forward ? item.x + Math.max(item.width, 24) : item.x
        const tx = forward ? target.x : target.x + Math.max(target.width, 24)
        const midX = (sx + tx) / 2
        out.push({
          id: pair,
          d: `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`,
          relation: rel.relation,
          labelX: midX,
          labelY: (sy + ty) / 2,
          fromId: item.event.id,
          toId: target.event.id,
        })
      }
    }
    return out
  }, [density, nodes.items, axisY])

  const activeConnection = hoveredConnection
    ? connections.find((connection) => connection.id === hoveredConnection) ?? null
    : null

  /** 选中事件后，与它相连的线换墨色并露出关系名；悬停的那条优先叠上去。 */
  const labeledConnections = useMemo(() => {
    const out = new Map<string, (typeof connections)[number]>()
    if (selectedEventId !== null) {
      for (const connection of connections) {
        if (connection.fromId === selectedEventId || connection.toId === selectedEventId) {
          out.set(connection.id, connection)
        }
      }
    }
    if (activeConnection) out.set(activeConnection.id, activeConnection)
    return [...out.values()]
  }, [connections, selectedEventId, activeConnection])

  /** 点参与条：选中事件，把事件块横向滚进视野（不打开编辑器） */
  const focusEvent = useCallback(
    (id: number) => {
      setSelectedEventId(id)
      const item = nodes.items.find((entry) => entry.event.id === id)
      const scroller = scrollRef.current
      if (!item || !scroller) return
      const left = item.x - (scroller.clientWidth - Math.max(item.width, 80)) / 2
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' })
    },
    [nodes.items],
  )

  /**
   * 参与者轨道（`docs/时间线.md` §3）：从事件的 `characters[]` / `countries[]` 算，
   * 不引入“主参与”字段。没有参与者的真事件进「未归属」兜底，宁可丑也不能丢事件。
   */
  const trackRows = useMemo<ParticipantTrackRow[]>(() => {
    if (!showTracks || density !== 'year') return []
    const items = nodes.items.filter((item) => item.event.kind === undefined)
    const charNames = new Map<number, string>()
    for (const character of characters) {
      if (character.id !== undefined) charNames.set(character.id, character.name)
    }
    const countryNames = new Map<number, string>()
    for (const country of countries) {
      if (country.id !== undefined) countryNames.set(country.id, country.name)
    }

    const charBuckets = new Map<number, ParticipantTrackRow['items']>()
    const countryBuckets = new Map<number, ParticipantTrackRow['items']>()
    const unassigned: ParticipantTrackRow['items'] = []

    for (const item of items) {
      const entry = { event: item.event, x: item.x, width: item.width }
      const charIds = (item.event.characters ?? []).filter((id) => charNames.has(id))
      const countryIds = (item.event.countries ?? []).filter((id) => countryNames.has(id))
      if (charIds.length === 0 && countryIds.length === 0) unassigned.push(entry)
      for (const id of charIds) {
        const list = charBuckets.get(id)
        if (list) list.push(entry)
        else charBuckets.set(id, [entry])
      }
      for (const id of countryIds) {
        const list = countryBuckets.get(id)
        if (list) list.push(entry)
        else countryBuckets.set(id, [entry])
      }
    }

    const rows: ParticipantTrackRow[] = []
    const characterRows: ParticipantTrackRow[] = []
    for (const [id, name] of charNames) {
      const bucket = charBuckets.get(id)
      if (bucket && bucket.length > 0) {
        characterRows.push({ key: `char-${id}`, label: name, kind: 'character', items: bucket })
      }
    }
    if (characterRows.length > 8 && !showAllCharacterTracks) {
      rows.push({
        key: 'chars-more',
        label: `角色（${characterRows.length}）`,
        kind: 'more',
        items: [],
        expanded: false,
      })
    } else {
      rows.push(...characterRows)
      if (characterRows.length > 8) {
        rows.push({ key: 'chars-more', label: '收起角色', kind: 'more', items: [], expanded: true })
      }
    }
    for (const [id, name] of countryNames) {
      const bucket = countryBuckets.get(id)
      if (bucket && bucket.length > 0) rows.push({ key: `country-${id}`, label: name, kind: 'country', items: bucket })
    }
    if (unassigned.length > 0) {
      rows.push({ key: 'unassigned', label: '未归属', kind: 'unassigned', items: unassigned })
    }
    return rows
  }, [density, showTracks, nodes.items, characters, countries, showAllCharacterTracks])

  /** 详模式第二行：时间 · 参与者名字（最多三个，多了显示「等」）。 */
  const participantsByEvent = useMemo(() => {
    const names = new Map<number, string>()
    for (const character of characters) {
      if (character.id !== undefined && character.name.trim() !== '') names.set(character.id, character.name)
    }
    for (const country of countries) {
      if (country.id !== undefined && country.name.trim() !== '') names.set(country.id, country.name)
    }
    const out = new Map<number, string>()
    for (const item of nodes.items) {
      if (item.event.kind !== undefined) continue
      const list = [...(item.event.characters ?? []), ...(item.event.countries ?? [])]
        .map((id) => names.get(id))
        .filter((name): name is string => Boolean(name))
      if (list.length === 0) continue
      out.set(item.event.id, list.slice(0, 3).join('、') + (list.length > 3 ? ' 等' : ''))
    }
    return out
  }, [nodes.items, characters, countries])

  const maxLane = nodes.items.reduce((max, item) => Math.max(max, item.lane), -1)
  const eventBottom = axisY + 24 + (maxLane + 1) * LANE_HEIGHT
  const tracksTop = eventBottom + 12
  const tracksHeight = trackRows.length * TRACK_ROW_HEIGHT
  const canvasHeight = Math.max(300, eventBottom + (trackRows.length > 0 ? 12 + tracksHeight : 0) + 32)

  // 工具栏 props 只写一次：三个渲染分支共用同一份，避免三处重复
  const toolbarProps = {
    filterMajor,
    setFilterMajor,
    editMode,
    onToggleEdit: toggleEditMode,
    // 简 / 详与参与者轨道是**这张图自己的显示档位**，放在工具栏里，不占全局「视图」菜单
    detail,
    onDetailChange: (value: 'simple' | 'detailed') => updateSetting('timelineDetail', value),
    showTracks,
    onToggleTracks: () => updateSetting('timelineShowTracks', !showTracks),
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
    onExport: () => openExportCenter({ tab: 'timeline' }),
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

  /**
   * 一条事件都没有 —— 但要分清「库里真的没有」和「被筛选筛没了」。
   *
   * 角色 / 国家的筛选是**在服务端查询时就带上**的，所以筛空时 `events` 本身就是空数组，
   * 以前直接落到 EmptyTimeline 的「暂无事件，请先创建事件后查看时间线」——
   * 用户明明有事件，只是筛掉了，却被告知去新建一条。
   */
  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {emptyToolbar}
        <div className="max-md:h-10 flex-shrink-0" />
        {isFiltering ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="text-sm text-ink-muted">没有符合筛选条件的事件</p>
            <button
              type="button"
              className="text-[12px] text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
              onClick={() => {
                setCharacterFilter('all')
                setCountryFilter('all')
                setFilterMajor(false)
              }}
            >
              清除筛选
            </button>
          </div>
        ) : (
          <EmptyTimeline />
        )}
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
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedEventId(null)
          }}
          style={{
            width: totalWidth > 0 ? totalWidth : '100%',
            minHeight: canvasHeight,
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
                const hex = PERIOD_COLORS.find(c => c.value === period.color)?.hex ?? PERIOD_COLORS[0].hex
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

          {/* 事件之间：只在两端都可见时画一条正交线；关系名只在悬停这条线时出现 */}
          {connections.length > 0 ? (
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={totalWidth > 0 ? totalWidth : '100%'}
              height={canvasHeight}
              aria-hidden
            >
              {connections.map((connection) => {
                const selected =
                  selectedEventId !== null &&
                  (connection.fromId === selectedEventId || connection.toId === selectedEventId)
                return (
                  <g key={connection.id}>
                    <path
                      d={connection.d}
                      fill="none"
                      stroke={selected ? 'var(--color-ink)' : 'var(--color-line-hover)'}
                      strokeWidth={1}
                    >
                      <title>{connection.relation}</title>
                    </path>
                    {/* 透明加粗命中区：线本身只有 1px，直接悬停太难 */}
                    <path
                      d={connection.d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ pointerEvents: 'stroke' }}
                      onMouseEnter={() => setHoveredConnection(connection.id)}
                      onMouseLeave={() => setHoveredConnection(null)}
                    />
                  </g>
                )
              })}
            </svg>
          ) : null}

          {labeledConnections.map((connection) => (
            <div
              key={connection.id}
              className="pointer-events-none absolute z-20 whitespace-nowrap rounded-item border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-muted"
              style={{
                left: connection.labelX,
                top: connection.labelY,
                transform: 'translate(-50%, calc(-100% - 4px))',
              }}
            >
              {connection.relation}
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
                {nodes.items.map((item) =>
                  item.event.kind !== undefined ? (
                    <StaticNode
                      key={item.event.id}
                      event={item.event}
                      x={item.x}
                      y={axisY + 24 + item.lane * LANE_HEIGHT}
                      width={item.width}
                      onSelect={handleSelect}
                    />
                  ) : (
                    <DraggableNode
                      key={item.event.id}
                      event={item.event}
                      x={item.x}
                      y={axisY + 24 + item.lane * LANE_HEIGHT}
                      width={item.width}
                      onSelect={handleSelect}
                      detail={detail}
                      participants={participantsByEvent.get(item.event.id)}
                      selected={selectedEventId === item.event.id}
                    />
                  ),
                )}
              </DndContext>
            ) : (
              nodes.items.map((item) => (
                <StaticNode
                  key={item.event.id}
                  event={item.event}
                  x={item.x}
                  y={axisY + 24 + item.lane * LANE_HEIGHT}
                  width={item.width}
                  onSelect={handleSelect}
                  detail={detail}
                  participants={participantsByEvent.get(item.event.id)}
                  selected={selectedEventId === item.event.id}
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
                    onSelect={handleSelect}
                  />
                ))}
                <BucketView
                  buckets={bucketList}
                  onSelectEvent={handleSelect}
                  axisY={axisY}
                  spanningOffset={spanningOffset}
                />
              </>
            )
          })() : null}

          {/* 参与者轨道：与主轴共用 x 坐标，点条打开事件 */}
          {!isMobile && density === 'year' && trackRows.length > 0 ? (
            <ParticipantTracks
              rows={trackRows}
              top={tracksTop}
              onSelect={focusEvent}
              onOpen={handleSelect}
              selectedEventId={selectedEventId}
              onToggleMore={() => setShowAllCharacterTracks((previous) => !previous)}
            />
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
                onClick={() => handleSelect(e.id)}
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
            <AlertDialogAction onClick={periodEditor.handlePeriodDelete}>
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

