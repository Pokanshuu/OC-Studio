/**
 * 地图导出的「保存到…」链路（宿主侧）。
 *
 * 为什么不只用 `<a download>`：WebView2 里这条老路不可靠（桌面版「点了没反应」）。
 * 为什么不能先 `saveBlobToDisk` 再下载：那会先往库内素材目录塞一张谁都不引用的图，
 * 用户取消保存之后就变成孤儿文件。
 *
 * 所以两种环境各走一条：
 * - 桌面（Tauri）：系统保存对话框拿绝对路径 → Rust `save_bytes` 原子写
 * - 浏览器预览：普通 `<a download>`，延迟 revoke（部分 WebView 会来不及取数据）
 */
import { invoke } from '@tauri-apps/api/core'
import { isCapacitor, isTauri } from '@/lib/env'
import { getVaultImageContext } from '@/lib/image-service'
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported } from '@/lib/vault/vault-fs'

function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'png'
  const ext = base.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'png'
}

/**
 * 把一份 Blob 存到用户选的位置。
 * 返回落盘的绝对路径（浏览器下是文件名）；用户取消返回 `null`。
 */
export async function saveBlobAs(blob: Blob, name: string): Promise<string | null> {
  const fileName = name.trim().length > 0 ? name : 'map.png'

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const target = await save({
      defaultPath: fileName,
      filters: [{ name: '图片', extensions: [extensionOf(fileName)] }],
    })
    if (target === null) return null
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await invoke<number>('save_bytes', { path: target, bytes: Array.from(bytes) })
    return target
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 1000)
  return fileName
}

/* ── 成品导出（底图 + 锚点 → PNG） ───────────────────────────────────── */

export interface MapExportMap {
  /** 底图：库内相对路径 / appData 相对路径 / data: / blob: / 绝对路径 */
  image: string
  /** 底图像素尺寸；缺省时用图片自然尺寸 */
  width?: number
  height?: number
}

export interface MapExportAnchor {
  /** 归一化坐标 0–1（与实体 `map_position` 同一口径） */
  x: number
  y: number
  title: string
  kind?: 'country' | 'event' | 'worldEntry'
}

export interface MapExportOptions {
  fileName?: string
  /** 是否画锚点标签，默认 true */
  withAnchors?: boolean
  /** 输出倍率：1 = 按底图原始像素，默认 1 */
  scale?: number
}

interface LoadedMapImage {
  image: HTMLImageElement
  naturalWidth: number
  naturalHeight: number
  release: () => void
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

/** CSS 令牌取色；Canvas 必须拿到具体颜色值，`var()` 在 fillStyle 里无效 */
function cssColor(token: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value.length > 0 ? value : fallback
}

/** 底图引用 → 可 fetch 的地址（vault 相对路径走 asset 协议） */
async function resolveMapSource(reference: string): Promise<string> {
  if (/^(data:|blob:|https?:|\/)/i.test(reference)) return reference
  if (reference.startsWith('file:')) {
    if (isCapacitor()) {
      const { Capacitor } = await import('@capacitor/core')
      return Capacitor.convertFileSrc(reference)
    }
    return reference
  }

  const session = getVaultSession()
  if (session !== null && isVaultSupported()) {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    const sep = session.root.includes('\\') ? '\\' : '/'
    return convertFileSrc(`${session.root}${sep}${reference.replace(/\//g, sep)}`)
  }

  if (isTauri()) {
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    const context = getVaultImageContext()
    if (context !== null) return convertFileSrc(`${context.root}/${reference}`)

    const { appDataDir } = await import('@tauri-apps/api/path')
    const base = (await appDataDir()).replace(/[\\/]+$/, '')
    const sep = base.includes('\\') ? '\\' : '/'
    return convertFileSrc(`${base}${sep}${reference.replace(/\//g, sep)}`)
  }

  return reference
}

/**
 * 读底图。先 fetch 成 Blob 再走 blob: 地址：asset 协议 / 远端图直接进 canvas
 * 可能被跨域污染，导出时 `toBlob()` 会抛 SecurityError，而且报错很难懂。
 */
async function loadMapImage(reference: string): Promise<LoadedMapImage> {
  const source = await resolveMapSource(reference)
  let objectUrl: string | null = null
  let finalUrl = source

  if (!source.startsWith('data:')) {
    try {
      const response = await fetch(source)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (blob.size === 0) throw new Error('文件为空')
      objectUrl = URL.createObjectURL(blob)
      finalUrl = objectUrl
    } catch (err) {
      throw new Error(`底图读取失败：${reference}（${errorMessage(err)}）`)
    }
  }

  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`底图解码失败：${reference}`))
      image.src = finalUrl
    })
  } catch (err) {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    throw err
  }

  return {
    image,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    release: () => {
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    },
  }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** 长标题按可用宽度截断（`…`），避免标签横穿整张图 */
function fitLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  const chars = Array.from(text)
  let low = 0
  let high = chars.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = `${chars.slice(0, mid).join('')}…`
    if (ctx.measureText(candidate).width <= maxWidth) low = mid
    else high = mid - 1
  }
  return `${chars.slice(0, low).join('')}…`
}

function drawAnchors(
  ctx: CanvasRenderingContext2D,
  anchors: readonly MapExportAnchor[],
  width: number,
  height: number,
): void {
  if (anchors.length === 0) return

  const paper = cssColor('--oc-paper-fixed', 'Canvas')
  const ink = cssColor('--oc-ink-fixed', 'CanvasText')
  const line = cssColor('--oc-line', 'GrayText')
  const fontSize = Math.min(32, Math.max(11, Math.round(Math.min(width, height) * 0.012)))
  const padX = Math.round(fontSize * 0.55)
  const padY = Math.round(fontSize * 0.34)
  const radius = Math.max(3, Math.min(6, Math.round(fontSize * 0.28)))
  const margin = Math.round(fontSize * 0.4)

  ctx.font = `500 ${fontSize}px system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = Math.max(1, Math.round(fontSize / 14))

  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) continue
    const title = anchor.title.trim()
    if (title.length === 0) continue

    const x = Math.min(1, Math.max(0, anchor.x)) * width
    const y = Math.min(1, Math.max(0, anchor.y)) * height
    const label = fitLabel(ctx, title, Math.max(fontSize * 3, width * 0.32))
    const textWidth = ctx.measureText(label).width
    const boxWidth = Math.min(width - margin * 2, textWidth + padX * 2)
    const boxHeight = Math.min(height - margin * 2, fontSize + padY * 2)
    const maxLeft = Math.max(margin, width - boxWidth - margin)
    const maxTop = Math.max(margin, height - boxHeight - margin)
    const left = Math.min(Math.max(x - boxWidth / 2, margin), maxLeft)
    const top = Math.min(Math.max(y - boxHeight / 2, margin), maxTop)

    roundedRectPath(ctx, left, top, boxWidth, boxHeight, radius)
    ctx.fillStyle = paper
    ctx.fill()
    ctx.strokeStyle = line
    ctx.stroke()
    ctx.fillStyle = ink
    ctx.fillText(label, left + boxWidth / 2, top + boxHeight / 2)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

function exportTimestamp(date = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
}

/**
 * 导出成品地图：底图按自然尺寸绘制，锚点画成纸色小圆角标签（系统字体、墨字）。
 *
 * - 底图 / 尺寸读不到时 **throw**（调用方负责 toast）；用户取消保存返回 `null`
 * - 锚点坐标是归一化 0–1；越界值按边界夹取，坏数据跳过
 * - 桌面走系统保存对话框 + Rust `save_bytes`，浏览器退回下载（与 `saveBlobAs` 一致）
 */
export async function exportMapPng(
  map: MapExportMap,
  anchors: readonly MapExportAnchor[],
  options: MapExportOptions = {},
): Promise<string | null> {
  const requestedScale = options.scale ?? 1
  const scale = Number.isFinite(requestedScale) ? Math.min(4, Math.max(0.1, requestedScale)) : 1

  const loaded = await loadMapImage(map.image)
  try {
    const sourceWidth = map.width && map.width > 0 ? map.width : loaded.naturalWidth
    const sourceHeight = map.height && map.height > 0 ? map.height : loaded.naturalHeight
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new Error(`底图尺寸未知：${map.image}`)
    }

    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('当前环境不支持 Canvas，无法导出地图')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(loaded.image, 0, 0, width, height)

    if (options.withAnchors !== false) drawAnchors(ctx, anchors, width, height)

    const blob = await canvasToBlob(canvas)
    if (blob === null) throw new Error('地图导出失败：无法生成 PNG')

    const fileName = options.fileName?.trim() || `地图-${exportTimestamp()}.png`
    return await saveBlobAs(blob, fileName)
  } finally {
    loaded.release()
  }
}
