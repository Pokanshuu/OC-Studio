'use client'

import { useEffect, useState } from 'react'

/**
 * 延迟置真的布尔量 —— 「加载中…」不再闪一下。
 *
 * 数据来自本地 IndexedDB / 笔记库，通常几十毫秒就回来；直接把 `loading` 渲染成
 * 整块「加载中…」会让用户看到一帧文字跳一下，那是网页的观感。桌面应用的做法是：
 * **先什么都不画**（页头与外壳照常在），超过 `delayMs` 才承认「确实在等」。
 *
 * 用法（必须在任何 early return 之前调用，Hook 规则）：
 * ```tsx
 * const showLoading = useDelayedFlag(loading)
 * ...
 * {showLoading ? <p className={LOADING_TEXT}>加载中…</p> : null}
 * ```
 */
export function useDelayedFlag(flag: boolean, delayMs = 200): boolean {
  const [delayed, setDelayed] = useState(false)

  useEffect(() => {
    if (!flag) {
      setDelayed(false)
      return
    }
    const timer = setTimeout(() => setDelayed(true), delayMs)
    return () => clearTimeout(timer)
  }, [flag, delayMs])

  return flag && delayed
}
