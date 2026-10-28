import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { listActive, getById, softDelete } from '@/lib/repository'
import { updateReferencesAfterRename, syncReferenceLabels } from '@/lib/reference-sync'
import { syncCountryCharacters, syncCountryEvents } from '@/lib/membership'
import type { Country } from '@/types'
import type { CountryFormData } from './types'

const TABLE = 'countries'

function buildDefaultCountry(data: CountryFormData, overrides: Partial<Country> = {}): Omit<Country, 'id'> {
  const now = Date.now()
  return {
    name: data.name,
    parentId: data.parentId,
    description: data.description,
    system: data.system,
    geography: data.geography,
    culture: data.culture,
    characters: data.characters ?? [],
    events: data.events ?? [],
    tags: data.tags ?? [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
    ...overrides,
  }
}

export async function getCountries(): Promise<Country[]> {
  return listActive(db.countries, 'name')
}

export async function getCountry(id: number): Promise<Country | undefined> {
  return getById(db.countries, id)
}

export async function createCountry(data: CountryFormData): Promise<number> {
  const country = buildDefaultCountry(data)
  const id = await db.countries.add(country)

  await logOperation(TABLE, id, 'name', '', data.name)
  if (data.description) {
    await logOperation(TABLE, id, 'description', '', data.description)
  }

  return id
}

export async function updateCountry(id: number, data: Partial<CountryFormData>): Promise<void> {
  const existing = await db.countries.get(id)
  if (!existing) {
    throw new Error(`Country not found: ${id}`)
  }

  const now = Date.now()
  const updates: Partial<Country> = {
    updatedAt: now,
    ...pendingStamp(now),
  }

  type FieldKey = keyof CountryFormData
  const fields: FieldKey[] = ['name', 'parentId', 'description', 'system', 'geography', 'culture', 'flagUrl', 'headerUrl']

  for (const field of fields) {
    const newValue = data[field]
    if (newValue !== undefined) {
      const oldValue = existing[field] ?? ''
      ;(updates as Record<string, unknown>)[field] = newValue
      await logOperation(TABLE, id, field, String(oldValue), String(newValue ?? ''))
    }
  }

  if (data.characters !== undefined) {
    ;(updates as Record<string, unknown>).characters = data.characters
    await logOperation(TABLE, id, 'characters', JSON.stringify(existing.characters), JSON.stringify(data.characters))
  }
  if (data.events !== undefined) {
    ;(updates as Record<string, unknown>).events = data.events
    await logOperation(TABLE, id, 'events', JSON.stringify(existing.events), JSON.stringify(data.events))
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

  await db.countries.update(id, updates)

  // 国家侧的成员名单是镜像：相关角色 ⇄ 角色的国籍、相关事件 ⇄ 事件的相关国家。
  // 不反向同步的话，从国家这边删掉一条，关系图上那条边还会因为国籍/事件侧而留着。
  if (data.characters !== undefined) {
    await syncCountryCharacters(id, existing.characters ?? [], data.characters, now)
  }
  if (data.events !== undefined) {
    await syncCountryEvents(id, existing.events ?? [], data.events, now)
  }

  if (data.name !== undefined) {
    updateReferencesAfterRename('country', id, data.name).catch(() => {})
  }
}

export async function deleteCountry(id: number): Promise<void> {
  await softDelete(db.countries, id, TABLE)
}

/**
 * 手动排序：把 `country` 的顺序写成 0..n-1。
 * 只写真的变了的行；**不碰 updatedAt**（排序不是编辑，别让它窜到「按编辑时间」前面）。
 */
export async function reorderCountries(ids: number[]): Promise<void> {
  const rows = await db.countries.bulkGet(ids)
  const changes: { id: number; order: number }[] = []
  ids.forEach((id, index) => {
    const row = rows[index]
    if (row && row.order !== index) changes.push({ id, order: index })
  })
  if (changes.length === 0) return
  const now = Date.now()
  await db.transaction('rw', db.countries, async () => {
    for (const change of changes) {
      await db.countries.update(change.id, { order: change.order, ...pendingStamp(now) })
    }
  })
}
