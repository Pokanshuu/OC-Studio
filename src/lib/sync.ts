import { db } from './db'
import type { OperationLog } from '@/types'

// 实体写入的统一「待同步」时间戳：各 service 的 _syncStatus/_lastModified 一律经由此处生成，
// 避免手写漂移（保留 now 入参以与 updatedAt/createdAt 保持同一时间点）
export function pendingStamp(now: number): { _syncStatus: 'pending'; _lastModified: number } {
  return { _syncStatus: 'pending', _lastModified: now }
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
