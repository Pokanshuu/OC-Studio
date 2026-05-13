import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
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
    tags: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    _syncStatus: 'pending',
    _lastModified: now,
    ...overrides,
  }
}

export async function getCountries(): Promise<Country[]> {
  const all = await db.countries.orderBy('name').toArray()
  return all.filter((c) => !c.deleted)
}

export async function getCountry(id: number): Promise<Country | undefined> {
  return db.countries.get(id)
}

export async function createCountry(data: CountryFormData): Promise<number> {
  const country = buildDefaultCountry(data)
  const id = await db.countries.add(country as Country)

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
    _syncStatus: 'pending',
    _lastModified: now,
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

  if (data.document !== undefined) {
    ;(updates as Record<string, unknown>).document = data.document
  }

  await db.countries.update(id, updates)
}

export async function saveDocument(id: number, document: unknown): Promise<void> {
  const now = Date.now()
  await db.countries.update(id, {
    document,
    updatedAt: now,
    _syncStatus: 'pending',
    _lastModified: now,
  })
}

export async function deleteCountry(id: number): Promise<void> {
  const now = Date.now()
  await db.countries.update(id, {
    deleted: true,
    _syncStatus: 'pending',
    _lastModified: now,
  })

  await logOperation(TABLE, id, 'deleted', 'false', 'true')
}
