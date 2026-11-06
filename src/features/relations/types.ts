import type { Node, Edge } from '@xyflow/react'
import type { RelationArrow } from '@/lib/relation-colors'

export interface GraphNodeData extends Record<string, unknown> {
  id: string
  label: string
  entityType: 'character' | 'event' | 'country' | 'world'
  entityId: number
  subtitle?: string
  avatarUrl?: string
  /** 国家旗帜（服务端筛出来的 `country.flagUrl`，导出与画布共用） */
  flagUrl?: string
  /** 事件封面（`event.headerUrl`），没有就走首字占位 */
  imageUrl?: string
}

/**
 * 一条边的语义类别 —— **只影响画法**，不改数据、不改字段。
 *
 * - `relation`：用户起名的关系（角色↔角色 / 事件↔事件），实线、稍粗、可改名可配色
 * - `member`：归属 / 参与 / 发生于，由实体字段推出来，细实线、不可改名（改了会与字段打架）
 * - `reference`：分类条目 @ 引用出来的线，**虚线** —— 它是机器推的，不是人手画的
 *
 * 判据只有这一处：不按线色分（线色是边的数据，用户可改），也不按箭头分。
 */
export type GraphEdgeKind = 'relation' | 'member' | 'reference'

export interface GraphEdgeData extends Record<string, unknown> {
  relation: string
  kind?: GraphEdgeKind
  /**
   * 成员关系只有一侧有记录（角色有国籍但国家没列他 / 反之）。
   * 这种边允许重新拖一次把它补全，见 RelationGraph 的 isValidConnection。
   */
  incomplete?: boolean
  color?: string
  arrow?: RelationArrow
  /** 同一对节点的第几条关系（并行边错开用，见 floating-edge） */
  parallelIndex?: number
}

export type GraphNode = Node<GraphNodeData>
export type GraphEdge = Edge<GraphEdgeData>

/** 关系图里能被连线的实体类型 */
export type RelationNodeType = GraphNodeData['entityType']

/** 能在关系图上建的边：分类条目那类不参与手连 */
export type RelationEdgeType = Exclude<RelationNodeType, 'world'>

/** 连线的一端：只有「哪类实体的哪一条」——写入时按这对类型决定落哪个字段 */
export interface RelationEndpoint {
  entityType: RelationNodeType
  entityId: number
}
