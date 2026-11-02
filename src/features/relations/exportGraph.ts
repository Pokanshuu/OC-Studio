'use client'

import type { Edge, Node } from '@xyflow/react'
import { resolveImageUrl } from '@/lib/image-service'
import { downloadBlob } from '@/lib/zip'
import { blobFromLocalPath, blobToDataUrl, isTauriRuntime } from '@/lib/local-media'
import { resolveRelationArrow, resolveRelationColor, type RelationArrow } from './style'

/**
 * 关系图 PNG 导出。
 * 不依赖任何第三方截图库，直接按当前节点坐标重绘：
 * 连线 → 箭头 → 标签 → 头像/卡片，完全离线。
 */

const PAPER = '#F5F1EA'
const PAPER_CARD = '#FBF8F3'
const INK = '#3A3733'
const INK_MUTED = '#7C776F'
const LINE = '#D9D3C8'

interface Point {
  x: number
  y: number
}

interface Anchor extends Point {
  radius: number | null
  width: number
  height: number
}

function nodeRect(node: Node): { x: number; y: number; width: number; height: number } {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? (node.width as number | undefined) ?? 140,
    height: node.measured?.height ?? (node.height as number | undefined) ?? 86,
  }
}

function anchorOf(node: Node): Anchor {
  const rect = nodeRect(node)
  const centerX = rect.x + rect.width / 2
  const entityType = String(node.data?.entityType ?? '')
  const customKind = String(node.data?.customKind ?? '')
  if (entityType === 'character' || entityType === 'country') {
    return { x: centerX, y: rect.y + 28, radius: 28, width: rect.width, height: rect.height }
  }
  if (entityType === 'event') {
    return { x: centerX, y: rect.y + 24, radius: 24, width: rect.width, height: rect.height }
  }
  if (entityType === 'custom' && customKind === 'entry') {
    return { x: centerX, y: rect.y + rect.height / 2, radius: null, width: rect.width, height: rect.height }
  }
  return { x: centerX, y: rect.y + rect.height / 2, radius: null, width: rect.width, height: rect.height }
}

function edgePoint(anchor: Anchor, toward: Point): Point {
  const dx = toward.x - anchor.x
  const dy = toward.y - anchor.y
  const distance = Math.hypot(dx, dy)
  if (distance < 0.001) return { x: anchor.x, y: anchor.y }
  if (anchor.radius !== null) {
    const radius = anchor.radius + 2
    return { x: anchor.x + (dx / distance) * radius, y: anchor.y + (dy / distance) * radius }
  }
  const halfWidth = Math.max(1, anchor.width / 2)
  const halfHeight = Math.max(1, anchor.height / 2)
  const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight)
  return { x: anchor.x + dx * scale, y: anchor.y + dy * scale }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}

async function imageToDataUrl(src: string): Promise<string | null> {
  if (!src || src.startsWith('blob:')) return null
  if (src.startsWith('data:')) return src
  try {
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error ?? new Error('read failed'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function loadImage(src: string, localPath?: string): Promise<HTMLImageElement | null> {
  let dataUrl: string | null = null
  if (localPath && isTauriRuntime()) {
    const blob = await blobFromLocalPath(localPath)
    if (blob) dataUrl = await blobToDataUrl(blob)
  }
  if (!dataUrl) dataUrl = await imageToDataUrl(src)
  if (!dataUrl) return null
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  from: Point,
  color: string,
  size: number,
): void {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
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

function arrowVisible(arrow: RelationArrow, side: 'start' | 'end'): boolean {
  if (arrow === 'both') return true
  if (arrow === 'forward') return side === 'end'
  if (arrow === 'reverse') return side === 'start'
  return false
}

export interface ExportRelationGraphOptions {
  filename?: string
  title?: string
}

export async function exportRelationGraphPng(
  nodes: Node[],
  edges: Edge[],
  options: ExportRelationGraphOptions = {},
): Promise<string> {
  if (nodes.length === 0) {
    throw new Error('当前关系图为空，无法导出')
  }

  const padding = 90
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const node of nodes) {
    const rect = nodeRect(node)
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  const contentWidth = Math.max(320, maxX - minX)
  const contentHeight = Math.max(240, maxY - minY)
  const maxSide = 7000
  const pixelRatio = Math.min(2, maxSide / Math.max(contentWidth, contentHeight))
  const scale = Math.max(0.4, pixelRatio)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(contentWidth * scale)
  canvas.height = Math.ceil(contentHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建导出画布')

  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  ctx.fillStyle = PAPER
  ctx.fillRect(minX, minY, contentWidth, contentHeight)

  // 细微点阵背景，与界面中的关系图画布一致。
  ctx.fillStyle = '#E2DCD1'
  for (let x = minX + 24; x < maxX; x += 24) {
    for (let y = minY + 24; y < maxY; y += 24) {
      ctx.fillRect(x, y, 1, 1)
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  // 先画连线，再画节点，避免线穿过头像。
  for (const edge of edges) {
    if (edge.hidden) continue
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode) continue
    const sourceAnchor = anchorOf(sourceNode)
    const targetAnchor = anchorOf(targetNode)
    const start = edgePoint(sourceAnchor, { x: targetAnchor.x, y: targetAnchor.y })
    const end = edgePoint(targetAnchor, { x: sourceAnchor.x, y: sourceAnchor.y })

    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.max(1, Math.hypot(dx, dy))
    const normalX = -dy / length
    const normalY = dx / length
    const bow = 22
    const control = {
      x: (start.x + end.x) / 2 + normalX * bow,
      y: (start.y + end.y) / 2 + normalY * bow,
    }

    const color = resolveRelationColor(edge.data?.color)
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.6
    ctx.stroke()

    const arrow = resolveRelationArrow(edge.data?.arrow)
    if (arrowVisible(arrow, 'start')) {
      drawArrow(ctx, start, { x: control.x, y: control.y }, color, 9)
    }
    if (arrowVisible(arrow, 'end')) {
      drawArrow(ctx, end, { x: control.x, y: control.y }, color, 9)
    }

    const label = String(
      edge.data?.label ?? edge.data?.relation ?? edge.label ?? '',
    ).trim()
    if (label) {
      const labelX = 0.25 * start.x + 0.5 * control.x + 0.25 * end.x
      const labelY = 0.25 * start.y + 0.5 * control.y + 0.25 * end.y
      ctx.font = '11px "Noto Sans SC", "Microsoft YaHei", sans-serif'
      const textWidth = ctx.measureText(label).width
      const boxWidth = textWidth + 14
      const boxHeight = 20
      roundedRect(ctx, labelX - boxWidth / 2, labelY - boxHeight / 2, boxWidth, boxHeight, 4)
      ctx.fillStyle = withAlpha(PAPER_CARD, 0.96)
      ctx.fill()
      ctx.strokeStyle = withAlpha(color, 0.45)
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, labelX, labelY + 0.5)
    }
  }

  for (const node of nodes) {
    const rect = nodeRect(node)
    const entityType = String(node.data?.entityType ?? '')
    const customKind = String(node.data?.customKind ?? '')
    const label = String(node.data?.label ?? '')
    const accent = typeof node.data?.accentColor === 'string' && node.data.accentColor
      ? node.data.accentColor
      : '#8C877E'

    if (entityType === 'custom') {
      ctx.save()
      roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 12)
      if (customKind === 'section') {
        ctx.fillStyle = withAlpha(accent, 0.1)
        ctx.fill()
        ctx.strokeStyle = withAlpha(accent, 0.45)
      } else {
        ctx.fillStyle = PAPER_CARD
        ctx.fill()
        ctx.strokeStyle = LINE
      }
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()

      const avatarUrl = node.data?.avatarUrl
      if (typeof avatarUrl === 'string' && avatarUrl) {
        const image = await loadImage(resolveImageUrl(avatarUrl, 'avatar'), avatarUrl)
        const cx = rect.x + 22
        const cy = rect.y + 22
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, 13, 0, Math.PI * 2)
        ctx.clip()
        if (image) ctx.drawImage(image, cx - 13, cy - 13, 26, 26)
        else {
          ctx.fillStyle = withAlpha(accent, 0.25)
          ctx.fillRect(cx - 13, cy - 13, 26, 26)
        }
        ctx.restore()
      }

      ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif'
      ctx.fillStyle = INK
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const textY = rect.y + (typeof node.data?.avatarUrl === 'string' && node.data.avatarUrl ? 42 : rect.height / 2 - 8)
      ctx.fillText(truncate(ctx, label, rect.width - 16), rect.x + rect.width / 2, textY)
      continue
    }

    const anchor = anchorOf(node)
    const radius = anchor.radius ?? 24

    // 头像圆形背景
    ctx.save()
    ctx.beginPath()
    ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = PAPER_CARD
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = PAPER
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.strokeStyle = LINE
    ctx.stroke()
    ctx.restore()

    const imagePath =
      entityType === 'character'
        ? (node.data?.qAvatarUrl || node.data?.avatarUrl)
        : entityType === 'country'
          ? node.data?.flagUrl
          : node.data?.imageUrl
    let image: HTMLImageElement | null = null
    if (typeof imagePath === 'string' && imagePath) {
      image = await loadImage(
        resolveImageUrl(imagePath, entityType === 'country' ? 'flag' : entityType === 'event' ? 'header' : 'avatar'),
        imagePath,
      )
    }

    ctx.save()
    ctx.beginPath()
    ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2)
    ctx.clip()
    if (image) {
      ctx.drawImage(image, anchor.x - radius, anchor.y - radius, radius * 2, radius * 2)
    } else {
      ctx.fillStyle = withAlpha(accent, 0.22)
      ctx.fillRect(anchor.x - radius, anchor.y - radius, radius * 2, radius * 2)
      ctx.font = '13px "Noto Sans SC", "Microsoft YaHei", sans-serif'
      ctx.fillStyle = INK_MUTED
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label.slice(0, 1), anchor.x, anchor.y)
    }
    ctx.restore()

    ctx.font = '12px "Noto Sans SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(truncate(ctx, label, Math.max(96, radius * 3)), anchor.x, anchor.y + radius + 8)

    const subtitle = node.data?.subtitle
    if (typeof subtitle === 'string' && subtitle) {
      ctx.font = '10px "Noto Sans SC", "Microsoft YaHei", sans-serif'
      ctx.fillStyle = INK_MUTED
      ctx.fillText(truncate(ctx, subtitle, Math.max(96, radius * 3)), anchor.x, anchor.y + radius + 24)
    }
  }

  if (options.title) {
    ctx.font = '600 16px "Noto Serif SC", "Songti SC", serif'
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(options.title, minX + 24, minY + 22)
  }

  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
  const filename = options.filename ?? `OC关系图-${stamp}.png`

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('导出图片失败，请重试')
  downloadBlob(blob, filename)
  return filename
}
