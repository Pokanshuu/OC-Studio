import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
import type { TimelineEvent } from './types'
import { pickTimelineFields } from './types'

export interface TimelineFilter {
  characterId?: number
  countryId?: number
}

function parseYear(time: string): number | null {
  if (!time) return null
  const match = /^\d+/.exec(time)
  return match ? parseInt(match[0], 10) : null
}

export async function getTimelineEvents(
  filter?: TimelineFilter,
): Promise<TimelineEvent[]> {
  const all = await db.events.orderBy('time').toArray()
  let alive = all.filter((e) => !e.deleted)

  if (filter?.characterId !== undefined) {
    alive = alive.filter(
      (e) => Array.isArray(e.characters) && e.characters.includes(filter.characterId!),
    )
  }
  if (filter?.countryId !== undefined) {
    alive = alive.filter(
      (e) => e.countries !== undefined && e.countries.includes(filter.countryId!),
    )
  }

  const withTime = alive.filter((e) => !!e.time)
  const withoutTime = alive.filter((e) => !e.time)

  withTime.sort((a, b) => {
    const aYear = parseYear(a.time) ?? 0
    const bYear = parseYear(b.time) ?? 0
    if (aYear !== bYear) return aYear - bYear
    return a.time.localeCompare(b.time)
  })

  return [
    ...withTime.map(pickTimelineFields),
    ...withoutTime.map(pickTimelineFields),
  ]
}

export async function updateEventTime(id: number, newTime: string): Promise<void> {
  const now = Date.now()
  const existing = await db.events.get(id)
  if (!existing) {
    throw new Error(`Event not found: ${id}`)
  }

  const oldTime = existing.time
  await db.events.update(id, {
    time: newTime,
    updatedAt: now,
    _syncStatus: 'pending',
    _lastModified: now,
  })

  await logOperation('events', id, 'time', oldTime, newTime)
}
