'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { registerPendingSave } from '@/lib/pending-saves'
import { saveClean, saveFailed, saveSucceeded, type SaveOutcome } from '@/lib/save-outcome'

export interface SavePipeline {
  /**
   * 串行执行一次「有脏就保存」。可等待；失败时返回 `{status:'failed'}` 而不是抛出 ——
   * 自动保存、快捷键、离场屏障都消费同一个结果。
   */
  save: () => Promise<SaveOutcome>
  /**
   * 离场屏障：反复保存到「不再有脏修订」为止（每次只确认被提交的那一版）。
   * 失败或始终追不上新输入时抛错 —— 调用方据此**不关闭 / 不换库**。
   */
  flushForExit: () => Promise<void>
  /** 是否有一次保存正在执行（状态栏 / 自动保存用） */
  saving: boolean
}

/**
 * 实体表单共用的保存流水线。
 *
 * 三件事：
 * 1. **串行**：同一编辑器不允许两次提交并行，否则先完成的旧修订可能后写盘；
 * 2. **只确认提交的那一版**：`commit()` 自己捕获修订并只确认它（见各表单）；
 * 3. **可等待**：向 `SaveStatusContext` 登记的保存回调、向 `pending-saves` 登记的
 *    离场 flush 都保留 Promise，不再出现「请求发出去了、结果没人管」。
 */
export function useSavePipeline(options: {
  /** 读「此刻」的脏状态。必须读最新值（ref），不能用发起保存那一刻的 render 闭包 */
  isDirty: () => boolean
  /** 提交一版修订；成功才算保存，失败必须抛出 */
  commit: () => Promise<void>
  /** 离场时最多追几轮新修订（防止用户持续输入时把窗口锁死） */
  maxRounds?: number
}): SavePipeline {
  const { isDirty, commit, maxRounds = 6 } = options

  /**
   * `commit` / `isDirty` 每次 render 都会换（它们读这次的 state）。保存是在 await 之后
   * 才真正执行的，必须取**最新**那一组 —— 否则第一次保存完成后，队列里的第二次保存
   * 还会拿着旧闭包，把旧修订再写一遍。
   *
   * 用 layout effect 同步（不在 render 期写 ref）：离散输入事件的提交会在返回事件循环前
   * 跑完 layout effect，await 的后续微任务一定看得到新值。
   */
  const latestRef = useRef({ isDirty, commit })
  useLayoutEffect(() => {
    latestRef.current = { isDirty, commit }
  }, [commit, isDirty])

  const [saving, setSaving] = useState(false)
  const mountedRef = useRef(true)
  /** 链尾：下一次保存接在上一次后面，成功失败都继续排队 */
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const runOnce = useCallback(async (): Promise<SaveOutcome> => {
    const latest = latestRef.current
    // 没有脏修订就不提交：重复的 Ctrl+S / 队列里的第二次保存不产生假回执
    if (!latest.isDirty()) return saveClean()
    if (mountedRef.current) setSaving(true)
    try {
      await latest.commit()
      return saveSucceeded()
    } catch (error) {
      return saveFailed(error)
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [])

  const save = useCallback((): Promise<SaveOutcome> => {
    // then(runOnce, runOnce)：上一轮失败也要继续这一轮（新修订仍要保存）
    const next = chainRef.current.then(() => runOnce(), () => runOnce())
    chainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }, [runOnce])

  const flushForExit = useCallback(async (): Promise<void> => {
    for (let round = 0; round < maxRounds; round += 1) {
      const outcome = await save()
      if (outcome.status === 'failed') throw outcome.error
      if (!latestRef.current.isDirty()) return
    }
    // 追了 maxRounds 轮仍有新修订：宁可拦下离场，也不能把没写的内容当成写完了
    throw new Error('仍有未保存的改动')
  }, [maxRounds, save])

  useEffect(() => registerPendingSave(flushForExit), [flushForExit])

  return { save, flushForExit, saving }
}
