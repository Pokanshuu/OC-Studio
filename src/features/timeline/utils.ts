import type { TimelineEvent } from './types'

export type TimelineDensity = 'year' | 'decade' | 'century'

export interface TimeBucket {
  label: string
  startYear: number
  endYear: number
  events: TimelineEvent[]
  x: number
  width: number
}

export function computeDensity(pxPerYear: number): TimelineDensity {
  if (pxPerYear >= 50) return 'year'
  if (pxPerYear >= 15) return 'decade'
  return 'century'
}

export function densityLabel(density: TimelineDensity): string {
  if (density === 'year') return '年视图'
  if (density === 'decade') return '十年视图'
  return '百年视图'
}

export function parseYear(time: string): number | null {
  if (!time) return null
  const match = /^\d+/.exec(time)
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
  const bucketSize = density === 'decade' ? 10 : 100

  const bucketStart =
    Math.floor(rangeStart / bucketSize) * bucketSize

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
        return y !== null && y >= startYear && y <= endYear
      })
      .sort((a, b) => a.time.localeCompare(b.time))

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

  const step = density === 'decade' ? 10 : 100
  const start =
    Math.floor(rangeStart / step) * step
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
