import type { Node, Edge } from '@xyflow/react'

export interface GraphNodeData extends Record<string, unknown> {
  id: string
  label: string
  entityType: 'character' | 'event' | 'country' | 'custom'
  entityId: number
  customKind?: 'section' | 'entry'
  customSectionId?: string
  subtitle?: string
  avatarUrl?: string
  /** 角色模板实体的细分类型。 */
  entityKind?: 'character' | 'weapon' | 'pet'
}

export interface GraphEdgeData extends Record<string, unknown> {
  relation: string
  relationId: string
  kind: string
  directed: boolean
  color?: string
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
  /** 同一对节点之间的第几条线，用于错开平行连线。 */
  parallelIndex?: number
  parallelCount?: number
}

export type GraphNode = Node<GraphNodeData>
export type GraphEdge = Edge<GraphEdgeData>
