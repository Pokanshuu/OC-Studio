'use client'

import { useEffect, useRef } from 'react'

import type { SaveOutcome } from '@/lib/save-outcome'

/**
 * 静置自动保存。
 *
 * 为什么不是「卸载时保存」：分区是**常驻挂载**的（`data-visible` + `display:none`），
 * 返回列表 / 切分区都不会卸载编辑器，卸载钩子根本不触发 —— 那条路验证过，改动照样丢。
 *
 * 所以按笔记的口径来：停手 1.5 秒就写一次。这样无论用户下一步点返回、切分区、
 * 还是直接关窗口，写下的内容都不会「只存在 state 里」。
 *
 * 成功回执只确认**提交的那一版**：如果 1.5 秒之后保存的 await 期间用户又输入了，
 * `dirty` 仍然是 true，`saving` 落回 false 后这里会再排一轮（继续保存新修订）。
 *
 * 失败处理：保存抛错 / 返回 failed 后**停下来**，等用户手动点保存再试 ——
 * 否则「保存失败 → 仍是脏 → 1.5 秒后重试」会变成每秒一条错误提示。
 */
export function useAutoSave({
  dirty,
  saving,
  save,
  delay = 1500,
}: {
  dirty: boolean
  saving: boolean
  save: () => Promise<SaveOutcome>
  delay?: number
}): void {
  const failedRef = useRef(false)

  // 重新变干净（保存成功 / 撤销回原样）= 失败状态解除
  useEffect(() => {
    if (!dirty) failedRef.current = false
  }, [dirty])

  useEffect(() => {
    if (!dirty || saving || failedRef.current) return
    const timer = setTimeout(() => {
      void save()
        .then((outcome) => {
          if (outcome.status === 'failed') failedRef.current = true
        })
        .catch(() => {
          // 保存函数约定不抛；真抛了也按失败处理，不无限重试
          failedRef.current = true
        })
    }, delay)
    return () => clearTimeout(timer)
  }, [dirty, saving, save, delay])
}
