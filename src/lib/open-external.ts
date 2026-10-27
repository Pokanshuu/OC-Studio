import { isTauri } from './env'

/**
 * 用**系统默认浏览器**打开外部链接。
 *
 * 为什么不能直接用 `<a target="_blank">`：Tauri 的 WebView 里没有浏览器标签页，
 * 点了不会有任何反应。桌面端走自建 Rust 命令 `open_external`（见 `src-tauri/src/open.rs`，
 * 只放行 http/https，且不经过 shell），浏览器 / Capacitor 端用 `window.open`。
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_external', { url })
      return
    } catch {
      // 旧版桌面端还没有这个命令时回落到 window.open，不要让链接彻底点不动
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
