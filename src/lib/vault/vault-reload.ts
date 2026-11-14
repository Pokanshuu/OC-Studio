import { failuresFromVaultReport, type SaveBarrierFailure } from '@/lib/save-barrier'
import type { VaultFlushReport } from './vault-persist'
import { normalizeRelPath } from './vault-paths'

/**
 * 「按磁盘内容重载」与「明确采用磁盘版本」的结果契约。
 *
 * 这些动作不再只是 toast 后 resolve：调用方（导入页、菜单、提示条）必须知道
 * 到底重载成功、被保存屏障拦下、还是用户取消，才能决定要不要报成功。
 */
export type VaultReloadResult =
  | { status: 'reloaded' }
  | { status: 'blocked'; failures: SaveBarrierFailure[] }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string }

export type VaultReloadAttempt<T> =
  | { status: 'reloaded'; value: T }
  | { status: 'blocked'; failures: SaveBarrierFailure[] }
  | { status: 'failed'; error: string }

/**
 * 把重载结果翻成调用方可展示的一句话；`null` = 成功，不要报失败。
 * 导入页等调用方用它决定是否还能说「导入完成」。
 */
export function describeReloadBlock(result: VaultReloadResult): string | null {
  if (result.status === 'reloaded') return null
  if (result.status === 'blocked') {
    return result.failures[0]?.message ?? '仍有文件没有写入或存在磁盘冲突'
  }
  if (result.status === 'cancelled') return '已取消重新载入'
  return result.error
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 普通刷新：保存屏障全绿才重载。屏障失败时调用方拿到 `blocked`，**不能**把它当成功。
 */
export async function reloadAfterSaveBarrier<T>(options: {
  barrier: () => Promise<SaveBarrierFailure[]>
  reload: () => Promise<T>
  onBlocked: (failures: SaveBarrierFailure[]) => void
}): Promise<VaultReloadAttempt<T>> {
  const failures = await options.barrier()
  if (failures.length > 0) {
    options.onBlocked(failures)
    return { status: 'blocked', failures }
  }
  try {
    return { status: 'reloaded', value: await options.reload() }
  } catch (error) {
    return { status: 'failed', error: errorText(error) }
  }
}

export interface AdoptDiskDeps {
  /** 放弃一条本地冲突（`vault-persist.discardConflict`）——不写文件 */
  discard: (relPath: string) => void
  /** 排干其余普通写入；**不允许**传 overwriteConflicts */
  drain: () => Promise<VaultFlushReport>
  status: () => { pending: number; flushing: boolean }
  /** 重新读盘并替换内存（`loadVault` + provider 状态更新） */
  reload: () => Promise<void>
}

/**
 * 用户明确确认「放弃指定本地冲突、采用磁盘版本」之后执行。
 *
 * 顺序必须是：丢弃本地冲突 → 排干其它普通写入 → 重新读盘。
 * **不会**先调用 `drainVaultWrites({ overwriteConflicts: true })`：确认采用磁盘
 * 绝不能先把本地版本覆盖到外部文件上。
 */
export async function adoptDiskAndReload(
  paths: readonly string[],
  deps: AdoptDiskDeps,
): Promise<VaultReloadResult> {
  const targets = [...new Set(paths.map((path) => path.trim()).filter((path) => path !== ''))]
  if (targets.length === 0) {
    return { status: 'failed', error: '没有指定要采用的磁盘文件' }
  }

  const discarded = new Set(targets.map((path) => normalizeRelPath(path)))
  try {
    for (const path of targets) deps.discard(path)
  } catch (error) {
    return { status: 'failed', error: errorText(error) }
  }

  let report: VaultFlushReport
  try {
    report = await deps.drain()
  } catch (error) {
    return { status: 'failed', error: errorText(error) }
  }

  // 刚丢弃的条目即使仍出现在历史报告里，也不算“未解决”；其它冲突/错误仍然阻断
  const remainingConflicts = report.conflicts.filter(
    (relPath) => !discarded.has(normalizeRelPath(relPath)),
  )
  const failures = failuresFromVaultReport({ ...report, conflicts: remainingConflicts })
  const after = deps.status()
  if (after.pending > 0 || after.flushing) {
    failures.push({
      stage: 'disk',
      message: `仍有 ${after.pending} 项改动没有确认写入，已保留在待写队列`,
    })
  }
  if (failures.length > 0) return { status: 'blocked', failures }

  try {
    await deps.reload()
  } catch (error) {
    return { status: 'failed', error: errorText(error) }
  }
  return { status: 'reloaded' }
}
