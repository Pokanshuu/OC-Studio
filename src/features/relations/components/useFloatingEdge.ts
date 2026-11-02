'use client'

import { useInternalNode } from '@xyflow/react'

interface NodeGeometry {
  internals?: { positionAbsolute?: { x: number; y: number } }
  measured?: { width?: number; height?: number }
  width?: number
  height?: number
  data?: Record<string, unknown>
}

interface Anchor {
  centerX: number
  centerY: number
  /** 圆形锚点半径；矩形锚点使用 width/height。 */
  radius: number | null
  width: number
  height: number
}

export interface EdgeAnchors {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

function nodeSize(node: NodeGeometry | undefined): { width: number; height: number } {
  return {
    width: node?.measured?.width ?? node?.width ?? 120,
    height: node?.measured?.height ?? node?.height ?? 96,
  }
}

/**
 * 角色/国家用头像圆，事件用图片圆，自定义条目用整张卡片矩形。
 * 连线的起点落在头像边缘而不是圆心，因此不会盖住头像。
 */
function anchorOf(
  node: NodeGeometry | undefined,
  fallbackX: number,
  fallbackY: number,
): Anchor {
  const { width, height } = nodeSize(node)
  const position = node?.internals?.positionAbsolute
  const left = position?.x ?? fallbackX - width / 2
  const top = position?.y ?? fallbackY - height / 2
  const entityType = String(node?.data?.entityType ?? '')
  const customKind = String(node?.data?.customKind ?? '')
  const centerX = left + width / 2

  if (entityType === 'character' || entityType === 'country') {
    // CharacterNode: 56px 头像在最上方；CountryNode 同理。
    return { centerX, centerY: top + 28, radius: 28, width, height }
  }
  if (entityType === 'event') {
    // EventNode: 48px 图片 / 28px 图标。
    return { centerX, centerY: top + 24, radius: 24, width, height }
  }
  if (entityType === 'custom' && customKind === 'entry') {
    return { centerX, centerY: top + height / 2, radius: null, width, height }
  }
  return { centerX, centerY: top + height / 2, radius: null, width, height }
}

function anchorCenter(anchor: Anchor): { x: number; y: number } {
  return { x: anchor.centerX, y: anchor.centerY }
}

function pointToward(anchor: Anchor, towardX: number, towardY: number): { x: number; y: number } {
  const dx = towardX - anchor.centerX
  const dy = towardY - anchor.centerY
  const distance = Math.hypot(dx, dy)
  if (distance < 0.001) return { x: anchor.centerX, y: anchor.centerY }

  if (anchor.radius !== null) {
    const radius = anchor.radius + 2
    return {
      x: anchor.centerX + (dx / distance) * radius,
      y: anchor.centerY + (dy / distance) * radius,
    }
  }

  // 射线与矩形边界求交，保证线从卡片边缘出发。
  const halfWidth = Math.max(1, anchor.width / 2)
  const halfHeight = Math.max(1, anchor.height / 2)
  const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight)
  return {
    x: anchor.centerX + dx * scale,
    y: anchor.centerY + dy * scale,
  }
}

export function useFloatingEdge(
  sourceId: string | undefined,
  targetId: string | undefined,
  fallback: EdgeAnchors,
): EdgeAnchors {
  const sourceNode = useInternalNode(sourceId ?? '') as unknown as NodeGeometry | undefined
  const targetNode = useInternalNode(targetId ?? '') as unknown as NodeGeometry | undefined

  if (!sourceId || !targetId || !sourceNode || !targetNode) return fallback

  const sourceAnchor = anchorOf(sourceNode, fallback.sourceX, fallback.sourceY)
  const targetAnchor = anchorOf(targetNode, fallback.targetX, fallback.targetY)
  const sourceCenter = anchorCenter(sourceAnchor)
  const targetCenter = anchorCenter(targetAnchor)
  const start = pointToward(sourceAnchor, targetCenter.x, targetCenter.y)
  const end = pointToward(targetAnchor, sourceCenter.x, sourceCenter.y)

  return { sourceX: start.x, sourceY: start.y, targetX: end.x, targetY: end.y }
}
