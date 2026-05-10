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
export type GraphEdge = Edge<{ relation: string }>
