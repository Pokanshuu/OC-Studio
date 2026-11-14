'use client'

import { useEffect } from 'react'
import { isTauri } from '@/lib/env'

/**
 * 首帧之后把窗口显示出来（`tauri.conf.json` 里主窗口是 `visible: false`）。
 *
 * 为什么这么做：窗口一建出来就会画 Rust 侧 `setup` 刷的那块底色，而前端的主题脚本
 * 要等到第一个脚本帧才把 `.dark` 落上去。暗色用户因此每次启动都会先看到一块米白 ——
 * 那就是「启动白闪」。改成隐藏窗口 + 首帧后 show 之后，用户看到的第一帧已经是
 * 排好版、上好色的界面。
 *
 * **连等两帧**：第一帧完成样式与布局，第二帧才是真正画到屏幕上的一帧；
 * 只等一帧时偶尔还能看到一次未上色的窗口。
 *
 * 兜底在 Rust 侧（`lib.rs` 的 setup：3 秒后仍不可见就自己 show），
 * 这样前端脚本一旦报错，窗口也不会永远不出现。
 */
export function ShowWindow() {
  useEffect(() => {
    if (!isTauri()) return

    let cancelled = false
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (cancelled) return
        void import('@tauri-apps/api/window')
          .then(({ getCurrentWindow }) => getCurrentWindow().show())
          .catch(() => {})
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])

  return null
}
