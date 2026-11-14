'use client'

import type { SaveBarrierFailure } from '@/lib/save-barrier'

export type CloseAttempt = 'closed' | 'blocked' | 'ignored'

export interface CloseCoordinator {
  /**
   * 处理一次「关闭窗口」请求。
   *
   * - `ignored`：上一轮屏障还没结束（重复点关闭 / 系统连发事件），这次不重复跑；
   * - `blocked`：屏障失败，窗口保持打开；下一次请求会重新尝试；
   * - `closed`：屏障全绿并且已经调用 destroy。
   */
  requestClose: () => Promise<CloseAttempt>
  /**
   * 用户明确选择「仍然关闭」：不再跑屏障，直接销毁；重复调用不会再 destroy。
   * 这是唯一允许放弃未写入内容的入口，必须由用户动作触发。
   */
  forceClose: () => Promise<void>
  isBusy: () => boolean
}

/**
 * Tauri 关窗的唯一协调器。
 *
 * 以前 `AppShell` 与 `VaultProvider` 各挂一个 `onCloseRequested`，其中一个还在
 * `finally` 里无条件 `destroy()` —— 保存失败也照样关。现在只保留这一条流程：
 *
 *   拦下原生关闭 → 等草稿与落盘屏障 → 核对错误/冲突 → 全绿才 destroy；
 *   失败就保留窗口并给出回执（用户可显式选择「仍然关闭」）。
 *
 * 重复关闭不会并发跑第二遍屏障，也不会 destroy 两次。
 */
export function createCloseCoordinator(options: {
  runBarrier: () => Promise<SaveBarrierFailure[]>
  destroy: () => void | Promise<void>
  onBlocked: (failures: SaveBarrierFailure[]) => void
}): CloseCoordinator {
  let busy = false
  let closed = false
  let destroying: Promise<void> | null = null

  async function destroyWindow(): Promise<void> {
    if (closed) return
    if (destroying !== null) return destroying
    const attempt = Promise.resolve().then(() => options.destroy())
    destroying = attempt
    try {
      await attempt
      closed = true
    } finally {
      destroying = null
    }
  }

  return {
    isBusy: () => busy,
    async forceClose(): Promise<void> {
      await destroyWindow()
    },
    async requestClose(): Promise<CloseAttempt> {
      if (closed) return 'closed'
      if (busy) return 'ignored'

      busy = true
      try {
        const failures = await options.runBarrier()
        if (failures.length > 0) {
          options.onBlocked(failures)
          return 'blocked'
        }
        await destroyWindow()
        return 'closed'
      } finally {
        busy = false
      }
    },
  }
}
