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
    } catch (err) {
      console.error('[uploadImage] LocalAdapter failed, falling back to BrowserAdapter:', err)
    }
  }

  return adapter.upload(type)
}

export function resolveImageUrl(path: string | undefined, type: string = 'avatar'): string {
  if (!path) return getDefaultImage(type)
  if (path.startsWith('https://') || path.startsWith('http://') || path.startsWith('data:') || path.startsWith('blob:')) return path
  if (path.startsWith('/')) return path

  if (isTauri() && tauriAppDataDir && tauriConvertFileSrc) {
    const base = tauriAppDataDir.replace(/\/+$/, '').replace(/\\/g, '/')
    const normalizedPath = path.replace(/\\/g, '/')
    return tauriConvertFileSrc(`${base}/${normalizedPath}`)
  }

  return getDefaultImage(type)
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

    let writeFile: (path: string, data: Uint8Array) => Promise<void>
    let mkdir: (path: string, opts?: { recursive: boolean }) => Promise<void>
    try {
      const fsModule = await import('@tauri-apps/plugin-fs')
      writeFile = fsModule.writeFile
      mkdir = fsModule.mkdir
    } catch (importErr) {
      console.error('[saveBlobToDisk] Failed to import @tauri-apps/plugin-fs:', importErr)
      throw importErr
    }

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
  } catch (err) {
    console.error('[saveBlobToDisk] FAILED, falling back to blob URL:', err)
    return URL.createObjectURL(blob)
  }
}

export { getCroppedBlob, getCroppedDataUrl } from './image-crop'
