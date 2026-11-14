'use client'

import { useEffect } from 'react'
import { isTauri } from '@/lib/env'

/**
 * 窗口焦点同步：把「窗口是不是当前焦点」写到 `<html data-window-inactive>`。
 *
 * 原生窗口失去焦点时标题栏文字变灰、选中高亮变淡 —— 用户靠这个知道
 * 「现在键盘输入去哪了」。Mica 自己失焦会变纯色，但界面上的文字和选中态原来没有任何变化。
 *
 * 只在 Tauri 里听 `getCurrentWindow().onFocusChanged`；浏览器里退回 `window` 的
 * focus / blur（多标签页时同样成立，开发时也能看到效果）。
 */
export function WindowFocusSync() {
  useEffect(() => {
    const setInactive = (inactive: boolean): void => {
      if (inactive) document.documentElement.dataset.windowInactive = 'true'
      else delete document.documentElement.dataset.windowInactive
    }

    if (isTauri()) {
      setInactive(!document.hasFocus())
      let unlisten: (() => void) | undefined
      let cancelled = false
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onFocusChanged(({ payload }) => setInactive(!payload)),
        )
        .then((fn) => {
          if (cancelled) fn()
          else unlisten = fn
        })
        .catch(() => {})
      return () => {
        cancelled = true
        unlisten?.()
      }
    }

    const onFocus = (): void => setInactive(false)
    const onBlur = (): void => setInactive(true)
    setInactive(!document.hasFocus())
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return null
}
