/**
 * 关系图连线几何 —— **纯函数，唯一源**。
 *
 * 三处消费同一份计算，避免「画布 / 求交 / 导出」各写一套尺寸：
 * - `RelationEdge`（画布上的 SVG 边）
 * - `export-graph.ts`（PNG 离线重绘，同一个 `path` d 串）
 * - 节点尺寸来自 `layout.ts` 的 `NODE_SIZE` / `NODE_CARD_SIZE`
 *
 * 两种边型（docs/关系图.md §2）：
 * - **正交**：四向落点（节点四条边的中点），折线 + 4px 倒角；并行边走自己的车道。
 * - **曲线**：从**形状边缘**发散 —— 角色走圆（圆心 + 半径），国家 / 事件走卡片矩形求交；
 *   并行边靠法线偏移分离。曲线模式下手柄不再显形（见各 *Node.tsx）。
 */

import { Position, getSmoothStepPath } from '@xyflow/react'
import type { EdgeStyle } from '@/lib/edge-style'
import { NODE_AVATAR_SIZE, NODE_CARD_SIZE, NODE_SIZE } from '../layout'
import type { RelationNodeType } from '../types'

export interface Point {
  x: number
  y: number
}

/** 节点矩形（React Flow 坐标：左上角 + 尺寸） */
export interface GraphNodeRect {
  x: number
  y: number
  width: number
  height: number
  entityType?: RelationNodeType
}

/** 节点上的四个落点方位（同时也是 React Flow 的 Position 取值） */
export type EdgeSide = 'top' | 'right' | 'bottom' | 'left'

const POSITION: Record<EdgeSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

/** 线离形状边缘留的缝（贴着画会像描边，悬空又会显脏） */
const EDGE_GAP = 1

/** 正交模式并行边的车道间距 / 出线长度 */
const LANE_GAP = 14
const EDGE_OFFSET = 18

/** 曲线模式：控制点外推比例（≈ 原来 0.25 曲率的观感）与并行边的法线间距 */
const CURVE_BOW = 0.22
const CURVE_LANE = 18

export interface NodeAnchor {
  /** 圆 / 卡片中心 */
  cx: number
  cy: number
  /** 圆形（角色头像）半径；矩形为 null */
  radius: number | null
  halfWidth: number
  halfHeight: number
}

/** 节点尺寸：测量值优先，没有就回落 `NODE_SIZE`（服务端 / 首帧 / 导出时都可能没有 measured） */
export function nodeSizeOf(entityType: RelationNodeType | undefined): { w: number; h: number } {
  return NODE_SIZE[entityType ?? 'character'] ?? NODE_SIZE.character
}

/** 收敛节点数据的实体类型（图里只有这三类；其余一律按角色圆处理） */
export function relationNodeType(value: unknown): RelationNodeType | undefined {
  return value === 'character' || value === 'event' || value === 'country' ? value : undefined
}

/** 节点矩形：画布用 `internals.positionAbsolute` + `measured`，导出用 `position` + `NODE_SIZE` */
export function nodeRect(input: {
  x: number
  y: number
  width?: number
  height?: number
  entityType?: unknown
}): GraphNodeRect {
  const entityType = relationNodeType(input.entityType)
  const size = nodeSizeOf(entityType)
  return {
    x: input.x,
    y: input.y,
    width: input.width ?? size.w,
    height: input.height ?? size.h,
    entityType,
  }
}

/**
 * 形状锚点：
 * - 角色 = 头像圆（圆心在节点顶部的 56px 圆里）
 * - 国家 / 事件 = 卡片矩形（节点顶部 96 × 64，名字在卡片下方，不参与求交）
 */
export function nodeAnchor(rect: GraphNodeRect): NodeAnchor {
  const halfWidth = rect.width / 2
  if ((rect.entityType ?? 'character') === 'character') {
    const radius = NODE_AVATAR_SIZE / 2
    return {
      cx: rect.x + halfWidth,
      cy: rect.y + radius,
      radius,
      halfWidth,
      halfHeight: radius,
    }
  }
  const cardHeight = Math.min(NODE_CARD_SIZE.h, rect.height)
  return {
    cx: rect.x + halfWidth,
    cy: rect.y + cardHeight / 2,
    radius: null,
    halfWidth,
    halfHeight: cardHeight / 2,
  }
}

/**
 * 从锚点中心朝 `toward` 发射，求与形状边界的交点。
 * 圆：半径 + 缝；矩形：射线与矩形边界求交（按两轴所需缩放取大者）。
 */
export function anchorPoint(anchor: NodeAnchor, towardX: number, towardY: number): Point {
  const dx = towardX - anchor.cx
  const dy = towardY - anchor.cy
  const distance = Math.hypot(dx, dy)
  if (distance < 0.001) return { x: anchor.cx, y: anchor.cy }

  if (anchor.radius !== null) {
    const radius = anchor.radius + EDGE_GAP
    return { x: anchor.cx + (dx / distance) * radius, y: anchor.cy + (dy / distance) * radius }
  }

  const scale = 1 / Math.max(
    Math.abs(dx) / (anchor.halfWidth + EDGE_GAP),
    Math.abs(dy) / (anchor.halfHeight + EDGE_GAP),
  )
  return { x: anchor.cx + dx * scale, y: anchor.cy + dy * scale }
}

/** 正交落点：节点矩形四条边的中点（与 React Flow 手柄位置一致） */
export function nodeSidePoint(rect: GraphNodeRect, side: EdgeSide): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    default:
      return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

/** 目标在哪个方位：横向为主走左右，纵向为主走上下 */
export function sideToward(from: Point, to: Point): EdgeSide {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

export function oppositeSide(side: EdgeSide): EdgeSide {
  switch (side) {
    case 'top':
      return 'bottom'
    case 'bottom':
      return 'top'
    case 'left':
      return 'right'
    default:
      return 'left'
  }
}

/** 方向单位向量（从节点指向外侧） */
export function sideVector(side: EdgeSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    default:
      return { x: 1, y: 0 }
  }
}

function unit(x: number, y: number): Point {
  const length = Math.hypot(x, y)
  if (length < 0.001) return { x: 1, y: 0 }
  return { x: x / length, y: y / length }
}

/** 去掉重复点与共线的中间点（否则倒角会在直线上多出小钩） */
function cleanPoints(points: Point[]): Point[] {
  const unique: Point[] = []
  for (const point of points) {
    const last = unique[unique.length - 1]
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5) continue
    unique.push(point)
  }
  if (unique.length < 3) return unique
  const result: Point[] = [unique[0]]
  for (let i = 1; i < unique.length - 1; i += 1) {
    const a = result[result.length - 1]
    const b = unique[i]
    const c = unique[i + 1]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 0.5) continue
    result.push(b)
  }
  result.push(unique[unique.length - 1])
  return result
}

/** 直角折线：点列 → SVG path（拐点用二次曲线倒角） */
function polylinePath(points: Point[], radius: number): string {
  const cleaned = cleanPoints(points)
  if (cleaned.length < 2) return ''
  let d = `M${cleaned[0].x} ${cleaned[0].y}`
  for (let i = 1; i < cleaned.length - 1; i += 1) {
    const previous = cleaned[i - 1]
    const current = cleaned[i]
    const next = cleaned[i + 1]
    const inX = current.x - previous.x
    const inY = current.y - previous.y
    const outX = next.x - current.x
    const outY = next.y - current.y
    const inLength = Math.hypot(inX, inY)
    const outLength = Math.hypot(outX, outY)
    if (inLength < 0.01 || outLength < 0.01) {
      d += ` L${current.x} ${current.y}`
      continue
    }
    const r = Math.min(radius, inLength / 2, outLength / 2)
    const beforeX = current.x - (inX / inLength) * r
    const beforeY = current.y - (inY / inLength) * r
    const afterX = current.x + (outX / outLength) * r
    const afterY = current.y + (outY / outLength) * r
    d += ` L${beforeX} ${beforeY} Q${current.x} ${current.y} ${afterX} ${afterY}`
  }
  const last = cleaned[cleaned.length - 1]
  return `${d} L${last.x} ${last.y}`
}

export interface EdgePathResult {
  /** SVG path 的 d 串（HTMLCanvas 用 `new Path2D(path)` 重放，保证导出与画布同一条线） */
  path: string
  labelX: number
  labelY: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourceSide: EdgeSide
  targetSide: EdgeSide
  /** 起点从节点射出 / 终点进入节点时的行进方向（单位向量）—— 导出用来摆箭头 */
  sourceTangent: Point
  targetTangent: Point
}

export interface EdgePathParams {
  style: EdgeStyle
  source: GraphNodeRect
  target: GraphNodeRect
  /** 同一对节点的第几条边（0 起）：正交走车道，曲线走法线偏移 */
  parallelIndex?: number
}

/**
 * 一条边的完整几何。画布与 PNG 导出都调这一个函数 —— 两边不可能画得不一样。
 */
export function relationEdgePath({ style, source, target, parallelIndex = 0 }: EdgePathParams): EdgePathResult {
  const index = Math.min(2, Math.max(0, parallelIndex))
  const sourceAnchor = nodeAnchor(source)
  const targetAnchor = nodeAnchor(target)
  const sourceSide = sideToward(
    { x: sourceAnchor.cx, y: sourceAnchor.cy },
    { x: targetAnchor.cx, y: targetAnchor.cy },
  )
  const targetSide = oppositeSide(sourceSide)
  const outwardSource = sideVector(sourceSide)
  const outwardTarget = sideVector(targetSide)

  if (style === 'curve') {
    const start = anchorPoint(sourceAnchor, targetAnchor.cx, targetAnchor.cy)
    const end = anchorPoint(targetAnchor, sourceAnchor.cx, sourceAnchor.cy)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const distance = Math.hypot(dx, dy) || 1
    // 法线：并行边沿它推开（这样两条同向的曲线不会重合）
    const normalX = -dy / distance
    const normalY = dx / distance
    const lane = index * CURVE_LANE
    const bow = distance * CURVE_BOW
    const control1 = {
      x: start.x + outwardSource.x * bow + normalX * lane,
      y: start.y + outwardSource.y * bow + normalY * lane,
    }
    const control2 = {
      x: end.x + outwardTarget.x * bow + normalX * lane,
      y: end.y + outwardTarget.y * bow + normalY * lane,
    }
    // 三次贝塞尔中点（t = 0.5）
    const labelX = (start.x + 3 * control1.x + 3 * control2.x + end.x) / 8
    const labelY = (start.y + 3 * control1.y + 3 * control2.y + end.y) / 8
    return {
      path: `M${start.x} ${start.y} C${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`,
      labelX,
      labelY,
      sourceX: start.x,
      sourceY: start.y,
      targetX: end.x,
      targetY: end.y,
      sourceSide,
      targetSide,
      sourceTangent: unit(control1.x - start.x, control1.y - start.y),
      targetTangent: unit(end.x - control2.x, end.y - control2.y),
    }
  }

  const start = nodeSidePoint(source, sourceSide)
  const end = nodeSidePoint(target, targetSide)
  const lane = index * LANE_GAP
  if (lane > 0) {
    // 并行边：两端仍落在手柄上，中段拐进自己的车道（两个手柄在同一 y 上时折线会完全重合）
    const horizontal = sourceSide === 'right' || sourceSide === 'left'
    const sign = sourceSide === 'right' || sourceSide === 'bottom' ? 1 : -1
    const middleY = (start.y + end.y) / 2 + lane
    const middleX = (start.x + end.x) / 2 + lane
    const points: Point[] = horizontal
      ? [
          start,
          { x: start.x + sign * EDGE_OFFSET, y: start.y },
          { x: start.x + sign * EDGE_OFFSET, y: middleY },
          { x: end.x - sign * EDGE_OFFSET, y: middleY },
          { x: end.x - sign * EDGE_OFFSET, y: end.y },
          end,
        ]
      : [
          start,
          { x: start.x, y: start.y + sign * EDGE_OFFSET },
          { x: middleX, y: start.y + sign * EDGE_OFFSET },
          { x: middleX, y: end.y - sign * EDGE_OFFSET },
          { x: end.x, y: end.y - sign * EDGE_OFFSET },
          end,
        ]
    return {
      path: polylinePath(points, 4),
      labelX: horizontal ? (start.x + end.x) / 2 : middleX,
      labelY: horizontal ? middleY : (start.y + end.y) / 2,
      sourceX: start.x,
      sourceY: start.y,
      targetX: end.x,
      targetY: end.y,
      sourceSide,
      targetSide,
      sourceTangent: outwardSource,
      targetTangent: { x: -outwardTarget.x, y: -outwardTarget.y },
    }
  }

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: POSITION[sourceSide],
    targetX: end.x,
    targetY: end.y,
    targetPosition: POSITION[targetSide],
    borderRadius: 4,
    offset: EDGE_OFFSET,
  })
  return {
    path,
    labelX,
    labelY,
    sourceX: start.x,
    sourceY: start.y,
    targetX: end.x,
    targetY: end.y,
    sourceSide,
    targetSide,
    sourceTangent: outwardSource,
    targetTangent: { x: -outwardTarget.x, y: -outwardTarget.y },
  }
}
