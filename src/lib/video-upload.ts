/**
 * OC 动画（视频）上传：库内附件 + frontmatter 路径。
 *
 * 只做「选文件 → 落库 → 返回相对路径」；预览用 `<video>` 直接吃相对路径（resolveImageUrl 同一套）。
 * 浏览器预览没有库可写，返回 blob URL（仅本次会话有效），并在调用方提示。
 */
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isTauri } from '@/lib/env'

const ANIMATION_DIR = '附件'

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : 'mp4'
}

export interface AnimationUploadResult {
  /** 落盘后的相对路径；浏览器预览下是 blob URL */
  path: string
  /** 只在本会话有效（浏览器预览时为 true） */
  ephemeral: boolean
}

export async function uploadAnimation(file: File): Promise<AnimationUploadResult> {
  const session = getVaultSession()
  if (isTauri() && isVaultSupported() && session) {
    const name = `动画-${Date.now()}.${extensionOf(file.name)}`
    const relPath = `${ANIMATION_DIR}/${name}`
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
    await vaultFs.writeBytes(session.root, relPath, bytes)
    return { path: relPath, ephemeral: false }
  }

  // 浏览器预览：没有库可写，只能用会话内的 blob
  return { path: URL.createObjectURL(file), ephemeral: true }
}
