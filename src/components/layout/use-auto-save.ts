'use client'

import { useEffect, useRef } from 'react'

/**
 * 静置自动保存。
 *
 * 为什么不是「卸载时保存」：分区是**常驻挂载**的（`data-visible` + `display:none`），
 * 返回列表 / 切分区都不会卸载编辑器，卸载钩子根本不触发 —— 那条路验证过，改动照样丢。
 *
 * 所以按笔记的口径来：停手 1.5 秒就写一次。这样无论用户下一步点返回、切分区、
 * 还是直接关窗口，写下的内容都不会「只存在 state 里」。
 *
 * 失败处理：保存抛错后**停下来**，等用户再次改动或手动点保存再试 ——
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
  save: () => Promise<void>
  delay?: number
}): void {
  const failedRef = useRef(false)

  // 重新变脏 = 用户又改了：允许再试一次
  useEffect(() => {
    if (!dirty) failedRef.current = false
  }, [dirty])

  useEffect(() => {
    if (!dirty || saving || failedRef.current) return
    const timer = setTimeout(() => {
      void save().catch(() => {
        failedRef.current = true
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [dirty, saving, save, delay])
}
