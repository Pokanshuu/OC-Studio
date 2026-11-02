import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
import type { TrashItem, TrashItemType } from './types'

const TYPE_LABELS: Record<TrashItemType, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  worldEntry: '世界观词条',
  map: '地图',
}

const TABLES: Record<TrashItemType, string> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  worldEntry: 'worldEntries',
  map: 'maps',
}

export async function getDeletedItems(): Promise<TrashItem[]> {
  const [allChars, allEvents, allCountries, allEntries, allMaps] =
    await Promise.all([
      db.characters.orderBy('name').toArray(),
      db.events.orderBy('time').toArray(),
      db.countries.orderBy('name').toArray(),
      db.worldEntries.orderBy('title').toArray(),
      db.maps.toArray(),
    ])

  const deletedChars = allChars.filter((c) => c.deleted === true || (c.deleted as unknown) === 1)
  const deletedEvents = allEvents.filter((e) => e.deleted === true || (e.deleted as unknown) === 1)
  const deletedCountries = allCountries.filter((c) => c.deleted === true || (c.deleted as unknown) === 1)
  const deletedEntries = allEntries.filter((e) => e.deleted === true || (e.deleted as unknown) === 1)
  const deletedMaps = allMaps.filter((map) => map.deleted === true || (map.deleted as unknown) === 1)

  const items: TrashItem[] = []

  for (const c of deletedChars) {
    if (c.id === undefined) continue
    items.push({
      id: c.id,
      name: c.name,
      type: 'character',
      typeLabel: TYPE_LABELS.character,
      deletedAt: c.updatedAt,
    })
  }

  for (const e of deletedEvents) {
    if (e.id === undefined) continue
    items.push({
      id: e.id,
      name: e.title,
      type: 'event',
      typeLabel: TYPE_LABELS.event,
      deletedAt: e.updatedAt,
    })
  }

  for (const c of deletedCountries) {
    if (c.id === undefined) continue
    items.push({
      id: c.id,
      name: c.name,
      type: 'country',
      typeLabel: TYPE_LABELS.country,
      deletedAt: c.updatedAt,
    })
  }

  for (const entry of deletedEntries) {
    if (entry.id === undefined) continue
    items.push({
      id: entry.id,
      name: entry.title,
      type: 'worldEntry',
      typeLabel: TYPE_LABELS.worldEntry,
      deletedAt: entry.updatedAt,
    })
  }

  for (const map of deletedMaps) {
    if (map.id === undefined) continue
    items.push({
      id: map.id,
      name: map.name,
      type: 'map',
      typeLabel: TYPE_LABELS.map,
      deletedAt: map.updatedAt,
    })
  }

  items.sort((a, b) => b.deletedAt - a.deletedAt)
  return items
}

export async function restoreItem(type: TrashItemType, id: number): Promise<void> {
  const tableName = TABLES[type]
  const now = Date.now()

  const table = db.table(tableName)
  await table.update(id, {
    deleted: false,
    updatedAt: now,
    _syncStatus: 'pending',
    _lastModified: now,
  })

  await logOperation(tableName, id, 'deleted', 'true', 'false')
  if (type === 'map') {
    window.dispatchEvent(new Event('oc-maps-changed'))
    window.dispatchEvent(new Event('data-updated'))
  }
}

export async function permanentlyDeleteItem(
  type: TrashItemType,
  id: number,
): Promise<void> {
  const table = db.table(TABLES[type])
  await table.delete(id)
  if (type === 'map') {
    window.dispatchEvent(new Event('oc-maps-changed'))
    window.dispatchEvent(new Event('data-updated'))
  }
}

export async function permanentlyDeleteAll(): Promise<number> {
  const items = await getDeletedItems()
  for (const item of items) {
    await permanentlyDeleteItem(item.type, item.id)
  }
  return items.length
}

export const TRASH_RETENTION_KEY = 'oc-studio-trash-retention-days'

export async function purgeExpiredTrash(retentionDays: number): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const items = await getDeletedItems()
  let removed = 0
  for (const item of items) {
    if (item.deletedAt >= cutoff) continue
    await permanentlyDeleteItem(item.type, item.id)
    removed++
  }
  return removed
}
