'use client'

import { useEffect } from 'react'
import { readBlurPreference } from '@/lib/blur-preference'

/**
 * 窗口模糊（Windows Mica / macOS vibrancy）的**唯一入口**。
 *
 * 为什么挂在 `AppShell` 外面：闸门（还没绑定笔记库时的欢迎页）会**替代**
 * `AppShell` 渲染，效果一旦写在 AppShell 里，欢迎页就永远拿不到 Mica ——
 * 窗口停在 Rust 侧 `setup` 刷的那块不透明纸色上。所以它必须和 `VaultGate`
 * 平级，谁在渲染都要先问一次「这台机器能不能用模糊」。
 *
 * `init_blur` 只在这里调一次；之后主题/开关变化走 `settings.tsx` 的
 * `update_blur_effect`，别在这里重复开关（那会把已生效的效果刷掉）。
 *
 * **默认开**：偏好见 `lib/blur-preference.ts`（只有用户手动关过才是关）。
 * 先问 `blur_supported` 再开关 —— 不支持的平台（Linux、Windows 10）连
 * `init_blur` 都不调，窗口保持 `setup` 刷的不透明纸色，不会出现半透明空窗。
 */
export function BlurEffect() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    const init = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const supported = await invoke<boolean>('blur_supported').catch(() => false)
        if (!supported) return
        const enabled =
          readBlurPreference() &&
          !document.documentElement.classList.contains('oc-background')
        const isDark = document.documentElement.classList.contains('dark')
        invoke<boolean>('init_blur', { enabled, isDark })
          .then((applied) => {
            document.documentElement.classList.toggle('tauri-mica', applied)
          })
          .catch(() => {})
      } catch { /* 非 Tauri 环境静默跳过 */ }
    }
    // `requestIdleCallback` 是 Chromium 专有 API，**Safari / WKWebView（macOS 与 iOS
    // 桌面壳）没有**：直接调用会在 useEffect 里抛 ReferenceError，整棵树挂掉。
    // Windows 走 WebView2（Chromium）所以一直没暴露。没有就退回 setTimeout。
    const run = () => { void init() }
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run)
    } else {
      window.setTimeout(run, 1)
    }
  }, [])

  return null
}
