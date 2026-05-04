import { db } from './db'
import type { OperationLog } from '@/types'

type SyncableTable = 'characters' | 'events' | 'countries' | 'worldEntries'

export async function markAsPending(id: number, table: SyncableTable): Promise<void> {
  await db.table(table).update(id, {
    _syncStatus: 'pending',
    _lastModified: Date.now(),
  })
}

export async function getPendingItems(table: SyncableTable): Promise<Record<string, unknown>[]> {
  return db.table(table)
    .filter((item) => item._syncStatus === 'pending')
    .toArray()
}

export async function markAsSynced(id: number, table: SyncableTable): Promise<void> {
  await db.table(table).update(id, {
    _syncStatus: 'synced',
    _lastModified: Date.now(),
  })
}

export async function logOperation(
  targetType: string,
  targetId: number,
  field: string,
  oldValue: string,
  newValue: string,
): Promise<void> {
  const entry: Omit<OperationLog, 'id'> = {
    timestamp: Date.now(),
    targetType,
    targetId,
    field,
    oldValue,
    newValue,
  }

  await db.operationLog.add(entry as OperationLog)
}
