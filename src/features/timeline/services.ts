import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { notifyDataUpdated } from '@/lib/data-events'
import type { Event } from '@/types'
import type { TimelineEvent } from './types'
import { pickTimelineFields } from './types'

export interface TimelineFilter {
  characterId?: number
  countryId?: number
}

function parseYear(time: string): number | null {
  if (!time) return null
  const match = /^-?\d+/.exec(time)
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

  const events: TimelineEvent[] = [
    ...withTime.map(pickTimelineFields),
    ...withoutTime.map(pickTimelineFields),
  ]

  // 角色生日合成「出生」节点：只有**年份能读出来**才上时间线（「不详」这类自由文本不上）。
  const births = await getBirthNodes(filter)
  if (births.length === 0) return events

  return [...events, ...births].sort((a, b) => {
    const aYear = parseYear(a.time) ?? 0
    const bYear = parseYear(b.time) ?? 0
    return aYear - bYear
  })
}

/**
 * 出生节点。id 取负数，与事件 id 分属两个空间 ——
 * 时间线里所有回调都只认 id，负数前缀是「这是角色，不是事件」的唯一标记。
 * 按国家筛选时不掺进来：出生没有国家归属。
 */
async function getBirthNodes(filter?: TimelineFilter): Promise<TimelineEvent[]> {
  if (filter?.countryId !== undefined) return []

  const characters = await db.characters.toArray()
  return characters
    .filter((c) => !c.deleted && parseYear(c.birthday) !== null)
    .filter((c) => filter?.characterId === undefined || c.id === filter.characterId)
    .map((c) => ({
      id: -c.id,
      title: `${c.name}出生`,
      time: c.birthday,
      summary: c.birthday,
      isMajor: true,
      kind: 'birth' as const,
      characterId: c.id,
    }))
}

export async function updateEventTime(
  id: number,
  newTime: string,
  newEndTime?: string,
): Promise<void> {
  const now = Date.now()
  const existing = await db.events.get(id)
  if (!existing) {
    throw new Error(`Event not found: ${id}`)
  }

  const oldTime = existing.time
  await db.events.update(id, {
    time: newTime,
    endTime: newEndTime,
    updatedAt: now,
    ...pendingStamp(now),
  } as Partial<Event>)

  await logOperation('events', id, 'time', oldTime, newTime)
  notifyDataUpdated()
}
