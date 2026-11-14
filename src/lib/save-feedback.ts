'use client'

import { toast } from 'sonner'

import type { SaveBarrierFailure } from '@/lib/save-barrier'
import { drainVaultWrites } from '@/lib/vault/vault-persist'

/** 冲突时给一条能走的路：用户明确选择才覆盖磁盘（自动保存永不覆盖外部改动） */
async function overwriteConflicts(): Promise<void> {
  try {
    const report = await drainVaultWrites({ overwriteConflicts: true })
    if (report.errors.length === 0 && report.conflicts.length === 0) {
      toast.success('已按编辑器里的版本覆盖磁盘')
      return
    }
    const first = report.errors[0]?.message ?? report.conflicts[0] ?? '未知原因'
    toast.error('覆盖磁盘没有完成', { description: first })
  } catch (error) {
    toast.error('覆盖磁盘没有完成', {
      description: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * 保存屏障失败的**统一回执**：快捷键、菜单保存、关窗、换库共用。
 *
 * 只有拿得到明确失败才调用；成功时不弹「已保存」——状态栏已经按真实落盘阶段显示，
 * 不制造第二份回执。
 *
 * 冲突给两个方向：
 * - 主按钮「采用磁盘版本」（传入 `adoptDisk` 时）：放弃本地冲突、采纳外部文件，
 *   需要再确认一次，且**不会**先覆盖磁盘；
 * - 次按钮「覆盖磁盘」：把编辑器里的版本写回磁盘（原有行为）。
 * 关窗场景没有 `adoptDisk`，额外给「仍然关闭」，那是明确放弃未写入内容的动作。
 */
export function reportSaveBarrierFailures(
  failures: SaveBarrierFailure[],
  options?: {
    forceClose?: () => void
    adoptDisk?: (paths: string[]) => void
  },
): void {
  if (failures.length === 0) return

  const conflictPaths = [
    ...new Set(
      failures
        .filter((item) => item.stage === 'conflict')
        .map((item) => item.relPath ?? '')
        .filter((relPath) => relPath !== ''),
    ),
  ]
  const conflict = conflictPaths.length > 0
  const first = failures[0]
  const description =
    failures.length > 1 ? `${first.message}（另有 ${failures.length - 1} 项）` : first.message

  const adopt =
    conflict && options?.adoptDisk !== undefined
      ? {
          label: '采用磁盘版本',
          onClick: () => options.adoptDisk?.(conflictPaths),
        }
      : undefined
  const overwrite = conflict
    ? { label: '覆盖磁盘', onClick: () => void overwriteConflicts() }
    : undefined

  const action = adopt ?? overwrite ?? (options?.forceClose ? { label: '仍然关闭', onClick: options.forceClose } : undefined)
  const cancel = adopt
    ? overwrite
    : overwrite !== undefined && options?.forceClose !== undefined
      ? { label: '仍然关闭', onClick: options.forceClose }
      : undefined

  toast.error('保存未完成', {
    description,
    duration: conflict ? 15000 : 8000,
    action,
    cancel,
  })
}
