import { resolveImageUrl } from '@/lib/image-service'
import { getVaultSession } from '@/lib/vault/vault-session'

/**
 * 应用级背景图（`docs/主题.md` §2）。
 *
 * 正式库（Tauri）存 `.ocstudio/backgrounds/background-<时间>.webp`，设置里只存相对路径；
 * 浏览器 Mock 没有库，退化成 data URL（只为界面点得动）。
 * 渲染落在 `<html>`：外壳（菜单栏 / 侧栏 / 状态栏）在 `globals.css` 里变半透明纸色，
 * 内容区仍是一块 `bg-paper` 的纸 —— 背景不会穿过正文。
 *
 * 与 Mica 二选一：有背景图时移除 `tauri-mica`，`BlurEffect` 也会跳过。
 */

export type BackgroundMode = 'cover' | 'tile' | 'fixed'

export const BACKGROUND_MAX_EDGE = 2560
export const BACKGROUND_MIN_SCRIM = 0.2
export const BACKGROUND_MAX_SCRIM = 0.8

export function normalizeBackgroundMode(value: unknown): BackgroundMode {
  return value === 'tile' || value === 'fixed' ? value : 'cover'
}

export function normalizeBackgroundScrim(value: unknown): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0.35
  return Math.min(BACKGROUND_MAX_SCRIM, Math.max(BACKGROUND_MIN_SCRIM, number))
}

function rgbOf(color: string): { r: number; g: number; b: number } | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    let value = hex[1]
    if (value.length === 3) value = value.split('').map((char) => char + char).join('')
    const numeric = parseInt(value, 16)
    return { r: (numeric >> 16) & 255, g: (numeric >> 8) & 255, b: numeric & 255 }
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number(part.trim()))
    if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
      return { r: parts[0], g: parts[1], b: parts[2] }
    }
  }
  return null
}

/** 把背景设置落到 `<html>` 的 CSS 变量 + class 上；空图则全部清掉。 */
export function applyAppBackground(
  image: string,
  mode: BackgroundMode,
  scrim: number,
  isDark: boolean,
): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const active = image.trim() !== ''
  root.classList.toggle('oc-background', active)
  root.toggleAttribute('data-app-background', active)

  if (!active) {
    for (const name of ['--oc-bg-image', '--oc-bg-size', '--oc-bg-repeat', '--oc-bg-attachment', '--oc-bg-wash', '--oc-bg-shell']) {
      root.style.removeProperty(name)
    }
    return
  }
  const paper = getComputedStyle(root).getPropertyValue('--oc-paper').trim()
  const rgb = rgbOf(paper) ?? (isDark ? { r: 28, g: 27, b: 26 } : { r: 254, g: 252, b: 248 })
  const alpha = normalizeBackgroundScrim(scrim)

  // 库里存的是相对路径；浏览器 Mock / 旧值才是 data URL。
  // 没绑定库时不要拿一张默认占位图当背景 —— 宁可回纸色。
  const source = image.startsWith('data:') || /^(https?|blob):/.test(image)
    ? image
    : getVaultSession() !== null
      ? resolveImageUrl(image, 'cover')
      : ''
  if (source === '') {
    root.classList.remove('oc-background')
    root.removeAttribute('data-app-background')
    for (const name of ['--oc-bg-image', '--oc-bg-size', '--oc-bg-repeat', '--oc-bg-attachment', '--oc-bg-wash', '--oc-bg-shell']) {
      root.style.removeProperty(name)
    }
    return
  }

  root.style.setProperty('--oc-bg-image', `url("${source.replace(/"/g, '%22')}")`)
  root.style.setProperty('--oc-bg-size', mode === 'tile' ? 'auto' : 'cover')
  root.style.setProperty('--oc-bg-repeat', mode === 'tile' ? 'repeat' : 'no-repeat')
  root.style.setProperty('--oc-bg-attachment', mode === 'fixed' ? 'fixed' : 'scroll')
  root.style.setProperty('--oc-bg-wash', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`)
  // 外壳（菜单栏 / 侧栏 / 状态栏）比整页 wash **更不透明**，而且跟着遮罩一起加深：
  // 原先固定 35%，遮罩调低时侧栏的字就压在照片上读不清；现在最淡也有 44%，
  // 遮罩拉满时到 71% —— 照片仍透得出来，字始终读得清。
  const shellAlpha = Math.min(0.85, 0.35 + 0.45 * alpha)
  root.style.setProperty('--oc-bg-shell', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${shellAlpha.toFixed(3)})`)

  // 背景图与 Mica 互斥：先让位给图，BlurEffect 在初始化时也会跳过。
  // 只撤运行时的材质，**不动用户的开关偏好** —— 去掉背景后应能自动恢复。
  root.classList.remove('tauri-mica')
}

/**
 * 压缩上传的背景图：长边 ≤ 2560，WebP 0.86。
 * `createImageBitmap` 不认识的格式（如 HEIC）退回原文件 data URL，至少不会静默失败。
 * 同时返回字节，给 Tauri 写 `.ocstudio/backgrounds/` 用。
 */
export interface CompressedBackground {
  dataUrl: string
  bytes: Uint8Array
}

function bytesOfDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return new Uint8Array()
  const base64 = dataUrl.slice(comma + 1)
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return new Uint8Array()
  }
}

export async function compressBackgroundImage(file: File): Promise<CompressedBackground> {
  const readAsDataUrl = async (): Promise<CompressedBackground> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
    return { dataUrl, bytes: new Uint8Array(await file.arrayBuffer()) }
  }

  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return readAsDataUrl()
  }

  try {
    const scale = Math.min(1, BACKGROUND_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return readAsDataUrl()
    context.drawImage(bitmap, 0, 0, width, height)
    const webp = canvas.toDataURL('image/webp', 0.86)
    if (!webp.startsWith('data:image/webp')) return readAsDataUrl()
    return { dataUrl: webp, bytes: bytesOfDataUrl(webp) }
  } finally {
    bitmap.close()
  }
}
