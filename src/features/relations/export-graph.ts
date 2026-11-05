'use client'

/**
 * 关系图 PNG 导出 —— **离线重绘**，不引第三方截图库。
 *
 * 顺序：纸底（+ 点阵）→ 边（正交 / 曲线）→ 箭头 → 关系名 → 节点 → 标题 / 时间。
 * 三条硬规则：
 * 1. **颜色不写字面量**：纸 / 线 / 墨色从 `getComputedStyle(document.documentElement)` 读 `--oc-*`；
 *    关系色走 `relationColorValue()`（返回 `var(--oc-accent-N)`），这里解析成实际色值。
 *    暗色主题下导出的就是暗色纸 —— 令牌是唯一源。
 * 2. **几何与画布同源**：线型、落点、节点尺寸都来自 `floating-edge.ts` + `NODE_SIZE`，
 *    所以导出的图和屏幕上看到的同一条线、同一个卡片。
 * 3. **单张图读不出来不算失败**：图片取字节失败（跨域 / CSP / asset 协议）就画衬线首字，
 *    整张导出一律能出图。
 *
 * 保存：桌面 = 系统保存对话框 + Rust `save_bytes`（WebView2 里 `<a download>` 不可靠）；
 * 浏览器 / Capacitor = `<a download>`（与 `lib/zip.ts` 的 downloadBlob 同一口径）。
 */

import { invoke } from '@tauri-apps/api/core'
import type { Edge, Node } from '@xyflow/react'
import type { EdgeStyle } from '@/lib/edge-style'
import { cssVar, token, resolveColor, withAlpha, roundedRectPath, truncateText } from '@/lib/canvas-tokens'
import { isTauri } from '@/lib/env'
import { getImageUrl, getVaultImageContext } from '@/lib/image-service'
import { blobFromLocalPath, isTauriRuntime, mimeFromPath } from '@/lib/local-media'
import { arrowEnds, relationColorValue, type RelationArrow } from '@/lib/relation-colors'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { NODE_AVATAR_SIZE, NODE_CARD_SIZE } from './layout'
import {
  nodeAnchor,
  nodeRect,
  relationEdgePath,
  sideVector,
  type GraphNodeRect,
} from './components/floating-edge'
import type { RelationNodeType } from './types'

/** 画布四周留白（标题 / 时间 / 溢出到节点框外的名字都在这里） */
const PADDING = 96
/** 点阵间距：与画布 Background 的 gap=24 一致 */
const DOT_GAP = 24
/** 导出倍率上限与最长边上限（太大既慢又费内存） */
const MAX_SCALE = 2
const MAX_SIDE = 4096
/** 关系名标签的最大文字宽度 */
const LABEL_MAX_WIDTH = 240

interface ExportTokens {
  paper: string
  paperCard: string
  line: string
  ink: string
  inkMuted: string
  inkFaint: string
  sans: string
  serif: string
}

interface Point {
  x: number
  y: number
}

function readTokens(): ExportTokens {
  return {
    paper: token('--oc-paper'),
    paperCard: token('--oc-paper-card'),
    line: token('--oc-line'),
    ink: token('--oc-ink'),
    inkMuted: token('--oc-ink-muted'),
    inkFaint: token('--oc-ink-faint'),
    // 字体不是颜色，取不到就用通用族兜底（两种都对）
    sans: cssVar('--font-sans') || 'sans-serif',
    serif: cssVar('--font-serif') || 'serif',
  }
}

/** 给令牌色加透明度（标签描边、点阵都要半透明；`#RRGGBB` / `rgb()` 都认） */
/** 等比填充 + 居中裁切（等价于 CSS `object-cover`） */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return false
  const scale = Math.max(width / imageWidth, height / imageHeight)
  const sourceWidth = Math.min(imageWidth, width / scale)
  const sourceHeight = Math.min(imageHeight, height / scale)
  ctx.drawImage(
    image,
    (imageWidth - sourceWidth) / 2,
    (imageHeight - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  )
  return true
}

/** 箭头：`dir` 是箭头**指向**的方向（进入节点那一侧） */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  dir: Point,
  color: string,
  size = 8,
): void {
  const angle = Math.atan2(dir.y, dir.x)
  ctx.save()
  ctx.translate(tip.x, tip.y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, size * 0.55)
  ctx.lineTo(-size, -size * 0.55)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

function nodeRectOf(node: Node): GraphNodeRect {
  return nodeRect({
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width,
    height: node.measured?.height,
    entityType: node.data?.entityType,
  })
}

function entityTypeOf(node: Node): RelationNodeType {
  const value = node.data?.entityType
  return value === 'event' || value === 'country' ? value : 'character'
}

function parallelIndexOf(edge: Edge): number {
  const value = Number(edge.data?.parallelIndex ?? 0)
  return Number.isFinite(value) ? value : 0
}

function stampOf(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function dateLabel(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

/**
 * 把一张图读成 Blob（再转对象 URL 画进 canvas，避开跨域污染）。
 * 三种来源与 `media-download.ts` 同口径：库内相对路径 → Rust 直读；Tauri 本地绝对路径 → appData 直读；
 * 其余（http / data / blob）→ fetch。全部失败返回 null（调用方画首字占位）。
 */
async function readImageBlob(path: string, type: 'avatar' | 'flag' | 'header'): Promise<Blob | null> {
  if (!path) return null
  if (path.startsWith('data:')) {
    try {
      const response = await fetch(path)
      return response.ok ? await response.blob() : null
    } catch {
      return null
    }
  }

  const relative =
    !/^[a-zA-Z]:[\\/]/.test(path) &&
    !path.startsWith('/') &&
    !/^[a-z][a-z0-9+.-]*:/i.test(path)
  const root = getVaultSession()?.root ?? getVaultImageContext()?.root
  if (relative && root && isVaultSupported()) {
    try {
      const bytes = await vaultFs.readBytes(root, path)
      if (bytes.length > 0) {
        return new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mimeFromPath(path) })
      }
    } catch {
      // 读不到就往下试：旧数据的相对路径可能落在 appData，也可能是个 http 地址
    }
  }

  if (isTauriRuntime()) {
    const blob = await blobFromLocalPath(path)
    if (blob) return blob
  }

  try {
    const response = await fetch(getImageUrl(path, type))
    if (response.ok) return await response.blob()
  } catch {
    // 跨域 / CSP / asset 协议不可 fetch：这张图退回首字占位，不让整张导出失败
  }
  return null
}

async function loadNodeImage(node: Node): Promise<HTMLImageElement | null> {
  const entityType = entityTypeOf(node)
  const raw =
    entityType === 'character'
      ? (node.data?.avatarUrl as string | undefined)
      : entityType === 'country'
        ? (node.data?.flagUrl as string | undefined)
        : (node.data?.imageUrl as string | undefined)
  if (!raw) return null
  const type = entityType === 'country' ? 'flag' : entityType === 'event' ? 'header' : 'avatar'
  const blob = await readImageBlob(raw, type)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  const image = await loadImageElement(url)
  // 解码完成后再撤会跟 drawImage 抢时序；延迟撤（一张图几十 KB，一分钟内一定画完）
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return image
}

async function loadNodeImages(nodes: Node[]): Promise<Map<string, HTMLImageElement>> {
  const loaded = await Promise.all(
    nodes.map(async (node) => [node.id, await loadNodeImage(node)] as const),
  )
  const map = new Map<string, HTMLImageElement>()
  for (const [id, image] of loaded) {
    if (image) map.set(id, image)
  }
  return map
}

function strokeEdgePath(
  ctx: CanvasRenderingContext2D,
  d: string,
  from: Point,
  to: Point,
): void {
  if (typeof Path2D !== 'undefined') {
    ctx.stroke(new Path2D(d))
    return
  }
  // 极端兜底（没有 Path2D 的引擎）：画直线也比不出图好
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function drawEdgeLabel(
  ctx: CanvasRenderingContext2D,
  tokens: ExportTokens,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.font = `11px ${tokens.sans}`
  const label = truncateText(ctx, text, LABEL_MAX_WIDTH)
  const width = ctx.measureText(label).width + 14
  const height = 20
  roundedRectPath(ctx, x - width / 2, y - height / 2, width, height, 4)
  ctx.fillStyle = tokens.paperCard
  ctx.fill()
  ctx.strokeStyle = withAlpha(color, 0.45)
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y + 0.5)
}

function drawCharacterNode(
  ctx: CanvasRenderingContext2D,
  tokens: ExportTokens,
  rect: GraphNodeRect,
  label: string,
  image: HTMLImageElement | null,
): void {
  const anchor = nodeAnchor(rect)
  const radius = anchor.radius ?? NODE_AVATAR_SIZE / 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(anchor.cx, anchor.cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = tokens.paperCard
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = tokens.line
  ctx.stroke()
  ctx.restore()

  const drawn = image
    ? (() => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(anchor.cx, anchor.cy, radius, 0, Math.PI * 2)
        ctx.clip()
        const ok = drawCover(ctx, image, anchor.cx - radius, anchor.cy - radius, radius * 2, radius * 2)
        ctx.restore()
        return ok
      })()
    : false

  if (!drawn) {
    // 无图 / 图挂了：衬线首字（MEDIA_FALLBACK 的视觉）
    ctx.save()
    ctx.beginPath()
    ctx.arc(anchor.cx, anchor.cy, radius, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = tokens.inkFaint
    ctx.font = `20px ${tokens.serif}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.slice(0, 1), anchor.cx, anchor.cy + 1)
    ctx.restore()
  }

  ctx.font = `12px ${tokens.sans}`
  ctx.fillStyle = tokens.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(truncateText(ctx, label, 80), anchor.cx, rect.y + radius * 2 + 4)
}

function drawCardNode(
  ctx: CanvasRenderingContext2D,
  tokens: ExportTokens,
  rect: GraphNodeRect,
  label: string,
  image: HTMLImageElement | null,
): void {
  const width = Math.min(NODE_CARD_SIZE.w, rect.width)
  const height = Math.min(NODE_CARD_SIZE.h, rect.height)
  const x = rect.x + (rect.width - width) / 2
  const y = rect.y

  roundedRectPath(ctx, x, y, width, height, 4)
  ctx.fillStyle = tokens.paperCard
  ctx.fill()
  ctx.strokeStyle = tokens.line
  ctx.lineWidth = 1
  ctx.stroke()

  const drawn = image
    ? (() => {
        ctx.save()
        roundedRectPath(ctx, x, y, width, height, 4)
        ctx.clip()
        const ok = drawCover(ctx, image, x, y, width, height)
        ctx.restore()
        return ok
      })()
    : false

  if (!drawn) {
    ctx.save()
    roundedRectPath(ctx, x, y, width, height, 4)
    ctx.clip()
    ctx.fillStyle = tokens.inkFaint
    ctx.font = `24px ${tokens.serif}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.slice(0, 1), x + width / 2, y + height / 2 + 1)
    ctx.restore()
  }

  ctx.font = `12px ${tokens.sans}`
  ctx.fillStyle = tokens.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(truncateText(ctx, label, rect.width), rect.x + rect.width / 2, y + height + 4)
}

interface RenderGraphOptions {
  nodes: Node[]
  edges: Edge[]
  edgeStyle: EdgeStyle
  title: string
}

/** 按当前坐标把整张图重绘到离屏画布（不做任何视口变换：导出的是收敛态，不是屏幕截图） */
export async function renderRelationGraphCanvas({ nodes, edges, edgeStyle, title }: RenderGraphOptions): Promise<HTMLCanvasElement> {
  if (nodes.length === 0) throw new Error('当前关系图为空，无法导出')

  const tokens = readTokens()
  const rects = new Map<string, GraphNodeRect>()
  for (const node of nodes) rects.set(node.id, nodeRectOf(node))

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const rect of rects.values()) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) throw new Error('当前关系图为空，无法导出')

  minX -= PADDING
  minY -= PADDING
  maxX += PADDING
  maxY += PADDING

  const contentWidth = Math.max(320, maxX - minX)
  const contentHeight = Math.max(240, maxY - minY)
  // 图特别大时按最长边封顶缩小（不然 canvas 会超出引擎上限），平时固定 2 倍
  const scale = Math.min(MAX_SCALE, MAX_SIDE / Math.max(contentWidth, contentHeight))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(contentWidth * scale))
  canvas.height = Math.max(1, Math.round(contentHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建导出画布')
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  // 纸底
  ctx.fillStyle = tokens.paper
  ctx.fillRect(minX, minY, contentWidth, contentHeight)

  // 点阵（与画布 Background gap=24 / size=1 同观感）
  ctx.fillStyle = withAlpha(tokens.line, 0.75)
  for (let x = minX + DOT_GAP / 2; x < maxX; x += DOT_GAP) {
    for (let y = minY + DOT_GAP / 2; y < maxY; y += DOT_GAP) {
      ctx.fillRect(x, y, 1, 1)
    }
  }

  // 边：先线、后箭头、再关系名（节点最后画，压住穿过去的线）
  for (const edge of edges) {
    if (edge.hidden) continue
    const source = rects.get(edge.source)
    const target = rects.get(edge.target)
    if (!source || !target) continue

    const geometry = relationEdgePath({
      style: edgeStyle,
      source,
      target,
      parallelIndex: parallelIndexOf(edge),
    })
    const color = resolveColor(relationColorValue(edge.data?.color))

    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    strokeEdgePath(ctx, geometry.path, { x: geometry.sourceX, y: geometry.sourceY }, { x: geometry.targetX, y: geometry.targetY })

    const arrow = (edge.data?.arrow as RelationArrow | undefined) ?? 'none'
    const ends = arrowEnds(arrow)
    const outwardSource = sideVector(geometry.sourceSide)
    const outwardTarget = sideVector(geometry.targetSide)
    // 箭头指向节点内部：起点 = 逆着出射方向，终点 = 顺着目标出射方向
    if (ends.start) {
      drawArrowHead(ctx, { x: geometry.sourceX, y: geometry.sourceY }, { x: -outwardSource.x, y: -outwardSource.y }, color)
    }
    if (ends.end) {
      drawArrowHead(ctx, { x: geometry.targetX, y: geometry.targetY }, outwardTarget, color)
    }

    const relation = String(edge.data?.relation ?? '').trim()
    if (relation) {
      drawEdgeLabel(ctx, tokens, relation, geometry.labelX, geometry.labelY, color)
    }
  }

  // 节点
  const images = await loadNodeImages(nodes)
  for (const node of nodes) {
    const rect = rects.get(node.id)
    if (!rect) continue
    const label = String(node.data?.label ?? '')
    const image = images.get(node.id) ?? null
    if (entityTypeOf(node) === 'character') {
      drawCharacterNode(ctx, tokens, rect, label, image)
    } else {
      drawCardNode(ctx, tokens, rect, label, image)
    }
  }

  // 标题 / 时间
  ctx.font = `600 16px ${tokens.serif}`
  ctx.fillStyle = tokens.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(title, minX + 24, minY + 22)

  ctx.font = `11px ${tokens.sans}`
  ctx.fillStyle = tokens.inkFaint
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(dateLabel(), minX + 24, maxY - 22)

  return canvas
}

/** 桌面：系统保存对话框 + Rust `save_bytes`（用户取消返回 null）；浏览器 / Capacitor：`<a download>` */
async function savePng(blob: Blob, filename: string): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const target = await save({
      defaultPath: filename,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })
    if (target === null) return null
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await invoke<number>('save_bytes', { path: target, bytes: Array.from(bytes) })
    return target
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return filename
}

export interface ExportRelationGraphOptions {
  nodes: Node[]
  edges: Edge[]
  edgeStyle: EdgeStyle
  title?: string
  filename?: string
}

/**
 * 导出当前关系图为 PNG。
 * 返回落盘路径（桌面）或文件名（浏览器）；**用户在保存对话框里取消时返回 null**；其它失败抛错。
 */
export async function exportRelationGraphPng({
  nodes,
  edges,
  edgeStyle,
  title = '关系图',
  filename,
}: ExportRelationGraphOptions): Promise<string | null> {
  const canvas = await renderRelationGraphCanvas({ nodes, edges, edgeStyle, title })
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('导出图片失败，请重试')
  return savePng(blob, filename ?? `OC关系图-${stampOf()}.png`)
}
