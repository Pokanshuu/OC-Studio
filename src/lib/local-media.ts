const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

/**
 * 直接从 Tauri AppData 读取本地媒体，绕开 CSP 对 asset.localhost 的 fetch 限制。
 * 浏览器环境返回 null，由调用方走普通 fetch。
 */
export async function blobFromLocalPath(path: string): Promise<Blob | null> {
  if (!isTauriRuntime() || !path) return null
  if (path.startsWith('data:') || path.startsWith('http') || path.startsWith('blob:')) {
    return null
  }
  try {
    const [{ appDataDir }, { readFile }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-fs'),
    ])
    const base = (await appDataDir()).replace(/[/\\]+$/, '').replace(/\\/g, '/')
    const relative = path.replace(/^[/\\]+/, '').replace(/\\/g, '/')
    const bytes = await readFile(`${base}/${relative}`)
    return new Blob([bytes], { type: mimeFromPath(relative) })
  } catch (error) {
    console.warn('[local-media] read failed', error)
    return null
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(blob)
  })
}
