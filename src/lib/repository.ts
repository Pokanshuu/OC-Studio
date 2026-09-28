import type { Table, UpdateSpec } from 'dexie'
import { logOperation, pendingStamp } from './sync'

// 泛型 CRUD 仓储原语 — 消除 characters / events / countries / worldEntries / periods
// 各 service 中重复的「列表过滤软删除 / 按 id 取 / 软删除」三件套。
// create/update 因字段级操作日志与引用同步差异较大，保留在各 service 内。
//
// 关于第二个泛型 `TInsert`：Dexie 的表类型是 `Table<行, 主键, 写入类型>`，
// 而 `EntityTable<T,'id'>` 的写入类型是 `InsertType<T,'id'>`（id 可省）。
// 若这里只写 `Table<T, number>`（= 写入类型也是 T），推断会把 T 统一成 InsertType，
// 于是「读出来的行」被错误地判定为 id 可选 —— 所以必须把写入类型单独放一个泛型位。

/** 参与软删除的行 */
export interface RepositoryEntity {
  id?: number
  deleted?: boolean
}

export async function listActive<T extends RepositoryEntity, TInsert>(
  table: Table<T, number, TInsert>,
  sortField: string,
): Promise<T[]> {
  const all = await table.orderBy(sortField).toArray()
  return all.filter((item) => !item.deleted)
}

export async function getById<T extends RepositoryEntity, TInsert>(
  table: Table<T, number, TInsert>,
  id: number,
): Promise<T | undefined> {
  return table.get(id)
}

export async function softDelete<T extends RepositoryEntity, TInsert>(
  table: Table<T, number, TInsert>,
  id: number,
  tableName: string,
): Promise<void> {
  const now = Date.now()
  await table.update(id, {
    deleted: true,
    ...pendingStamp(now),
  } as unknown as UpdateSpec<TInsert>)

  await logOperation(tableName, id, 'deleted', 'false', 'true')
}
