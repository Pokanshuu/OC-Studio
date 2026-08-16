import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import type { Event } from '@/types'
import type { EventFormData } from './types'

const TABLE = 'events'

function buildDefaultEvent(data: EventFormData, overrides: Partial<Event> = {}): Omit<Event, 'id'> {
  const now = Date.now()
  return {
    title: data.title,
    time: data.time,
    endTime: data.endTime,
    location: data.location,
    summary: data.summary,
    isMajor: data.isMajor,
    content: data.content ?? '',
    characters: data.characters ?? [],
    countries: data.countries ?? [],
    parentEventId: null,
    relations: [],
    tags: data.tags ?? [],
    images: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
    ...overrides,
  }
}

export async function getEvents(): Promise<Event[]> {
  const all = await db.events.orderBy('time').toArray()
  return all.filter((e) => !e.deleted)
}

export async function getEvent(id: number): Promise<Event | undefined> {
  return db.events.get(id)
}

export async function createEvent(data: EventFormData): Promise<number> {
  const event = buildDefaultEvent(data)
  const id = await db.events.add(event as Event)

  await logOperation(TABLE, id, 'title', '', data.title)
  await logOperation(TABLE, id, 'time', '', data.time)
  if (data.location) {
    await logOperation(TABLE, id, 'location', '', data.location)
  }
  if (data.summary) {
    await logOperation(TABLE, id, 'summary', '', data.summary)
  }

  return id
}

export async function updateEvent(id: number, data: Partial<EventFormData>): Promise<void> {
  const existing = await db.events.get(id)
  if (!existing) {
    throw new Error(`Event not found: ${id}`)
  }

  const now = Date.now()
  const updates: Partial<Event> = {
    updatedAt: now,
    ...pendingStamp(now),
  }

  type FieldKey = keyof EventFormData
  const fields: FieldKey[] = ['title', 'time', 'endTime', 'location', 'summary', 'isMajor', 'content', 'headerUrl']

  for (const field of fields) {
    const newValue = data[field]
    if (newValue !== undefined) {
      const oldValue = existing[field] ?? ''
      ;(updates as Record<string, unknown>)[field] = newValue
      await logOperation(TABLE, id, field, String(oldValue), String(newValue))
    }
  }

  if (data.characters !== undefined) {
    ;(updates as Record<string, unknown>).characters = data.characters
    await logOperation(
      TABLE,
      id,
      'characters',
      JSON.stringify(existing.characters),
      JSON.stringify(data.characters),
    )
  }

  if (data.countries !== undefined) {
    ;(updates as Record<string, unknown>).countries = data.countries
    await logOperation(
      TABLE,
      id,
      'countries',
      JSON.stringify(existing.countries ?? []),
      JSON.stringify(data.countries),
    )
  }

  if (data.tags !== undefined) {
    ;(updates as Record<string, unknown>).tags = data.tags
    await logOperation(
      TABLE,
      id,
      'tags',
      JSON.stringify(existing.tags ?? []),
      JSON.stringify(data.tags),
    )
  }

  if (data.document !== undefined) {
    const synced = await syncReferenceLabels(data.document as Record<string, unknown>)
    ;(updates as Record<string, unknown>).document = synced
  }

  await db.events.update(id, updates)

  if (data.title !== undefined) {
    updateReferencesAfterRename('event', id, data.title).catch(() => {})
  }
}

export async function deleteEvent(id: number): Promise<void> {
  const now = Date.now()
  await db.events.update(id, {
    deleted: true,
    ...pendingStamp(now),
  })

  await logOperation(TABLE, id, 'deleted', 'false', 'true')
}
