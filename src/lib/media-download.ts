/**
 * 把库里的图片 / 动画下载到用户选的位置（W6 的「照片下载 / OC 动画」能力层）。
 *
 * 为什么不能 `<a download>`：WebView2 里这条老路不可靠（桌面版「点了没反应」），
 * 所以走「系统保存对话框拿绝对路径 → Rust `save_bytes` 原子写」，和导出备份同一条链。
 *
 * 三种来源：
 * - `data:` / `blob:` / `http(s):` → 直接 fetch 取字节
 * - 相对路径（`附件/x.png`）→ 走 vault 的 `vault_read_bytes`（文件在库里）
 * - 其它（绝对路径）→ Tauri asset 协议地址 fetch
 */
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/env'
import { getVaultImageContext } from '@/lib/image-service'
import { vaultFs, isVaultSupported } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'

function fileNameOf(path: string, fallback: string): string {
  const clean = path.split(/[?#]/)[0]
  const name = clean.split(/[\\/]/).pop() ?? ''
  return name.length > 0 ? name : fallback
}

async function bytesOf(path: string): Promise<Uint8Array | null> {
  if (/^(data:|blob:|https?:)/i.test(path)) {
    try {
      const response = await fetch(path)
      if (!response.ok) return null
      return new Uint8Array(await response.arrayBuffer())
    } catch {
      return null
    }
  }

  // 库内相对路径：由 Rust 直接读字节（不经浏览器缓存）
  const session = getVaultSession()
  const imageContext = getVaultImageContext()
  const root = session?.root ?? imageContext?.root
  if (root && isVaultSupported() && !/^[a-zA-Z]:[\\/]/.test(path) && !path.startsWith('/')) {
    try {
      const bytes = await vaultFs.readBytes(root, path)
      return bytes.length > 0 ? new Uint8Array(bytes) : null
    } catch {
      return null
    }
  }

  // 绝对路径：走 asset 协议取
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    const response = await fetch(convertFileSrc(path))
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * 让用户选位置并保存一张图片 / 一段动画。
 * 返回保存的绝对路径；用户取消返回 null。
 */
export async function downloadMediaFile(path: string, fallbackName = 'media'): Promise<string | null> {
  const name = fileNameOf(path, fallbackName)

  if (!isTauri()) {
    // 浏览器预览：退化成普通下载（仅开发用）
    const bytes = await bytesOf(path)
    if (!bytes) return null
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer])
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(url)
    return name
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const target = await save({ defaultPath: name })
  if (!target) return null

  const bytes = await bytesOf(path)
  if (!bytes) throw new Error('读不到这张图的原始字节')

  await invoke<number>('save_bytes', { path: target, bytes: Array.from(bytes) })
  return target
}
