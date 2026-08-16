import { db } from './db'
import type { OperationLog } from '@/types'

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
