'use client'

import { PendingSaveError, flushPendingSaves } from '@/lib/pending-saves'
import { currentStatus, drainVaultWrites, type VaultFlushReport } from '@/lib/vault/vault-persist'

/**
 * 离场保存屏障。
 *
 * 关窗、换库、刷新（以磁盘为准重载）都必须走**同一条**顺序：
 *   1. 等所有草稿各自提交完（`flushPendingSaves`，失败会抛）；
 *   2. 再等落盘队列把 Dexie 里的行真正写进文件（`drainVaultWrites`，
 *      会话 A 的接口保证它会等在途批次与后续批次）；
 *   3. 把错误 / 冲突原样交回调用方，由它决定「不关闭 / 不换库」。
 *
 * 任何一步失败都不能当成离场成功。这里只汇总事实，不弹 toast（展示在 UI 层），
 * 方便测试直接断言结构。
 */
export interface SaveBarrierFailure {
  stage: 'draft' | 'disk' | 'conflict'
  message: string
  relPath?: string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 把 `VaultFlushReport` 的 errors / conflicts 拍成统一的失败列表 */
export function failuresFromVaultReport(report: VaultFlushReport): SaveBarrierFailure[] {
  const failures: SaveBarrierFailure[] = []
  for (const item of report.errors) {
    failures.push({
      stage: 'disk',
      relPath: item.relPath,
      message: item.relPath ? `${item.relPath}：${item.message}` : item.message,
    })
  }
  for (const relPath of report.conflicts) {
    failures.push({
      stage: 'conflict',
      relPath,
      message: `${relPath || '文件'} 在磁盘上被外部修改过，已跳过、没有覆盖`,
    })
  }
  return failures
}

/**
 * 等待草稿 → 等待落盘 → 返回失败清单（空数组 = 这一轮可以离场）。
 *
 * 草稿失败后仍继续 drain：已经进队列的其它行该写还是要写，最后一起报告。
 */
export async function runSaveBarrier(): Promise<SaveBarrierFailure[]> {
  const failures: SaveBarrierFailure[] = []

  try {
    await flushPendingSaves()
  } catch (error) {
    if (error instanceof PendingSaveError) {
      for (const message of error.failures) failures.push({ stage: 'draft', message })
    } else {
      failures.push({ stage: 'draft', message: errorText(error) })
    }
  }

  try {
    const report = await drainVaultWrites()
    failures.push(...failuresFromVaultReport(report))
    // drain 返回了不等于全都确认：失败行会留在队列里等重试（会话 A 的队列语义）。
    // 只要还剩未确认的写入/在途批次，就不能当成「已经可以离场」。
    const after = currentStatus()
    if (after.pending > 0 || after.flushing) {
      failures.push({
        stage: 'disk',
        message: `仍有 ${after.pending} 项改动没有确认写入，已保留在待写队列`,
      })
    }
  } catch (error) {
    failures.push({ stage: 'disk', message: errorText(error) })
  }

  return failures
}

/**
 * 换库 / 其它「先保存再离开」的通用顺序：**先屏障，后进入 loading / 卸载编辑器**。
 *
 * `transition` 里才允许做会让当前编辑器卸载的事。屏障失败时 `transition` 一次都不执行，
 * 原库、原草稿、原界面全部保留。
 */
export async function runGuardedTransition<T>(
  guard: () => Promise<SaveBarrierFailure[]>,
  onBlocked: (failures: SaveBarrierFailure[]) => void,
  transition: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; failures: SaveBarrierFailure[] }> {
  const failures = await guard()
  if (failures.length > 0) {
    onBlocked(failures)
    return { ok: false, failures }
  }
  return { ok: true, value: await transition() }
}
