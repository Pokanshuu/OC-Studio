export async function tauriReadClipboard(): Promise<string> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
      return await readText()
    } catch { /* Tauri plugin failed, fall through to Web API */ }
  }
  return navigator.clipboard.readText()
}
