import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { listActive, getById, softDelete } from '@/lib/repository'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'

import type { Event } from '@/types'
import type { EventFormData } from './types'
import { bodyPresetDoc } from '@/lib/templates/body-preset'

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
    relations: data.relations ?? [],
    tags: data.tags ?? [],
    custom: data.custom ?? {},
    images: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
    ...overrides,
  }
}

export async function getEvents(): Promise<Event[]> {
  return listActive(db.events, 'time')
}

export async function getEvent(id: number): Promise<Event | undefined> {
  return getById(db.events, id)
}

export async function createEvent(data: EventFormData): Promise<number> {
  // 模板的正文预设（见 `lib/templates/body-preset.ts`）：只在空正文的新条目上铺
  const draft = buildDefaultEvent(data)
  const preset = draft.document == null ? await bodyPresetDoc('event') : null
  const event = preset === null ? draft : { ...draft, document: preset }
  const id = await db.events.add(event)

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

  if (data.custom !== undefined) {
    ;(updates as Record<string, unknown>).custom = data.custom
    await logOperation(
      TABLE,
      id,
      'custom',
      JSON.stringify(existing.custom ?? {}),
      JSON.stringify(data.custom),
    )
  }

  // 图集是对象数组：日志走 JSON，`String()` 会变成一串 [object Object]
  if (data.images !== undefined) {
    ;(updates as Record<string, unknown>).images = data.images
    await logOperation(
      TABLE,
      id,
      'images',
      JSON.stringify(existing.images ?? []),
      JSON.stringify(data.images),
    )
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

  if (data.relations !== undefined) {
    ;(updates as Record<string, unknown>).relations = data.relations
    await logOperation(
      TABLE,
      id,
      'relations',
      JSON.stringify(existing.relations ?? []),
      JSON.stringify(data.relations),
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

  // 相关国家是**唯一真源**（阶段二·一）：国家页的「相关事件」是查询出来的，没有镜像要补

  if (data.title !== undefined) {
    updateReferencesAfterRename('event', id, data.title).catch(() => {})
  }
}

export async function deleteEvent(id: number): Promise<void> {
  await softDelete(db.events, id, TABLE)
}

/**
 * 手动排序：把 `event` 的顺序写成 0..n-1。
 * 只写真的变了的行；**不碰 updatedAt**（排序不是编辑，别让它窜到「按编辑时间」前面）。
 */
export async function reorderEvents(ids: number[]): Promise<void> {
  const rows = await db.events.bulkGet(ids)
  const changes: { id: number; order: number }[] = []
  ids.forEach((id, index) => {
    const row = rows[index]
    if (row && row.order !== index) changes.push({ id, order: index })
  })
  if (changes.length === 0) return
  const now = Date.now()
  await db.transaction('rw', db.events, async () => {
    for (const change of changes) {
      await db.events.update(change.id, { order: change.order, ...pendingStamp(now) })
    }
  })
}
