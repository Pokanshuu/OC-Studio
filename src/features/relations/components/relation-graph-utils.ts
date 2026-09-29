import type { Node } from '@xyflow/react'
import { CharacterNode } from './CharacterNode'
import { EventNode } from './EventNode'
import { CountryNode } from './CountryNode'
import { RelationEdge } from './RelationEdge'

export const NODE_POSITIONS_KEY = 'oc-relation-node-positions'

/** 节点拖拽位置持久化（localStorage） */
export function loadNodePositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(NODE_POSITIONS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveNodePositions(positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(NODE_POSITIONS_KEY, JSON.stringify(positions))
  } catch { /* quota exceeded, ignore */ }
}

/** 位置表 key：优先 `类型-实体ID`，退化为节点 id */
export function nodePositionKey(node: Node): string {
  return node.data?.entityType && node.data?.entityId
    ? `${node.data.entityType}-${node.data.entityId}`
    : String(node.id)
}

export const nodeTypes = {
  characterNode: CharacterNode,
  eventNode: EventNode,
  countryNode: CountryNode,
}

export const edgeTypes = {
  relationEdge: RelationEdge,
}

