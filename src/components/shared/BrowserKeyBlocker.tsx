'use client'

import { useEffect } from 'react'
import { isTauri } from '@/lib/env'

/**
 * 拦掉 WebView 自带的浏览器加速键（只在 Tauri 里生效）。
 *
 * 为什么必须有这一层：WebView2 / WKWebView 默认把 F5 / Ctrl+R 当「刷新页面」。
 * 本项目正文是 600ms 防抖自动保存 —— 刷新时刚打的字可能还没落盘，即使落了盘也会
 * 回到启动闸门，看起来像「应用崩了重启」。这是数据风险，不只是观感问题。
 *
 * Rust 侧（`src-tauri/src/lib.rs`）在 Windows 上另外关掉了 `AreBrowserAcceleratorKeysEnabled`
 * （`ICoreWebView2Settings3`），这里是**跨平台兜底**：macOS 的 WKWebView 没有那个设置项，
 * 前端 keydown 是唯一能做到的地方。
 *
 * **不拦 Ctrl/Cmd+F**：项目有自己的 `FindReplaceBar`（编辑器内查找），
 * 拦掉它只会让那个快捷键失效。
 *
 * 浏览器开发时整段不生效：`isTauri()` 为假就直接返回，保留刷新能力。
 */
export function BrowserKeyBlocker() {
  useEffect(() => {
    if (!isTauri()) return

    const handler = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey

      // 刷新 / 重新加载
      if (event.key === 'F5') {
        event.preventDefault()
        return
      }
      if (!mod) return

      // Ctrl+R / Ctrl+Shift+R：刷新与强制刷新
      if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        return
      }
      // Ctrl+P：WebView 的打印预览（打出来是整个应用界面）
      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        return
      }
      // Ctrl+U：查看源代码
      if (event.key === 'u' || event.key === 'U') {
        event.preventDefault()
        return
      }
      // Ctrl+Shift+I / J：开发者工具 / 控制台 —— 只在生产构建里拦，开发时不挡自己
      if (event.shiftKey && process.env.NODE_ENV === 'production') {
        const key = event.key.toLowerCase()
        if (key === 'i' || key === 'j') {
          event.preventDefault()
          return
        }
      }
      // Ctrl + 加号 / 减号 / 0：页面缩放
      if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_' || event.key === '0') {
        event.preventDefault()
      }
    }

    // capture 阶段：跑在应用自己的快捷键处理之前，谁都别想先拿到这几个键
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [])

  return null
}
