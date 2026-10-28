import type { Edge, Node } from '@xyflow/react'
import { CharacterNode } from './CharacterNode'
import { EventNode } from './EventNode'
import { CountryNode } from './CountryNode'
import { RelationEdge } from './RelationEdge'
import { NODE_SIZE } from '../layout'
import type { RelationNodeType } from '../types'

// 节点坐标不放这里：真源是实体（`graphPosition` → 仓库的 `graph_position`），
// 没有坐标的节点由 layout.ts 的力导向布局现算。
// 曾经用 localStorage 当缓存，结果旧版径向布局的坐标把整张图钉死、力导向永远不跑，已删。

export const nodeTypes = {
  characterNode: CharacterNode,
  eventNode: EventNode,
  countryNode: CountryNode,
}

export const edgeTypes = {
  relationEdge: RelationEdge,
}

/* ── 拖拽连线 ────────────────────────────────────────────────
   连线的**唯一语义表**：源类型 × 目标类型 → 落哪个字段、能不能起名。
   写入侧照这张表走（见 services.createRelationBetween），不要另写一套判断。 */

export interface RelationPlan {
  /** 这一对节点能不能连线 */
  supported: boolean
  /** 固定关系名（成员关系，如「参与」）；缺省 = 由用户起名 */
  fixedLabel?: string
  /** 起名时的建议词（点一下填进输入框） */
  presets: readonly string[]
}

const UNSUPPORTED: RelationPlan = { supported: false, presets: [] }

const PAIR_PLANS: Record<string, RelationPlan> = {
  'character:character': { supported: true, presets: ['亲属', '朋友', '敌人', '师徒', '恋人', '同僚'] },
  'character:event': { supported: true, fixedLabel: '参与', presets: [] },
  // 角色↔国家两边都写（国籍 + 国家的相关角色），画出来的边固定是「属于」
  'character:country': { supported: true, fixedLabel: '属于', presets: [] },
  'country:character': { supported: true, fixedLabel: '属于', presets: [] },
  'event:character': { supported: true, fixedLabel: '参与', presets: [] },
  'event:event': { supported: true, presets: ['前因', '后果', '相关', '延续'] },
  // 事件↔国家同样两边都写（事件的国家 + 国家的相关事件）
  'event:country': { supported: true, fixedLabel: '发生于', presets: [] },
  'country:event': { supported: true, fixedLabel: '发生于', presets: [] },
}

/** 源 → 目标 这一对节点能建立什么关系（国家之间没有对应字段，不支持） */
export function relationPlan(sourceType: RelationNodeType, targetType: RelationNodeType): RelationPlan {
  return PAIR_PLANS[`${sourceType}:${targetType}`] ?? UNSUPPORTED
}

/** 一次待确认的连线：两端 + 该对的语义 */
export interface RelationDraft {
  source: { entityType: RelationNodeType; entityId: number; label: string }
  target: { entityType: RelationNodeType; entityId: number; label: string }
  plan: RelationPlan
}

/**
 * 缩放下限：再小人脸和名字就看不清了。滑杆、fitView、画布三处共用这一个值。
 * 图很大时宁可少看一部分（自己平移），也不要把整张图缩成一片糊。
 */
export const MIN_ZOOM = 0.6

/* ── 连线落点 ────────────────────────────────────────────────
   节点四向都有手柄（见 *Node.tsx）。每条边按「目标在哪个方位」挑两端的手柄，
   否则所有线都从正下方挤出来，贴着节点糊成一束。 */

export type HandleSide = 'top' | 'right' | 'bottom' | 'left'

function nodeCenter(node: Node): { x: number; y: number } {
  const type = (node.data?.entityType ?? 'character') as RelationNodeType
  const size = NODE_SIZE[type] ?? NODE_SIZE.character
  const width = node.measured?.width ?? size.w
  const height = node.measured?.height ?? size.h
  return { x: node.position.x + width / 2, y: node.position.y + height / 2 }
}

/** 按两端节点的相对方位，给每条边挑一组手柄（横向为主走左右，纵向为主走上下） */
export function routeEdges(nodes: Node[], edges: Edge[]): Edge[] {
  if (nodes.length === 0) return edges
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return edges.map((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return edge
    const a = nodeCenter(source)
    const b = nodeCenter(target)
    const dx = b.x - a.x
    const dy = b.y - a.y
    let sourceHandle: HandleSide
    let targetHandle: HandleSide
    if (Math.abs(dx) >= Math.abs(dy)) {
      sourceHandle = dx >= 0 ? 'right' : 'left'
      targetHandle = dx >= 0 ? 'left' : 'right'
    } else {
      sourceHandle = dy >= 0 ? 'bottom' : 'top'
      targetHandle = dy >= 0 ? 'top' : 'bottom'
    }
    return { ...edge, sourceHandle, targetHandle }
  })
}
