import { Clipboard as CapacitorClipboard } from '@capacitor/clipboard'
import { isNativePlatform } from '@/lib/env'

/** 读剪贴板：Capacitor 原生 → Web API → window.prompt 兜底 */
export async function readClipboardText(): Promise<string | null> {
  // 1. Capacitor native clipboard (Android/iOS)
  if (isNativePlatform()) {
    try {
      const { value } = await CapacitorClipboard.read()
      if (value) return value
    } catch { /* */ }
  }
  // 2. Standard Web API
  try { return await navigator.clipboard.readText() } catch { /* */ }
  // 3. window.prompt last resort
  try {
    const text = window.prompt('Paste text here')
    if (text != null) return text
  } catch { /* */ }
  return null
}

/** 编辑器可能已被销毁，取 DOM 时兜底不抛 */
export function safeGetEditorDom(editor: { view?: { dom?: HTMLElement } | null; isDestroyed?: boolean } | null): HTMLElement | undefined {
  if (!editor) return undefined
  try {
    return editor.view?.dom ?? undefined
  } catch {
    return undefined
  }
}
