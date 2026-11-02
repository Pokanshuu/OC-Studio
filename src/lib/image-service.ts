import { BrowserAdapter } from './adapters/browser-adapter'
import type { LocalAdapter } from './adapters/local-adapter'
import { convertHeifToJpeg } from './image-heif'

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

function isCapacitor(): boolean {
  if (typeof window === 'undefined' || isTauri()) return false
  // The Capacitor runtime is bundled into the web build too. Only treat it as
  // native when it actually reports a native platform; WebView2 reports "web".
  const cap = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean
      getPlatform?: () => string
    }
  }).Capacitor
  if (!cap) return false
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform()
  return typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web'
}

let capacitorConvertFileSrc: ((path: string) => string) | null = null

async function ensureCapacitorConvertFileSrc(): Promise<void> {
  if (!capacitorConvertFileSrc && isCapacitor()) {
    const { Capacitor } = await import('@capacitor/core')
    capacitorConvertFileSrc = Capacitor.convertFileSrc
  }
}

export async function initImageService(): Promise<void> {
  if (isTauri()) {
    await ensureTauriAppDataDir()
  } else if (isCapacitor()) {
    await ensureCapacitorConvertFileSrc()
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

  if (isCapacitor()) {
    try {
      const { CapacitorAdapter: CA } = await import('./adapters/capacitor-adapter')
      const ca = new CA()
      await ensureCapacitorConvertFileSrc()
      return await ca.upload(type)
    } catch (err) {
      console.error('[uploadImage] CapacitorAdapter failed, falling back to BrowserAdapter:', err)
    }
  }

  return adapter.upload(type)
}

export function resolveImageUrl(path: string | undefined, type: string = 'avatar'): string {
  if (!path) return getDefaultImage(type)
  // 硬约束：不加载任何远程图片。导入数据中的 http(s) URL 在此直接降级为本地占位图。
  if (path.startsWith('https://') || path.startsWith('http://') || path.startsWith('//')) {
    return getDefaultImage(type)
  }
  if (path.startsWith('data:')) return path
  // Blob URLs and legacy Capacitor virtual paths do not survive in WebView2.
  if (path.startsWith('blob:')) return getDefaultImage(type)
  if (path.startsWith('/DATA/') || path.startsWith('file://')) return getDefaultImage(type)
  if (path.startsWith('/')) return path

  if (isTauri() && tauriAppDataDir && tauriConvertFileSrc) {
    const base = tauriAppDataDir.replace(/\/+$/, '').replace(/\\/g, '/')
    const normalizedPath = path.replace(/\\/g, '/')
    return tauriConvertFileSrc(`${base}/${normalizedPath}`)
  }

  if (isCapacitor() && capacitorConvertFileSrc && path.startsWith('file://')) {
    return capacitorConvertFileSrc(path)
  }

  return getDefaultImage(type)
}

export function getImageUrl(path: string | undefined, type: string): string {
  return resolveImageUrl(path, type)
}

async function writeBlobToCapacitorFs(blob: Blob, fileName: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const base64 = btoa(
    bytes.reduce((data, byte) => data + String.fromCharCode(byte), '')
  )
  await Filesystem.writeFile({
    path: `images/${fileName}`,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  })
  const { uri } = await Filesystem.getUri({
    path: `images/${fileName}`,
    directory: Directory.Data,
  })
  return uri
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

function fileExtensionFor(blob: Blob): string {
  const type = blob.type.toLowerCase()
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('svg')) return 'svg'
  if (type.includes('mp4')) return 'mp4'
  if (type.includes('webm')) return 'webm'
  if (type.includes('quicktime')) return 'mov'
  return 'png'
}

export async function saveBlobToDisk(blob: Blob, type: string): Promise<string> {
  try {
    // HEIF → JPEG 转换（覆盖非裁剪直接上传路径）
    const converted = await convertHeifToJpeg(blob)

    // Browser / WebView2: blob URLs are session-only. Persist a data URL so
    // avatars, flags and headers survive an app restart.
    if (!isTauri() && !isCapacitor()) {
      return await blobToDataUrl(converted)
    }

    if (isCapacitor()) {
      const timestamp = Date.now()
      const fileName = `${type}-${timestamp}.${fileExtensionFor(converted)}`
      await ensureCapacitorConvertFileSrc()
      return await writeBlobToCapacitorFs(converted, fileName)
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
    const fileName = `${type}-${timestamp}.${fileExtensionFor(converted)}`
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
