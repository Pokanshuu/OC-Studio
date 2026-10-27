import { MAX_LANES } from './constants'
import type { ComputedEvent, TimelineEvent } from './types'

export type TimelineDensity = 'year' | 'decade' | 'half-century' | 'century'

export interface TimeBucket {
  label: string
  startYear: number
  endYear: number
  events: TimelineEvent[]
  x: number
  width: number
}

export function computeDensity(pxPerYear: number): TimelineDensity {
  if (pxPerYear >= 40) return 'year'
  if (pxPerYear >= 20) return 'decade'
  if (pxPerYear >= 10) return 'half-century'
  return 'century'
}

export function parseYear(time: string): number | null {
  if (!time) return null
  const match = /^-?\d+/.exec(time)
  return match ? parseInt(match[0], 10) : null
}

/**
 * 底色够不够浅 —— 决定「固定底色」色块上的文字该用固定墨色还是固定纸色。
 * 用 WCAG 相对亮度，阈值 0.179 是「黑字对比度高于白字」的分界点。
 */
export function isLightColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return true
  const value = parseInt(match[1], 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((raw) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  return luminance > 0.179
}

export function buildBuckets(
  timedEvents: TimelineEvent[],
  density: TimelineDensity,
  rangeStart: number,
  totalYears: number,
  pxPerYear: number,
  leftPadding: number,
): BucketResult {
  const bucketSize = density === 'decade' ? 10 : density === 'half-century' ? 50 : 100

  // Split: spanning (crosses bucket boundary) vs bucket-fitting
  const spanningEvents: TimelineEvent[] = []
  const bucketEvents: TimelineEvent[] = []

  for (const e of timedEvents) {
    const y = parseYear(e.time)
    if (y === null) continue
    const ey = parseYear(e.endTime || e.time) ?? y
    if (Math.floor(y / bucketSize) !== Math.floor(ey / bucketSize)) {
      spanningEvents.push(e)
    } else {
      bucketEvents.push(e)
    }
  }

  // Compute spanning event positions + lane assignment
  const spanning = spanningEvents
    .map((e) => {
      const y = parseYear(e.time) ?? 0
      const ey = parseYear(e.endTime || e.time) ?? y
      const x = leftPadding + (y - rangeStart) * pxPerYear
      const endX = leftPadding + (ey - rangeStart) * pxPerYear
      return { event: e, x, width: Math.max(endX - x, 8), lane: 0 }
    })
    .sort((a, b) => a.x - b.x)

  const laneEnds: number[] = []
  for (const item of spanning) {
    let lane = 0
    for (; lane < 8; lane++) {
      if (!(lane in laneEnds) || laneEnds[lane] <= item.x) {
        laneEnds[lane] = item.x + item.width
        break
      }
    }
    if (lane >= 8) laneEnds.push(item.x + item.width)
    item.lane = lane
  }

  // Build buckets from non-spanning events only
  const bucketStart =
    Math.trunc(rangeStart / bucketSize) * bucketSize

  const bucketEnd = rangeStart + totalYears
  const bucketCount =
    Math.ceil((bucketEnd - bucketStart) / bucketSize)

  const buckets: TimeBucket[] = []

  for (let i = 0; i < bucketCount; i++) {
    const startYear = bucketStart + i * bucketSize
    const endYear = startYear + bucketSize - 1

    const events = bucketEvents
      .filter((e) => {
        const y = parseYear(e.time)
        if (y === null) return false
        const eventEndYear = parseYear(e.endTime || e.time) ?? y
        return eventEndYear >= startYear && y <= endYear
      })
      .sort((a, b) => {
        const aY = parseYear(a.time) ?? 0
        const bY = parseYear(b.time) ?? 0
        if (aY !== bY) return aY - bY
        return a.time.localeCompare(b.time)
      })

    if (events.length === 0) continue

    buckets.push({
      label:
        density === 'century'
          ? `${startYear}年 - ${endYear}年`
          : `${startYear} - ${endYear}`,
      startYear,
      endYear,
      events,
      x: leftPadding + (startYear - rangeStart) * pxPerYear,
      width: bucketSize * pxPerYear,
    })
  }

  return { buckets, spanning }
}

export interface SpanningEvent {
  event: TimelineEvent
  x: number
  width: number
  lane: number
}

export interface BucketResult {
  buckets: TimeBucket[]
  spanning: SpanningEvent[]
}

export interface YearTick {
  year: number
  x: number
}

export function buildYearTicks(
  density: TimelineDensity,
  rangeStart: number,
  totalYears: number,
  pxPerYear: number,
  leftPadding: number,
): YearTick[] {
  if (density === 'year') {
    const ticks: YearTick[] = []
    for (let i = 0; i < totalYears; i++) {
      ticks.push({
        year: rangeStart + i,
        x: leftPadding + i * pxPerYear,
      })
    }
    return ticks
  }

  const step = density === 'decade' ? 10 : density === 'half-century' ? 50 : 100
  const start =
    Math.trunc(rangeStart / step) * step
  const end = rangeStart + totalYears
  const ticks: YearTick[] = []

  for (let year = start; year <= end; year += step) {
    ticks.push({
      year,
      x: leftPadding + (year - rangeStart) * pxPerYear,
    })
  }

  return ticks
}

export function shiftYear(time: string, delta: number): string {
  if (!time) return String(delta)
  const match = /^(-?\d+)(.*)$/.exec(time)
  if (!match) return String(delta)
  const year = parseInt(match[1], 10) + delta
  return `${year}${match[2]}`
}

export function assignLanes(sortedByX: ComputedEvent[]): ComputedEvent[] {
  const laneEnds: number[] = []
  const laneLastYear: number[] = []
  return sortedByX.map((item) => {
    const nodeStart = item.x
    const nodeEnd = item.x + item.width
    const startYear = parseYear(item.event.time) ?? 0
    let lane = 0
    for (; lane < MAX_LANES; lane++) {
      const canFit = !(lane in laneEnds) || (
        laneEnds[lane] <= nodeStart &&
        Math.abs(startYear - (laneLastYear[lane] ?? Infinity)) >= 4
      )
      if (canFit) {
        laneEnds[lane] = nodeEnd
        laneLastYear[lane] = startYear
        return { ...item, lane }
      }
    }
    laneEnds.push(nodeEnd)
    laneLastYear.push(startYear)
    return { ...item, lane }
  })
}



