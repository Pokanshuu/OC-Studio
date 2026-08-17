import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { listActive, getById, softDelete } from '@/lib/repository'
import type { Period } from '@/types'

const TABLE = 'periods'

export async function getAllPeriods(): Promise<Period[]> {
  return listActive(db.periods, 'startTime')
}

export async function getPeriod(id: number): Promise<Period | undefined> {
  return getById(db.periods, id)
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
    ...pendingStamp(now),
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
  const updates: Partial<Period> = { ...pendingStamp(now) }
  if (data.name !== undefined) { updates.name = data.name; await logOperation(TABLE, id, 'name', existing.name, data.name) }
  if (data.startTime !== undefined) { updates.startTime = data.startTime }
  if (data.endTime !== undefined) { updates.endTime = data.endTime }
  if (data.color !== undefined) { updates.color = data.color }
  await db.periods.update(id, updates)
}

export async function deletePeriod(id: number): Promise<void> {
  await softDelete(db.periods, id, TABLE)
}
