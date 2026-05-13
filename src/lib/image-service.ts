import { BrowserAdapter } from './adapters/browser-adapter'
import type { LocalAdapter } from './adapters/local-adapter'

let adapter: BrowserAdapter | LocalAdapter = new BrowserAdapter()
let tauriAppDataDir = ''
let tauriConvertFileSrc: ((path: string) => string) | null = null

const DEFAULT_IMAGES: Record<string, string> = {
  avatar: '/images/defaults/character-avatar.svg',
  'avatar-q': '/images/defaults/character-avatar-q.svg',
  flag: '/images/defaults/country-emblem.svg',
  header: '/images/defaults/header-placeholder.svg',
}

export function getDefaultImage(type: string): string {
  return DEFAULT_IMAGES[type] || DEFAULT_IMAGES.avatar
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export async function initImageService(): Promise<void> {
  if (isTauri()) {
    await ensureTauriAppDataDir()
  }
}

async function ensureTauriAppDataDir(): Promise<string> {
  if (!tauriAppDataDir && isTauri()) {
    const { appDataDir } = await import('@tauri-apps/api/path')
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    tauriConvertFileSrc = convertFileSrc
    tauriAppDataDir = await appDataDir()
  }
  return tauriAppDataDir
}

export async function uploadImage(type: string): Promise<string> {
  if (isTauri()) {
    try {
      const { LocalAdapter: LA } = await import('./adapters/local-adapter')
      const la = new LA()
      const result = await la.upload(type)
      if (result) {
        adapter = la
        await ensureTauriAppDataDir()
      }
      return result
    } catch {
      // fall through to browser adapter
    }
  }

  return adapter.upload(type)
}

export function resolveImageUrl(path: string | undefined, type: string = 'avatar'): string {
  if (!path) return getDefaultImage(type)
  if (path.startsWith('https://') || path.startsWith('http://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path
  }
  if (path.startsWith('/')) {
    return path
  }
  // Tauri: relative path like "images/xxx.png" — use convertFileSrc
  if (isTauri() && tauriAppDataDir && tauriConvertFileSrc) {
    const base = tauriAppDataDir.replace(/\/+$/, '')
    return tauriConvertFileSrc(`${base}/${path}`)
  }
  // Browser fallback: prepend /images/defaults/ for old-style paths
  return `/images/defaults/${path}`
}

export function getImageUrl(path: string | undefined, type: string): string {
  return resolveImageUrl(path, type)
}

export async function saveBlobToDisk(blob: Blob, type: string): Promise<string> {
  try {
    if (!isTauri()) {
      return URL.createObjectURL(blob)
    }

    const basePath = (await ensureTauriAppDataDir()).replace(/\/+$/, '')
    const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs')

    const imagesDir = `${basePath}/images`
    const timestamp = Date.now()
    const fileName = `${type}-${timestamp}.png`
    const destPath = `${imagesDir}/${fileName}`

    try {
      await mkdir(imagesDir, { recursive: true })
    } catch {
      // directory may already exist
    }

    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    await writeFile(destPath, bytes)

    return `images/${fileName}`
  } catch {
    // Fallback: return blob URL (session-only, but better than nothing)
    return URL.createObjectURL(blob)
  }
}

export { getCroppedBlob, getCroppedDataUrl } from './image-crop'
