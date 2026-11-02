import { db } from '@/lib/db'
import { logOperation } from '@/lib/sync'
import type { Period } from '@/types'

const TABLE = 'periods'

export async function getAllPeriods(): Promise<Period[]> {
  const all = await db.periods.orderBy('startTime').toArray()
  return all.filter((p) => !p.deleted)
}

export async function getPeriod(id: number): Promise<Period | undefined> {
  return db.periods.get(id)
}

export async function createPeriod(data: {
  name: string
  startTime: string
  endTime: string
  color: string
}): Promise<number> {
  const now = Date.now()
  const id = await db.periods.add({
    name: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    color: data.color,
    deleted: false,
    _syncStatus: 'pending',
    _lastModified: now,
  })
  await logOperation(TABLE, id, 'name', '', data.name)
  return id
}

export async function updatePeriod(
  id: number,
  data: Partial<{ name: string; startTime: string; endTime: string; color: string }>,
): Promise<void> {
  const existing = await db.periods.get(id)
  if (!existing) throw new Error(`Period not found: ${id}`)
  const now = Date.now()
  const updates: Partial<Period> = { _syncStatus: 'pending', _lastModified: now }
  if (data.name !== undefined) { updates.name = data.name; await logOperation(TABLE, id, 'name', existing.name, data.name) }
  if (data.startTime !== undefined) { updates.startTime = data.startTime }
  if (data.endTime !== undefined) { updates.endTime = data.endTime }
  if (data.color !== undefined) { updates.color = data.color }
  await db.periods.update(id, updates)
}

export async function deletePeriod(id: number): Promise<void> {
  const now = Date.now()
  await db.periods.update(id, { deleted: true, _syncStatus: 'pending', _lastModified: now })
  await logOperation(TABLE, id, 'deleted', 'false', 'true')
}
