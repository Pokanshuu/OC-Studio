import type { Node, Edge } from '@xyflow/react'

export interface GraphNodeData extends Record<string, unknown> {
  id: string
  label: string
  entityType: 'character' | 'event' | 'country'
  entityId: number
  subtitle?: string
  avatarUrl?: string
}

export type GraphNode = Node<GraphNodeData>
export type GraphEdge = Edge<{
  relation: string
  /**
   * 成员关系只有一侧有记录（角色有国籍但国家没列他 / 反之）。
   * 这种边允许重新拖一次把它补全，见 RelationGraph 的 isValidConnection。
   */
  incomplete?: boolean
}>

/** 关系图里能被连线的实体类型 */
export type RelationNodeType = GraphNodeData['entityType']

/** 连线的一端：只有「哪类实体的哪一条」——写入时按这对类型决定落哪个字段 */
export interface RelationEndpoint {
  entityType: RelationNodeType
  entityId: number
}
