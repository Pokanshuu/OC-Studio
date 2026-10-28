import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { GraphEdge, GraphNode, RelationNodeType } from './types'

/**
 * 关系图的力导向布局（纯函数，无 DOM）。
 *
 * 解决的问题：节点多了以后头像互相压住、连线从节点身上穿过去。这里用 d3-force 的
 * 「斥力 + 连线弹簧 + **碰撞半径** + 向心引力」把它们摊开，而不是画一个圆。
 *
 * 三条约束：
 * - **已有坐标的节点钉住不动**（`pinned`）。用户拖过的位置是权威，重排只影响没坐标的新节点。
 * - **不摊太大**：斥力会让节点一路飘散，图一大 fitView 就只能缩到看不清。
 *   所以模拟结束后按目标尺寸（`TARGET`）回缩一次，再跑几轮纯碰撞把压在一起的推开。
 * - **确定性**：初始位置按圆周均分、随机源用固定种子的 mulberry32 —— 同一份数据每次同一张图。
 */

/** 节点碰撞半径：角色 / 国家按 56 头像 + 名字算；事件是矩形，按宽度算 */
const COLLIDE_RADIUS: Record<RelationNodeType, number> = {
  character: 52,
  country: 52,
  event: 64,
}

/** 节点在 React Flow 里是「左上角定位」，d3 给的是圆心 —— 换算时减掉半个身位 */
export const NODE_SIZE: Record<RelationNodeType, { w: number; h: number }> = {
  character: { w: 72, h: 92 },
  country: { w: 72, h: 92 },
  event: { w: 128, h: 56 },
}

/** 圆与圆之间留的缝 */
const COLLIDE_PADDING = 12
/** 连线理想长度 */
const LINK_DISTANCE = 150
/** 连线弹簧强度 */
const LINK_STRENGTH = 0.6
/** 斥力：太大会把图吹散，靠向心引力拉回来 */
const CHARGE = -180
/** 向心引力：没有它，孤立节点会一直往外飘（这是之前「图被摊到看不见」的原因） */
const GRAVITY = 0.09
/** 同步跑多少步（不跑动画） */
const TICKS = 300
/** 回缩后的目标包围盒（再大就没法在默认视图里看清了） */
const TARGET = { w: 1500, h: 1000 }
/** 回缩后压在一起的节点，用纯碰撞再摊开的步数 */
const RELAX_TICKS = 60

interface LayoutNode extends SimulationNodeDatum {
  id: string
  radius: number
  width: number
  height: number
}

/** 固定种子的伪随机源（d3 的 jiggle 用它，保证两次布局一致） */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function bounds(nodes: LayoutNode[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, (node.x ?? 0) - node.width / 2)
    maxX = Math.max(maxX, (node.x ?? 0) + node.width / 2)
    minY = Math.min(minY, (node.y ?? 0) - node.height / 2)
    maxY = Math.max(maxY, (node.y ?? 0) + node.height / 2)
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export interface ForceLayoutOptions {
  /** 已经有坐标的节点（实体里存过）：这些节点只当锚点，位置原样返回 */
  pinned?: Map<string, { x: number; y: number }>
}

/**
 * 算出每个节点的左上角坐标。返回 Map 包含**全部**传入节点：
 * 钉住的返回原坐标，其余是模拟结果（并平移到正区间，留 80px 边距）。
 */
export function computeForceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: ForceLayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return result

  const pinned = options.pinned ?? new Map<string, { x: number; y: number }>()

  // 引力中心：有锚点就朝锚点聚（新节点落在用户已经摆好的那一坨附近），否则朝原点
  let centerX = 0
  let centerY = 0
  if (pinned.size > 0) {
    let sumX = 0
    let sumY = 0
    for (const position of pinned.values()) {
      sumX += position.x
      sumY += position.y
    }
    centerX = sumX / pinned.size
    centerY = sumY / pinned.size
  }

  const layoutNodes: LayoutNode[] = nodes.map((node, index) => {
    const type = (node.data?.entityType ?? 'character') as RelationNodeType
    const size = NODE_SIZE[type] ?? NODE_SIZE.character
    const anchor = pinned.get(node.id)
    const angle = (index / nodes.length) * 2 * Math.PI
    const ringRadius = Math.max(220, nodes.length * 16)
    const layoutNode: LayoutNode = {
      id: node.id,
      radius: COLLIDE_RADIUS[type] ?? COLLIDE_RADIUS.character,
      width: size.w,
      height: size.h,
      x: anchor ? anchor.x + size.w / 2 : centerX + Math.cos(angle) * ringRadius,
      y: anchor ? anchor.y + size.h / 2 : centerY + Math.sin(angle) * ringRadius,
    }
    if (anchor) {
      layoutNode.fx = layoutNode.x
      layoutNode.fy = layoutNode.y
    }
    return layoutNode
  })

  const byId = new Map(layoutNodes.map((node) => [node.id, node]))
  const links: SimulationLinkDatum<LayoutNode>[] = edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target }))

  const simulation = forceSimulation<LayoutNode>(layoutNodes)
    .randomSource(mulberry32(0x9e3779b9))
    .force(
      'link',
      forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links)
        .id((node) => node.id)
        .distance(LINK_DISTANCE)
        .strength(LINK_STRENGTH),
    )
    .force('charge', forceManyBody<LayoutNode>().strength(CHARGE))
    .force(
      'collide',
      forceCollide<LayoutNode>((node) => node.radius + COLLIDE_PADDING).iterations(2),
    )
    .force('x', forceX<LayoutNode>(centerX).strength(GRAVITY))
    .force('y', forceY<LayoutNode>(centerY).strength(GRAVITY))
    .stop()

  for (let i = 0; i < TICKS; i += 1) simulation.tick()

  // 只给「全是自由节点」的图回缩：有锚点时缩放会把用户摆好的位置一起挪走
  if (pinned.size === 0) {
    const box = bounds(layoutNodes)
    const scale = Math.min(1, TARGET.w / Math.max(box.width, 1), TARGET.h / Math.max(box.height, 1))
    if (scale < 0.999) {
      const cx = (box.minX + box.maxX) / 2
      const cy = (box.minY + box.maxY) / 2
      for (const node of layoutNodes) {
        node.x = cx + ((node.x ?? 0) - cx) * scale
        node.y = cy + ((node.y ?? 0) - cy) * scale
      }
      // 缩小之后可能又压上了：只跑碰撞（不要斥力，否则又会吹散）
      const relax = forceSimulation<LayoutNode>(layoutNodes)
        .randomSource(mulberry32(0x51ed270b))
        .force('collide', forceCollide<LayoutNode>((node) => node.radius + COLLIDE_PADDING).iterations(2))
        .stop()
      for (let i = 0; i < RELAX_TICKS; i += 1) relax.tick()
    }
  }

  const box = bounds(layoutNodes)
  const offsetX = Number.isFinite(box.minX) ? 80 - box.minX : 0
  const offsetY = Number.isFinite(box.minY) ? 80 - box.minY : 0

  for (const node of layoutNodes) {
    result.set(node.id, {
      x: Math.round((node.x ?? 0) - node.width / 2 + offsetX),
      y: Math.round((node.y ?? 0) - node.height / 2 + offsetY),
    })
  }

  // 钉住的节点不参与平移与回缩，原样返回
  for (const [id, position] of pinned) {
    if (result.has(id)) result.set(id, { x: position.x, y: position.y })
  }

  return result
}
