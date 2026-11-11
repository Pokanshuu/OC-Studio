/**
 * 剪贴板读取的**唯一入口**（带失败语义）。
 *
 * `navigator.clipboard.readText()` 在几种情况下会 reject：没有授权、非安全上下文、
 * WebView 里对 clipboard 的限制。以前三处「粘贴」各自 `.catch(() => {})` ——
 * 点了菜单什么也不发生，用户以为「粘贴按钮坏了」。这里统一把失败变成 `null`，
 * 调用方负责给一句回话。
 */
export async function readClipboardText(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
        const text = await readText()
        return typeof text === 'string' ? text : null
      } catch {
        // 插件失败就退回 Web API
      }
    }
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return null
    const text = await navigator.clipboard.readText()
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}
