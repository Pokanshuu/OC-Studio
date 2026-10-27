import { BrowserAdapter } from './adapters/browser-adapter'
import type { LocalAdapter } from './adapters/local-adapter'
import { convertHeifToJpeg } from './image-heif'
import { isTauri, isCapacitor } from './env'
import { vaultFs } from './vault/vault-fs'

let adapter: BrowserAdapter | LocalAdapter = new BrowserAdapter()
let tauriAppDataDir = ''
let tauriConvertFileSrc: ((path: string) => string) | null = null

// ── vault 模式 ──────────────────────────────────────────────────────────
// 打开 vault 时，素材必须落在 **vault 里**，否则把文件夹拷走会缺图。
// 约定：相对路径（`附件/x.png`）一律相对 vault 根解析；绝对路径与 http/data
// 仍按原样处理，历史数据（`images/x.png` 落在 appData）在关闭 vault 后照旧可用。

let vaultRoot: string | null = null
let vaultAssetsDir = '附件'

/** 由 VaultProvider 在装载/关闭 vault 时调用 */
export function setVaultImageContext(root: string | null, assetsDir = '附件'): void {
  vaultRoot = root === null ? null : root.replace(/\\/g, '/').replace(/\/+$/, '')
  vaultAssetsDir = assetsDir.replace(/^\/+|\/+$/g, '') || '附件'
}

export function getVaultImageContext(): { root: string; assetsDir: string } | null {
  return vaultRoot === null ? null : { root: vaultRoot, assetsDir: vaultAssetsDir }
}

const DEFAULT_IMAGES: Record<string, string> = {
  avatar: '/images/defaults/character-avatar.svg',
  flag: '/images/defaults/country-emblem.svg',
  header: '/images/defaults/header-placeholder.svg',
}

export function getDefaultImage(type: string): string {
  return DEFAULT_IMAGES[type] || DEFAULT_IMAGES.avatar
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
  // vault 模式：把用户选的文件读成 Blob，交给 saveBlobToDisk 统一处理
  // （HEIF 转换、裁剪流水线、落到 vault 素材目录都由它负责）
  if (vaultRoot !== null && isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'] }],
      })
      if (picked === null || typeof picked !== 'string') return ''
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const bytes = await readFile(picked)
      return await saveBlobToDisk(new Blob([bytes]), type)
    } catch (err) {
      console.error('[uploadImage] vault 素材导入失败，回落到内置数据库路径:', err)
    }
  }

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
  if (path.startsWith('https://') || path.startsWith('http://') || path.startsWith('data:') || path.startsWith('blob:')) return path
  if (path.startsWith('/')) return path

  // vault 模式：相对路径就是 vault 内的素材，直接相对 vault 根解析
  if (vaultRoot !== null && isTauri()) {
    const base = vaultRoot.replace(/\/+$/, '')
    const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
    const toSrc = tauriConvertFileSrc
    if (toSrc !== null) return toSrc(`${base}/${normalized}`)
  }

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

export async function saveBlobToDisk(blob: Blob, type: string): Promise<string> {
  try {
    // HEIF → JPEG 转换（覆盖非裁剪直接上传路径）
    const converted = await convertHeifToJpeg(blob)

    if (isCapacitor()) {
      const timestamp = Date.now()
      const fileName = `${type}-${timestamp}.png`
      await ensureCapacitorConvertFileSrc()
      return await writeBlobToCapacitorFs(converted, fileName)
    }

    if (!isTauri()) {
      return URL.createObjectURL(converted)
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

    const arrayBuffer = await converted.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    await writeFile(destPath, bytes)

    const appDataRel = `images/${fileName}`

    // vault 模式：再原生复制进 vault 的素材目录，返回值改为 vault 相对路径。
    // 不直接把字节过 IPC —— Tauri 的 invoke 会把 number[] 序列化成 JSON，
    // 一张 2MB 的图会变成几 MB 的文本；先落 appData 再原生复制，代价小得多。
    if (vaultRoot !== null) {
      const relPath = `${vaultAssetsDir}/${fileName}`
      try {
        await vaultFs.importFile(vaultRoot, destPath, relPath)
        return relPath
      } catch (err) {
        console.error('[saveBlobToDisk] 复制进 vault 失败，回落到 appData 路径:', err)
      }
    }

    return appDataRel
  } catch (err) {
    console.error('[saveBlobToDisk] FAILED, falling back to blob URL:', err)
    return URL.createObjectURL(blob)
  }
}

export { getCroppedBlob, getCroppedDataUrl } from './image-crop'
