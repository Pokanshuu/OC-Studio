'use client'

import { useEffect } from 'react'

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
 */
export function BlurEffect() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
    const init = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const enabled = window.localStorage.getItem('blur-effect-enabled') === 'true'
        const isDark = document.documentElement.classList.contains('dark')
        invoke<boolean>('init_blur', { enabled, isDark })
          .then((applied) => {
            document.documentElement.classList.toggle('tauri-mica', applied)
          })
          .catch(() => {})
      } catch { /* 非 Tauri 环境静默跳过 */ }
    }
    requestIdleCallback(() => { void init() })
  }, [])

  return null
}
