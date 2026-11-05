/**
 * 地图底图（图片文件）的保存与删除。
 *
 * 口径（`docs/地图.md` §2）：底图是**随库走的文件**，落在 `.ocstudio/maps/`，
 * 不是数据库记录。`map_image` 只存这个目录下的相对路径，换机器后由
 * `listMapAssets()`（Rust `vault_list_assets`）重新枚举出来。
 *
 * 桌面 + 已打开笔记库：
 *   appData 临时文件 → `vault_import_file` 原生复制进 `.ocstudio/maps/`
 * 浏览器 / 未打开笔记库：
 *   回退到 `saveBlobToDisk`（浏览器是 blob: 地址，刷新即失效），返回 `ephemeral: true`
 */
import { readMediaBlob } from '@/lib/download'
import { isTauri } from '@/lib/env'
import {
  removeAppDataTemp,
  saveBlobToDisk,
  writeBlobToAppDataTemp,
} from '@/lib/image-service'
import { mimeFromPath } from '@/lib/local-media'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { sanitizeFileName } from '@/lib/vault/vault-paths'
import { MAP_ASSET_DIR } from './services'

export interface SaveMapImageOptions {
  /** 地图名，用作文件名前缀；缺省 `map` */
  name?: string
  /**
   * 固定文件名（`.ocstudio/maps/` 下的相对文件名，不带目录）。
   *
   * 切视图用：一档一张、原地覆盖，文件名由「地图名 + 视图」决定。
   * 不给就退回「地图名-时间戳」，撞名自动 `-2` 不覆盖。
   */
  fileName?: string
  /** 允许覆盖同路径的已有文件（`fileName` 给定时才有意义） */
  replace?: boolean
}

export interface SavedMapImage {
  /** 库内相对路径（`.ocstudio/maps/…`）；浏览器回退时是 blob: 地址 */
  relPath: string
  width: number
  height: number
  /**
   * true = 没写进笔记库（浏览器预览 / 未打开笔记库）。
   * 这种地址只在本会话有效，不能当成可长期引用的 `map_image`。
   */
  ephemeral: boolean
}

const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

function extensionOf(mime: string): string {
  return MIME_EXTENSION[mime.toLowerCase()] ?? 'png'
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

/** 文件名里的时间戳：本地时间、可排序、无分隔符（Windows 文件名安全） */
function timestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    two(date.getMonth() + 1),
    two(date.getDate()),
    '-',
    two(date.getHours()),
    two(date.getMinutes()),
    two(date.getSeconds()),
  ].join('')
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

/** 读出图片的自然尺寸；解不出来就明确报错（底图没有尺寸，导出与画布比例都会错） */
async function measureImage(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    const loaded = new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true)
      image.onerror = () => resolve(false)
    })
    image.src = url
    const ok = await loaded
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!ok || width <= 0 || height <= 0) throw new Error('底图解码失败')
    return { width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function blobOf(bytes: number[], type: string): Blob {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Blob([copy.buffer], { type })
}

/**
 * 从路径读回一张底图的字节。
 *
 * 上传器交给我们的是**路径**（`附件/qavatar-…png` 或 `blob:`），而底图必须重新
 * 落进 `.ocstudio/maps/`。三条读取顺序与 `media-download` 一致：
 * data / blob / http → 直接 fetch；库内相对路径 → Rust `vault_read_bytes`
 * （CSP 不让 fetch asset 协议，但读字节不受影响）；其余 → `readMediaBlob` 兜底。
 */
export async function readMapImageBlob(reference: string): Promise<Blob> {
  const path = reference.trim()
  if (path.length === 0) throw new Error('没有可读取的底图')

  if (/^(data:|blob:|https?:)/i.test(path)) {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`读取底图失败（HTTP ${response.status}）`)
    const blob = await response.blob()
    if (blob.size === 0) throw new Error('底图文件是空的')
    return blob
  }

  const session = getVaultSession()
  const isRelative = !/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith('/')
  if (session !== null && isVaultSupported() && isRelative) {
    try {
      const bytes = await vaultFs.readBytes(session.root, path)
      if (bytes.length === 0) throw new Error('底图文件是空的')
      return blobOf(bytes, mimeFromPath(path))
    } catch (err) {
      // 路径不在库里（例如刚落到 appData 的临时文件）→ 继续走 readMediaBlob
      console.warn('[map] 笔记库读取底图失败，改走媒体读取', err)
    }
  }

  const blob = await readMediaBlob(path)
  if (blob === null || blob.size === 0) throw new Error(`读不到底图：${path}`)
  return blob
}

/** 同一秒内连续保存同一张图时，补 `-2`、`-3`，不覆盖已有底图 */
async function allocateAssetPath(root: string, fileName: string): Promise<string> {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let candidate = `${MAP_ASSET_DIR}/${fileName}`
  let counter = 2
  while (await vaultFs.exists(root, candidate)) {
    candidate = `${MAP_ASSET_DIR}/${stem}-${counter}${ext}`
    counter += 1
  }
  return candidate
}

/** 一档视图的固定文件名：同名地图 + 同一档永远指向同一个文件 */
export function mapViewFileName(mapName: string, view: string): string {
  const stem = sanitizeFileName(mapName.trim() || 'map')
  return `${stem}-${view}.png`
}

/**
 * 保存一张地图底图，返回可直接写入 `map_image` 的相对路径与像素尺寸。
 *
 * 只在“桌面 + 已打开笔记库”时落进 `.ocstudio/maps/`；其它情况返回临时地址，
 * 由调用方决定是否允许写进笔记（`ephemeral`）。
 */
export async function saveMapImage(blob: Blob, opts: SaveMapImageOptions = {}): Promise<SavedMapImage> {
  const { width, height } = await measureImage(blob)
  const extension = extensionOf(blob.type || 'image/png')
  const stem = sanitizeFileName((opts.name ?? '').trim() || 'map')
  // 固定文件名（切视图）必须带 .png，否则 `<stem>-terrain` 会写成没有扩展名的文件
  const fileName = opts.fileName
    ? `${sanitizeFileName(opts.fileName.replace(/\.png$/i, ''))}.${extension}`
    : `${stem}-${timestamp()}.${extension}`

  const session = getVaultSession()
  if (isTauri() && isVaultSupported() && session !== null) {
    const tempPath = await writeBlobToAppDataTemp(blob, fileName)
    try {
      const relPath = opts.fileName && opts.replace
        ? `${MAP_ASSET_DIR}/${fileName}`
        : await allocateAssetPath(session.root, fileName)
      await vaultFs.importFile(session.root, tempPath, relPath)
      return { relPath, width, height, ephemeral: false }
    } catch (err) {
      throw new Error(`底图保存到笔记库失败：${messageOf(err)}`)
    } finally {
      await removeAppDataTemp(tempPath)
    }
  }

  const relPath = await saveBlobToDisk(blob, 'map')
  return { relPath, width, height, ephemeral: true }
}

/**
 * 删除 `.ocstudio/maps/` 下的一张底图。
 *
 * 浏览器 / 未打开笔记库不删（返回 false）——那里没有可删的随库文件。
 * 只接受该目录下的相对路径，避免误删笔记或素材。
 */
export async function deleteMapImage(relPath: string): Promise<boolean> {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized.startsWith(`${MAP_ASSET_DIR}/`)) {
    throw new Error(`只能删除 ${MAP_ASSET_DIR}/ 下的底图`)
  }

  if (!isVaultSupported()) return false
  const session = getVaultSession()
  if (session === null) return false

  await vaultFs.remove(session.root, normalized)
  return true
}
