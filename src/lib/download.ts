import { downloadBlob } from './zip'
import { resolveImageUrl } from './image-service'
import { blobFromLocalPath, isTauriRuntime, mimeFromPath } from './local-media'

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'image'
}

function extensionOf(blob: Blob, fallback = 'png'): string {
  const type = blob.type.toLowerCase()
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('png')) return 'png'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('svg')) return 'svg'
  if (type.includes('mp4')) return 'mp4'
  if (type.includes('webm')) return 'webm'
  if (type.includes('quicktime')) return 'mov'
  return fallback
}

async function fetchBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    const response = await fetch(src)
    return response.blob()
  }
  const response = await fetch(src)
  if (!response.ok) throw new Error(`下载失败：${response.status}`)
  return response.blob()
}

/**
 * 把角色照片/动画下载到用户设备。
 * 优先走 Blob 下载；本地 asset 协议不支持 fetch 时退化为打开原图。
 */
export async function downloadMedia(
  path: string,
  filename: string,
  type: 'avatar' | 'header' | 'flag' | 'gallery' | 'animation' = 'avatar',
): Promise<boolean> {
  if (!path) return false
  const src = resolveImageUrl(path, type)
  try {
    // 桌面端优先读取 AppData 原文件；CSP 不允许 fetch asset.localhost。
    let blob = isTauriRuntime() ? await blobFromLocalPath(path) : null
    if (!blob) blob = await fetchBlob(src)
    const base = safeName(filename)
    const ext = extensionOf(blob, type === 'animation' ? 'mp4' : 'png')
    const finalName = /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`
    downloadBlob(blob, finalName)
    return true
  } catch (error) {
    console.error('[downloadMedia] fetch failed, fallback to open', error)
    try {
      const anchor = document.createElement('a')
      anchor.href = src
      anchor.download = safeName(filename)
      anchor.target = '_blank'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      return true
    } catch {
      return false
    }
  }
}

/** 桌面端把本地媒体读成 Blob；失败时返回 null。 */
export async function readMediaBlob(path: string): Promise<Blob | null> {
  const local = await blobFromLocalPath(path)
  if (local) return local
  try {
    const src = resolveImageUrl(path, 'gallery')
    const blob = await fetchBlob(src)
    return new Blob([blob], { type: blob.type || mimeFromPath(path) })
  } catch {
    return null
  }
}
