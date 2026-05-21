import type { TimelineEvent } from './types'

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
  if (pxPerYear >= 60) return 'year'
  if (pxPerYear >= 30) return 'decade'
  if (pxPerYear >= 15) return 'half-century'
  return 'century'
}

export function densityLabel(density: TimelineDensity): string {
  if (density === 'year') return '年视图'
  if (density === 'decade') return '十年视图'
  if (density === 'half-century') return '五十年视图'
  return '百年视图'
}

export function parseYear(time: string): number | null {
  if (!time) return null
  const match = /^-?\d+/.exec(time)
  return match ? parseInt(match[0], 10) : null
}

export function buildBuckets(
  timedEvents: TimelineEvent[],
  density: TimelineDensity,
  rangeStart: number,
  totalYears: number,
  pxPerYear: number,
  leftPadding: number,
): TimeBucket[] {
  const bucketSize = density === 'decade' ? 10 : density === 'half-century' ? 50 : 100

  const bucketStart =
    Math.trunc(rangeStart / bucketSize) * bucketSize

  const bucketEnd = rangeStart + totalYears
  const bucketCount =
    Math.ceil((bucketEnd - bucketStart) / bucketSize)

  const buckets: TimeBucket[] = []

  for (let i = 0; i < bucketCount; i++) {
    const startYear = bucketStart + i * bucketSize
    const endYear = startYear + bucketSize - 1

      const bucketEvents = timedEvents
      .filter((e) => {
        const y = parseYear(e.time)
        if (y === null) return false
        const endTime = e.endTime || e.time
        const eventEndYear = parseYear(endTime) ?? y
        return eventEndYear !== null && eventEndYear >= startYear && y <= endYear
      })
      .sort((a, b) => {
        const aY = parseYear(a.time) ?? 0
        const bY = parseYear(b.time) ?? 0
        if (aY !== bY) return aY - bY
        return a.time.localeCompare(b.time)
      })

    if (bucketEvents.length === 0) continue

    buckets.push({
      label:
        density === 'century'
          ? `${startYear}年 - ${endYear}年`
          : `${startYear} - ${endYear}`,
      startYear,
      endYear,
      events: bucketEvents,
      x: leftPadding + (startYear - rangeStart) * pxPerYear,
      width: bucketSize * pxPerYear,
    })
  }

  return buckets
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
