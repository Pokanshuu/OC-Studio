import type { Table, UpdateSpec } from 'dexie'
import { logOperation, pendingStamp } from './sync'

// 泛型 CRUD 仓储原语 — 消除 characters / events / countries / worldEntries / periods
// 各 service 中重复的「列表过滤软删除 / 按 id 取 / 软删除」三件套。
// create/update 因字段级操作日志与引用同步差异较大，保留在各 service 内。

export interface RepositoryEntity {
  id?: number
  deleted?: boolean
}

export async function listActive<T extends RepositoryEntity>(
  table: Table<T, number>,
  sortField: string,
): Promise<T[]> {
  const all = await table.orderBy(sortField).toArray()
  return all.filter((item) => !item.deleted)
}

export async function getById<T extends RepositoryEntity>(
  table: Table<T, number>,
  id: number,
): Promise<T | undefined> {
  return table.get(id)
}

export async function softDelete<T extends RepositoryEntity>(
  table: Table<T, number>,
  id: number,
  tableName: string,
): Promise<void> {
  const now = Date.now()
  await table.update(id, {
    deleted: true,
    ...pendingStamp(now),
  } as unknown as UpdateSpec<T>)

  await logOperation(tableName, id, 'deleted', 'false', 'true')
}
