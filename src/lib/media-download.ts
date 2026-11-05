/**
 * 把库里的图片 / 动画保存到用户选的位置（「保存到…」的能力层）。
 *
 * 三环境显式分支，一个都不许静默：
 * - **Tauri**：`plugin-dialog save` 拿绝对路径 → Rust `save_bytes` 原子写。
 *   不能用 `<a download>`：WebView2 里那条路不可靠（桌面版「点了没反应」）。
 * - **Capacitor**：写进 `Directory.Documents`（文件名撞了就加时间戳），返回写入路径。
 *   没装 Share 插件，所以不做「写盘后再分享」那一步。
 * - **浏览器**：`<a download>` + appendChild + click，延迟 revoke。
 *
 * 三种来源：
 * - `data:` / `blob:` / `http(s):` → 直接 fetch 取字节
 * - 相对路径（`附件/x.png`）→ 走 vault 的 `vault_read_bytes`（文件在库里）
 * - 其它（绝对路径）→ Tauri asset 协议地址 fetch
 *
 * **读不到字节一律抛错**（以前返回 null，调用方就只剩「点了没反应」）。
 * 只有「用户在保存对话框里按了取消」才返回 null —— 那不是失败，调用方不该提示。
 */
import { invoke } from '@tauri-apps/api/core'
import { isNativePlatform, isTauri } from '@/lib/env'
import { getVaultImageContext } from '@/lib/image-service'
import { vaultFs, isVaultSupported } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
}

function fileNameOf(path: string, fallback: string): string {
  // data: / blob: 里没有可用的文件名（data URL 的 base64 甚至会被当成分段）
  if (/^(data:|blob:)/i.test(path)) return fallback
  const clean = path.split(/[?#]/)[0]
  const name = clean.split(/[\\/]/).pop() ?? ''
  return name.length > 0 ? name : fallback
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function mimeOf(name: string): string {
  return MIME_BY_EXT[extensionOf(name)] ?? 'application/octet-stream'
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    throw new Error(`读不到这个文件的原始字节：${messageOf(err)}`)
  }
  if (!response.ok) throw new Error(`读不到这个文件的原始字节（HTTP ${response.status}）`)
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0) throw new Error('这个文件是空的')
  return new Uint8Array(buffer)
}

/**
 * 读原始字节；读不到就抛。
 * 返回 null 会让「保存失败」和「用户取消」混成一件事，调用方无法区分。
 */
async function readBytes(path: string): Promise<Uint8Array> {
  if (/^(data:|blob:|https?:)/i.test(path)) return fetchBytes(path)

  // 库内相对路径：由 Rust 直接读字节（不经浏览器缓存）
  const root = getVaultSession()?.root ?? getVaultImageContext()?.root
  if (root && isVaultSupported() && !/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith('/')) {
    const bytes = await vaultFs.readBytes(root, path)
    if (bytes.length === 0) throw new Error('这个文件是空的')
    return new Uint8Array(bytes)
  }

  // Capacitor：上传落的是 `file://` 绝对路径，走 WebView 的本地文件代理才读得到
  if (isNativePlatform() && path.startsWith('file://')) {
    const { Capacitor } = await import('@capacitor/core')
    return fetchBytes(Capacitor.convertFileSrc(path))
  }

  // 桌面绝对路径：走 asset 协议取
  if (!isTauri()) throw new Error('读不到这个路径的文件')
  const { convertFileSrc } = await import('@tauri-apps/api/core')
  return fetchBytes(convertFileSrc(path))
}

/** 字节 → base64。分块拼，避免一次性 `String.fromCharCode(...bytes)` 爆栈。 */
function base64Of(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const slice = bytes.subarray(offset, offset + chunk)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

/** Capacitor：`Documents` 里同名文件已存在时，追加时间戳（再撞就加序号） */
async function uniqueDocumentName(name: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const exists = async (candidate: string): Promise<boolean> => {
    try {
      await Filesystem.stat({ path: candidate, directory: Directory.Documents })
      return true
    } catch {
      return false
    }
  }
  if (!(await exists(name))) return name

  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
  let candidate = `${stem}-${stamp}${ext}`
  let counter = 2
  while (await exists(candidate)) {
    candidate = `${stem}-${stamp}-${counter}${ext}`
    counter += 1
  }
  return candidate
}

/** Tauri：系统保存对话框 + `save_bytes`。用户取消返回 null。 */
async function saveWithDialog(bytes: Uint8Array, name: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const target = await save({ defaultPath: name })
  if (target === null) return null
  // 注：`Vec<u8>` 走 IPC 是 JSON 数组，大视频的内存/耗时开销见回传的遗留风险
  await invoke<number>('save_bytes', { path: target, bytes: Array.from(bytes) })
  return target
}

/** Capacitor：写进 Documents（可被其它 App 找到），返回写入路径。 */
async function saveToDocuments(bytes: Uint8Array, name: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const target = await uniqueDocumentName(name)
  await Filesystem.writeFile({
    path: target,
    data: base64Of(bytes),
    directory: Directory.Documents,
  })
  const { uri } = await Filesystem.getUri({ path: target, directory: Directory.Documents })
  return uri || target
}

/** 浏览器：`<a download>`。延迟 revoke，否则部分 WebView 会在下载启动前把 blob 收走。 */
function saveInBrowser(bytes: Uint8Array, name: string): string {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeOf(name) })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return name
}

/**
 * 把一段字节保存到用户选的位置（图片导出等「不是库里现成文件」的场景）。
 * 三环境分支与 `downloadMediaFile` 完全一致：Tauri 系统对话框 + `save_bytes`，
 * Capacitor 写 Documents，浏览器 `<a download>`。用户取消返回 null。
 */
export async function saveBytesFile(bytes: Uint8Array, name: string): Promise<string | null> {
  if (bytes.length === 0) throw new Error('没有可保存的内容')
  if (isTauri()) return saveWithDialog(bytes, name)
  if (isNativePlatform()) return saveToDocuments(bytes, name)
  return saveInBrowser(bytes, name)
}

/**
 * 让用户选位置并保存一张图片 / 一段动画。
 * 返回保存位置；**用户取消返回 null**；其它失败一律抛错。
 */
export async function downloadMediaFile(path: string, fallbackName = 'media'): Promise<string | null> {
  if (path.trim() === '') throw new Error('没有可保存的文件')
  const name = fileNameOf(path, fallbackName)

  // 先读字节再弹对话框：读不到就别让用户白选一次路径
  const bytes = await readBytes(path)
  return saveBytesFile(bytes, name)
}
