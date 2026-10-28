'use client'

import { useMemo } from 'react'
import { parseYear, addOneYear } from '@/features/events/utils'
import type { Period } from '@/types'
import {
  MAX_LANES,
  DEFAULT_PX_PER_YEAR,
  MIN_PX_PER_YEAR,
  MAX_PX_PER_YEAR,
  LEFT_PADDING,
  RIGHT_PADDING,
  TOP_AXIS_Y,
} from '../constants'
import {
  computeDensity,
  buildBuckets,
  buildYearTicks,
  assignLanes,
  type TimelineDensity,
  type YearTick,
} from '../utils'
import type { ComputedEvent, TimelineEvent } from '../types'

/**
 * 时间线的**纯派生层**：事件 → 坐标 → 泳道、年份刻度、聚合桶、时期行。
 * 无状态、无 DOM、无副作用 —— 只有 useMemo，因此可以独立测试与推理。
 * 视口（缩放/滚动/捏合）与交互在 useTimelineViewport 中。
 */
export function useTimelineLayout({
  events,
  filterMajor,
  periods,
  containerWidth,
  zoomRatio,
}: {
  events: TimelineEvent[]
  filterMajor: boolean
  periods: Period[]
  containerWidth: number
  zoomRatio: number
}) {
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
    // 聚合桶只收真事件：出生节点不是「事件」，混进桶里点开就跳错地方了
    const withTime = filtered.filter((e) => !!e.time && e.kind !== 'birth')
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
  return {
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
  }
}
