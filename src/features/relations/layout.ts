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
import type { Edge, Node } from '@xyflow/react'
import type { RelationNodeType } from './types'

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

/** 节点碰撞半径：角色按 56 头像算；国家 / 事件按卡片宽度算 */
const COLLIDE_RADIUS: Record<RelationNodeType, number> = {
  character: 36,
  country: 52,
  event: 52,
  world: 52,
}

/**
 * 节点尺寸（docs/关系图.md §4）—— **唯一源**：画布、连线求交（floating-edge）、PNG 重绘共用。
 * 尺寸写死、不随文字长度变，否则不同字号下 `fitView` 出来的构图会变（§9 风险 2）。
 *
 * - 角色：56px 圆头像 + 12px 名字 → 56 × 84
 * - 国家 / 事件：96 × 64 卡片 + 名字 → 96 × 84
 */
export const NODE_SIZE: Record<RelationNodeType, { w: number; h: number }> = {
  character: { w: 56, h: 84 },
  country: { w: 96, h: 84 },
  event: { w: 96, h: 84 },
  // 分类条目：与事件 / 国家同宽的 3:2 封面卡
  world: { w: 96, h: 84 },
}

/** 角色头像直径（圆形锚点半径 = 一半） */
export const NODE_AVATAR_SIZE = 56

/** 国家旗帜 / 事件封面卡片的尺寸：卡片贴在节点顶部，名字在下方 */
export const NODE_CARD_SIZE = { w: 96, h: 64 }

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
 * 把「实体里没存过坐标」的节点补上力导向结果，返回**可以直接画**的节点数组。
 *
 * `buildGraphData()` 给没摆过的节点一律 `{ x: 0, y: 0 }`（坐标真源只在实体上，
 * 不缓存到 localStorage）—— 所以**每一个消费方都得先过这一层**：画布（`RelationGraph`）
 * 与导出重绘（`export-graph.ts`）共用同一份。漏掉这一步就是「没摆过的节点全叠在原点」：
 * 2026-11-06 导出预览里那坨挤在左上角、名字互相压住的卡片就是这么来的。
 *
 * `(0, 0)` 是「没坐标」的哨兵，不是用户摆出来的位置（画布也这么判）。
 */
export function resolveGraphPositions<T extends Node>(nodes: T[], edges: Edge[]): T[] {
  const pinned = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    if (node.position.x !== 0 || node.position.y !== 0) pinned.set(node.id, node.position)
  }
  // 全都有坐标（用户摆过 / 整理过）：原样返回，不要再跑一遍布局把构图挪走
  if (pinned.size === nodes.length) return nodes
  const layout = computeForceLayout(nodes, edges, { pinned })
  return nodes.map((node) => ({ ...node, position: layout.get(node.id) ?? node.position }))
}

/**
 * 算出每个节点的左上角坐标。返回 Map 包含**全部**传入节点：
 * 钉住的返回原坐标，其余是模拟结果（并平移到正区间，留 80px 边距）。
 */
export function computeForceLayout(
  nodes: Node[],
  edges: Edge[],
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
  // 平移只在「全是自由节点」时做：锚点最后要恢复原坐标，只搬自由节点会把它们从用户
  // 摆好的那一坨旁边甩出去（甩多远取决于锚点坐标，能差几百像素）—— 那正是「新节点
  // 一进来就跑到图外面」的另一个来源。有锚点时自由节点本来就该落在锚点附近。
  const offsetX = pinned.size === 0 && Number.isFinite(box.minX) ? 80 - box.minX : 0
  const offsetY = pinned.size === 0 && Number.isFinite(box.minY) ? 80 - box.minY : 0

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
