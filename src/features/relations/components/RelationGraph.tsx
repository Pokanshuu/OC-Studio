'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, RefreshCw, X, Download, LayoutGrid, Save } from 'lucide-react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type OnMove,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useGraphData } from '../hooks/useGraphData'
import { useNavigation } from '@/components/layout/NavigationContext'
import { createRelation, deleteRelation, updateRelationLabel, updateRelationStyle } from '../services'
import { useRelationUiStore } from '../store'
import {
  RELATION_COLORS,
  RELATION_ARROW_OPTIONS,
  resolveRelationColor,
  resolveRelationArrow,
} from '../style'
import { exportRelationGraphPng } from '../exportGraph'
import { useSettings } from '@/lib/settings'
import { CharacterNode } from './CharacterNode'
import { EventNode } from './EventNode'
import { CountryNode } from './CountryNode'
import { RelationEdge } from './RelationEdge'
import { CustomEdge } from './CustomEdge'
import { CustomGraphNode } from './CustomGraphNode'
import { useCustomSections } from '@/features/custom-sections'
import { AppConfirm } from '@/components/shared/AppConfirm'
import { toast } from 'sonner'
import { saveBlobToDisk } from '@/lib/image-service'
import {
  createCharacter,
  deleteCharacter,
  updateCharacter,
} from '@/features/characters/services'
import { createCountry, deleteCountry, updateCountry } from '@/features/countries/services'
import { createEvent, deleteEvent, updateEvent } from '@/features/events/services'
import { MobileRelationControls, DesktopRelationPanel } from './MobileRelationControls'

const NODE_POSITIONS_KEY = 'oc-relation-node-positions'
const SCOPED_EDGES_KEY = 'oc-relation-scoped-edges'

interface LocalScopedEdge {
  id: string
  source: string
  target: string
  label: string
}

function loadScopedEdges(scope: string): LocalScopedEdge[] {
  try {
    const raw = localStorage.getItem(`${SCOPED_EDGES_KEY}:${scope}`)
    return raw ? (JSON.parse(raw) as LocalScopedEdge[]) : []
  } catch {
    return []
  }
}

function saveScopedEdges(scope: string, edges: LocalScopedEdge[]): void {
  localStorage.setItem(`${SCOPED_EDGES_KEY}:${scope}`, JSON.stringify(edges))
}

function loadNodePositions(scope: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(`${NODE_POSITIONS_KEY}:${scope}`)
    if (raw) return JSON.parse(raw)
    if (scope === 'main') {
      const legacy = localStorage.getItem(NODE_POSITIONS_KEY)
      return legacy ? JSON.parse(legacy) : {}
    }
    return {}
  } catch { return {} }
}

function saveNodePositions(
  scope: string,
  positions: Record<string, { x: number; y: number }>,
) {
  try {
    localStorage.setItem(`${NODE_POSITIONS_KEY}:${scope}`, JSON.stringify(positions))
  } catch { /* quota exceeded, ignore */ }
}

const LAYOUT_CELL_WIDTH = 200
const LAYOUT_CELL_HEIGHT = 170

/** 保存位置用的稳定 key；内置实体按类型+id，自定义节点按节点 id。 */
function positionKeyOf(node: Node): string {
  const entityType = node.data?.entityType as string | undefined
  const entityId = node.data?.entityId as number | undefined
  return entityType && entityId ? `${entityType}-${entityId}` : String(node.id)
}

/**
 * 非圆形的整齐网格布局。旧实现用极坐标排成圆圈，节点一多就会互相压住；
 * 这里用固定网格，并且只给“没有保存位置”的节点分配空格。
 */
function gridPosition(index: number, total: number): { x: number; y: number } {
  const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, total))))
  const column = index % columns
  const row = Math.floor(index / columns)
  return {
    x: (column - (columns - 1) / 2) * LAYOUT_CELL_WIDTH,
    y: (row - (Math.ceil(total / columns) - 1) / 2) * LAYOUT_CELL_HEIGHT,
  }
}

interface NodeBox {
  x: number
  y: number
  width: number
  height: number
}

function estimateNodeBox(
  node: Node,
  position: { x: number; y: number },
): NodeBox {
  const entityType = String(node.data?.entityType ?? '')
  const customKind = String(node.data?.customKind ?? '')
  if (entityType === 'character' || entityType === 'country') {
    return { x: position.x, y: position.y, width: 96, height: 92 }
  }
  if (entityType === 'event') {
    return { x: position.x, y: position.y, width: 120, height: 92 }
  }
  if (entityType === 'custom' && customKind === 'entry') {
    return { x: position.x, y: position.y, width: 168, height: 64 }
  }
  return { x: position.x, y: position.y, width: 168, height: 70 }
}

function boxesOverlap(a: NodeBox, b: NodeBox, gap = 14): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  )
}

interface RelationGraphProps {
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  visible?: boolean
}

const nodeTypes = {
  characterNode: CharacterNode,
  eventNode: EventNode,
  countryNode: CountryNode,
  customNode: CustomGraphNode,
}

const edgeTypes = {
  relationEdge: RelationEdge,
  customEdge: CustomEdge,
}

function FitViewOnLoad({ ready }: { ready: boolean }) {
  const { fitView } = useReactFlow()
  const called = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (ready && !called.current) {
      timerRef.current = setTimeout(() => fitView({ padding: 0.3 }), 100)
      called.current = true
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [ready, fitView])

  return null
}

function ZoomReader({ onInstance }: { onInstance: (rf: ReactFlowInstance) => void }) {
  const rf = useReactFlow()
  useEffect(() => { onInstance(rf) }, [rf, onInstance])
  return null
}

export function RelationGraph({
  onNavigateToCharacter,
  onNavigateToEvent,
  onNavigateToCountry,
  visible,
}: RelationGraphProps) {
  const { nodes: rawNodes, edges: rawEdges, loading, error, refresh } = useGraphData()
  const { setActiveItem } = useNavigation()
  const { settings } = useSettings()
  const mouseMode = settings.mouseMode ?? 'left-pan'
  const {
    sections: customSections,
    createSection,
    addEntry,
    deleteSection,
    deleteEntry,
    linkEntity,
    unlinkEntity,
    updateEntry,
    unlinkEntryRelation,
    setEntryRelationLabel,
    linkEntryRelation,
    linkSectionEntity,
    linkSections,
    removeScopedEdge,
    setEdgeLabel,
  } = useCustomSections()
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null)
  const [focusedCategory, setFocusedCategory] = useState<'character' | 'event' | 'country' | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [exporting, setExporting] = useState(false)
  const layoutCacheRef = useRef<{
    scope: string
    positions: Record<string, { x: number; y: number }>
  }>({ scope: '', positions: {} })
  const [hiddenSectionIds, setHiddenSectionIds] = useState<Set<string>>(new Set())
  const visibilitySnapshotRef = useRef<{
    positions: Record<string, { x: number; y: number }>
    viewport: { x: number; y: number; zoom: number } | null
  }>({ positions: {}, viewport: null })
  const restoreSnapshotRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [dragGhost, setDragGhost] = useState<{ label: string; x: number; y: number } | null>(null)
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(null)
  const [deletingNode, setDeletingNode] = useState(false)
  const [pendingDeleteEdgeId, setPendingDeleteEdgeId] = useState<string | null>(null)
  const [deletingEdge, setDeletingEdge] = useState(false)
  const [pendingImageNodeId, setPendingImageNodeId] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<string>('character')
  const [createName, setCreateName] = useState('')
  const [edgeEditor, setEdgeEditor] = useState<{
    id: string
    label: string
    save: (label: string) => void
  } | null>(null)
  const [edgeEditorValue, setEdgeEditorValue] = useState('')
  const edgeEditorInputRef = useRef<HTMLInputElement | null>(null)
  const prevVisible = useRef(false)
  const positionScopeRef = useRef('main')

  const openEdgeEditor = useCallback(
    (id: string, label: string, save: (label: string) => void) => {
      setEdgeEditorValue(label)
      setEdgeEditor({ id, label, save })
    },
    [],
  )

  const customGraph = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    const available = new Set(rawNodes.map((node) => node.id))
    for (const section of customSections) {
      for (const entry of section.entries) {
        available.add(`custom-entry:${entry.id}`)
      }
    }
    const categories: Array<[string, string, 'character' | 'event' | 'country']> = [
      ['category-character', '角色', 'character'],
      ['category-event', '事件', 'event'],
      ['category-country', '国家', 'country'],
    ]
    for (const [id, label, type] of categories) {
      nodes.push({
        id,
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          id,
          label,
          entityType: 'custom',
          entityId: 0,
          customKind: 'section',
          categoryKind: type,
          onOpen: () => setFocusedCategory(type),
          subtitle: '右键查看内部关系',
        },
      })
    }
    for (const section of customSections) {
      const sectionNodeId = `custom-section:${section.id}`
      nodes.push({
        id: sectionNodeId,
        type: 'customNode',
        position: { x: 0, y: 0 },
        data: {
          id: sectionNodeId,
          label: section.name,
          entityType: 'custom',
          entityId: 0,
          customKind: 'section',
          customSectionId: section.id,
          accentColor: section.accentColor,
          onOpen: section.entries.length > 0 ? () => setFocusedSectionId(section.id) : undefined,
          subtitle: section.description || `${section.entries.length} 个${section.name}`,
        },
      })
      for (const scoped of section.scopedEdges) {
        edges.push({
          id: `custom-scoped:${section.id}:${scoped.id}`,
          source: scoped.source,
          target: scoped.target,
          type: 'customEdge',
          label: scoped.label,
          style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
        })
      }
      for (const relatedId of section.relatedSectionIds) {
        const targetId = `custom-section:${relatedId}`
        if (targetId === sectionNodeId) continue
        edges.push({
          id: `custom-section-link:${section.id}:section:${relatedId}`,
          source: sectionNodeId,
          target: targetId,
          type: 'default',
          label: '相关分类',
          style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
          labelStyle: { fontSize: 10, fill: 'var(--color-ink-faint)' },
        })
      }
      for (const id of section.characterIds) {
        const targetId = `character-${id}`
        if (available.has(targetId)) {
          edges.push({
            id: `custom-section-link:${section.id}:character:${id}`,
            source: sectionNodeId,
            target: targetId,
            type: 'default',
            label: '相关',
            style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
            labelStyle: { fontSize: 10, fill: 'var(--color-ink-faint)' },
          })
        }
      }
      for (const id of section.countryIds) {
        const targetId = `country-${id}`
        if (available.has(targetId)) {
          edges.push({
            id: `custom-section-link:${section.id}:country:${id}`,
            source: sectionNodeId,
            target: targetId,
            type: 'default',
            label: '相关',
            style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
            labelStyle: { fontSize: 10, fill: 'var(--color-ink-faint)' },
          })
        }
      }
      for (const id of section.eventIds) {
        const targetId = `event-${id}`
        if (available.has(targetId)) {
          edges.push({
            id: `custom-section-link:${section.id}:event:${id}`,
            source: sectionNodeId,
            target: targetId,
            type: 'default',
            label: '相关',
            style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
            labelStyle: { fontSize: 10, fill: 'var(--color-ink-faint)' },
          })
        }
      }
      for (const entry of section.entries) {
        const entryNodeId = `custom-entry:${entry.id}`
        nodes.push({
          id: entryNodeId,
          type: 'customNode',
          position: { x: 0, y: 0 },
          data: {
            id: entryNodeId,
            label: entry.name,
            entityType: 'custom',
            entityId: 0,
            customKind: 'entry',
            customSectionId: section.id,
            avatarUrl: entry.avatarUrl,
            onOpen: () => setFocusedSectionId(section.id),
            subtitle: section.name,
          },
        })
        edges.push({
          id: `custom-contains:${section.id}:${entry.id}`,
          source: sectionNodeId,
          target: entryNodeId,
          type: 'customEdge',
          data: { label: '', hideLabel: true, readOnly: true },
          selectable: false,
        })
        for (const targetEntryId of entry.relatedEntryIds ?? []) {
          const targetNodeId = `custom-entry:${targetEntryId}`
          if (!available.has(targetNodeId)) continue
          edges.push({
            id: `custom-entry-link:${entry.id}:${targetEntryId}`,
            source: entryNodeId,
            target: targetNodeId,
            type: 'customEdge',
            data: {
              label: entry.entryLinks?.[targetEntryId]?.relation ?? '相关',
              onLabelChange: (_id: string, label: string) =>
                setEntryRelationLabel(entry.id, targetEntryId, label),
              onDelete: () => unlinkEntryRelation(section.id, entry.id, targetEntryId),
            },
          })
        }
        const linkTargets: Array<[string, Record<string, { relation?: string; role?: string; position?: string }> | undefined]> = [
          ['character', entry.characterLinks],
          ['country', entry.countryLinks],
        ]
        for (const [type, links] of linkTargets) {
          const ids = type === 'character' ? entry.characterIds : entry.countryIds
          for (const id of ids) {
            const targetId = `${type}-${id}`
            if (!available.has(targetId)) continue
            const meta = links?.[String(id)]
            edges.push({
              id: `custom-link:${entry.id}:${type}:${id}`,
              source: entryNodeId,
              target: targetId,
              type: 'default',
              label: meta?.relation || meta?.role || '相关',
              style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
              labelStyle: { fontSize: 10, fill: 'var(--color-ink-faint)' },
            })
          }
        }
        for (const id of entry.eventIds) {
          const targetId = `event-${id}`
          if (!available.has(targetId)) continue
          edges.push({
            id: `custom-link:${entry.id}:event:${id}`,
            source: entryNodeId,
            target: targetId,
            type: 'default',
            label:
              entry.eventLinks?.[String(id)]?.relation ||
              entry.eventLinks?.[String(id)]?.position ||
              '相关',
            style: { stroke: 'var(--color-line-hover)', strokeWidth: 1 },
            labelStyle: { fontSize: 10, fill: 'var(--color-ink-faint)' },
          })
        }
      }
    }
    const sectionByEntry = new Map<string, string>()
    for (const section of customSections) {
      for (const entry of section.entries) sectionByEntry.set(entry.id, section.id)
    }
    for (const edge of edges) {
      let sectionId: string | undefined
      if (edge.id.startsWith('custom-section-link:')) {
        sectionId = edge.id.split(':')[1]
      } else if (edge.id.startsWith('custom-contains:')) {
        sectionId = edge.id.split(':')[1]
      } else if (edge.id.startsWith('custom-scoped:')) {
        sectionId = edge.id.split(':')[1]
      } else if (edge.id.startsWith('custom-link:')) {
        sectionId = sectionByEntry.get(edge.id.split(':')[1])
      }
      if (!sectionId) continue
      const section = customSections.find((item) => item.id === sectionId)
      const existingData = (edge.data ?? {}) as Record<string, unknown>
      edge.type = 'customEdge'
      edge.data = {
        ...existingData,
        label: existingData.label ?? section?.edgeLabels?.[edge.id] ?? String(edge.label ?? '相关'),
        onLabelChange:
          existingData.onLabelChange ??
          ((id: string, label: string) => setEdgeLabel(sectionId!, id, label)),
        onEditLabel:
          existingData.onEditLabel ??
          (existingData.onLabelChange
            ? undefined
            : (id: string, label: string) =>
                openEdgeEditor(id, label, (next) => setEdgeLabel(sectionId!, id, next))),
      }
    }
    return { nodes, edges }
  }, [
    customSections,
    openEdgeEditor,
    rawNodes,
    setEdgeLabel,
    setFocusedCategory,
    setFocusedSectionId,
    setEntryRelationLabel,
    unlinkEntryRelation,
    updateEntry,
  ])

  const graphScope = focusedSectionId
    ? `section:${focusedSectionId}`
    : focusedCategory
      ? `category:${focusedCategory}`
      : focusedNodeId
        ? `node:${focusedNodeId}`
        : 'main'

  // Older builds could create graph-only edges in localStorage. Promote them
  // once to real relations so they can never diverge from entity panels again.
  useEffect(() => {
    let cancelled = false
    const migrate = async (): Promise<void> => {
      const prefix = `${SCOPED_EDGES_KEY}:`
      const keys = Object.keys(window.localStorage).filter((key) => key.startsWith(prefix))
      let changed = false
      for (const key of keys) {
        const edges = loadScopedEdges(key.slice(prefix.length))
        for (const edge of edges) {
          const parse = (nodeId: string): { type: 'character' | 'country' | 'event'; id: number } | null => {
            const [type, ...rest] = nodeId.split('-')
            const id = Number(rest.join('-'))
            if (!Number.isFinite(id)) return null
            if (type !== 'character' && type !== 'country' && type !== 'event') return null
            return { type, id }
          }
          const source = parse(edge.source)
          const target = parse(edge.target)
          if (!source || !target) continue
          await createRelation({
            sourceType: source.type,
            sourceId: source.id,
            targetType: target.type,
            targetId: target.id,
            label: edge.label || '相关',
          })
          changed = true
        }
        window.localStorage.removeItem(key)
      }
      if (changed && !cancelled) {
        refresh()
        window.dispatchEvent(new Event('data-updated'))
      }
    }
    void migrate()
    return () => {
      cancelled = true
    }
  }, [createRelation, refresh])

  const allNodes = useMemo(() => [...rawNodes, ...customGraph.nodes], [rawNodes, customGraph.nodes])
  const allEdges = useMemo(() => {
    const baseEdges = graphScope === 'main'
      ? rawEdges.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            onEditLabel: (id: string, label: string) =>
              openEdgeEditor(id, label, (next) => void updateRelationLabel(id, next)),
            onDelete: (id: string) => setPendingDeleteEdgeId(id),
            onStyle: (id: string) => setSelectedEdgeId(id),
          },
        }))
      : rawEdges.map((edge) => ({
          ...edge,
          type: 'customEdge',
          data: {
            ...edge.data,
            label: String(edge.data?.relation ?? '相关'),
            relationId: String(edge.id),
            color: edge.data?.color,
            arrow: edge.data?.arrow,
            onLabelChange: (_id: string, label: string) =>
              void updateRelationLabel(String(edge.id), label),
            onDelete: (id: string) => setPendingDeleteEdgeId(id),
            onStyle: (id: string) => setSelectedEdgeId(id),
          },
        }))
    const isHubId = (id: string): boolean =>
      id.startsWith('category-') || id.startsWith('custom-section:')
    const customEdges = customGraph.edges.map((edge) => {
      const id = String(edge.id)
      if (id.startsWith('custom-link:')) {
        const [, entryId, type, entityId] = id.split(':')
        const section = customSections.find((item) =>
          item.entries.some((entry) => entry.id === entryId),
        )
        if (!section) return edge
        const field =
          type === 'character' ? 'characterIds' : type === 'country' ? 'countryIds' : 'eventIds'
        const metaField =
          type === 'character'
            ? 'characterLinks'
            : type === 'country'
              ? 'countryLinks'
              : 'eventLinks'
        const entry = section.entries.find((item) => item.id === entryId)
        return {
          ...edge,
          type: 'customEdge',
          data: {
            label: String(edge.label ?? '相关'),
            onLabelChange: (_id: string, label: string) => {
              const current = entry?.[metaField]?.[String(entityId)] ?? {}
              updateEntry(section.id, entryId, {
                [metaField]: {
                  ...(entry?.[metaField] ?? {}),
                  [String(entityId)]: { ...current, relation: label },
                },
              })
            },
            onDelete: () => unlinkEntity(section.id, entryId, field, Number(entityId)),
          },
        }
      }
      if (id.startsWith('custom-scoped:')) {
        const sectionId = id.split(':')[1]
        const scopedId = id.split(':').slice(2).join(':')
        return {
          ...edge,
          data: {
            ...(edge.data as Record<string, unknown> | undefined),
            label: String(edge.label ?? '相关'),
            onLabelChange: (_id: string, label: string) =>
              setEdgeLabel(sectionId, scopedId, label),
            onDelete: () => removeScopedEdge(sectionId, scopedId),
          },
        }
      }
      return edge
    })
    const uniqueEdges: Edge[] = []
    const seenIds = new Set<string>()
    for (const edge of [...baseEdges, ...customEdges]) {
      if (isHubId(String(edge.source)) || isHubId(String(edge.target))) continue
      const id = String(edge.id)
      if (seenIds.has(id)) continue
      seenIds.add(id)
      uniqueEdges.push(edge)
    }
    // 同一对节点可以有多条关系：给每条线一个序号，绘制时错开。
    const groups = new Map<string, string[]>()
    for (const edge of uniqueEdges) {
      const key = [String(edge.source), String(edge.target)].sort().join('::')
      const group = groups.get(key) ?? []
      group.push(String(edge.id))
      groups.set(key, group)
    }
    return uniqueEdges.map((edge) => {
      const key = [String(edge.source), String(edge.target)].sort().join('::')
      const group = groups.get(key) ?? [String(edge.id)]
      const index = group.indexOf(String(edge.id))
      if (group.length <= 1) return edge
      return {
        ...edge,
        data: {
          ...(edge.data ?? {}),
          parallelIndex: Math.max(0, index),
          parallelCount: group.length,
        },
      }
    })
  }, [
    customGraph.edges,
    customSections,
    graphScope,
    openEdgeEditor,
    rawEdges,
    removeScopedEdge,
    setEdgeLabel,
    unlinkEntity,
    updateEntry,
    updateRelationLabel,
  ])
  const focusedSection = customSections.find((section) => section.id === focusedSectionId) ?? null
  const focusedNode = focusedNodeId ? allNodes.find((node) => node.id === focusedNodeId) : null
  const focusedCategoryLabel =
    focusedCategory === 'character'
      ? '角色'
      : focusedCategory === 'event'
        ? '事件'
        : focusedCategory === 'country'
          ? '国家'
          : null
  const focusLabel =
    focusedSection?.name ??
    focusedCategoryLabel ??
    (focusedNode ? String(focusedNode.data.label ?? '') : null)
  const hasFocus = Boolean(focusLabel)

  const focusedNodeIds = useMemo(() => {
    if (!focusedSectionId && !focusedCategory && !focusedNodeId) return null
    const ids = new Set<string>()
    if (focusedSectionId) {
      for (const node of allNodes) {
        if (
          node.data?.customSectionId === focusedSectionId &&
          node.data?.customKind === 'entry'
        ) {
          ids.add(node.id)
        }
      }
    } else if (focusedCategory) {
      // Category view shows only entities of that category, never the category
      // hub and never unrelated characters/events.
      for (const node of allNodes) {
        if (node.data?.entityType === focusedCategory) ids.add(node.id)
      }
    } else if (focusedNodeId) {
      ids.add(focusedNodeId)
      // Only one hop: the selected entity plus entities directly connected to it.
      for (const edge of allEdges) {
        if (edge.source === focusedNodeId) ids.add(edge.target)
        if (edge.target === focusedNodeId) ids.add(edge.source)
      }
    }
    return ids
  }, [allEdges, allNodes, focusedCategory, focusedNodeId, focusedSectionId])

  const {
    showCharacters,
    showEvents,
    showCountries,
    edgeStyle,
    setShowCharacters,
    setShowEvents,
    setShowCountries,
    setEdgeStyle,
  } = useRelationUiStore()
  const [zoom, setZoom] = useState(1)
  const [relationDialogOpen, setRelationDialogOpen] = useState(false)
  const [newSource, setNewSource] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newLabel, setNewLabel] = useState('相关')
  const rfRef = useRef<ReactFlowInstance | null>(null)

  const handleZoomChange = useCallback((value: number) => {
    rfRef.current?.zoomTo(value / 100, { duration: 0 })
  }, [])

  const handleInstance = useCallback((rf: ReactFlowInstance) => {
    rfRef.current = rf
  }, [])

  const handleMove = useCallback<OnMove>((_event, viewport) => {
    setZoom(viewport.zoom)
  }, [])

  useEffect(() => {
    const isVisible = visible ?? false
    if (isVisible && !prevVisible.current) {
      refresh()
    }
    prevVisible.current = isVisible
  }, [visible, refresh])

  const builtInNodes = useMemo(
    () => allNodes.filter((node) => node.data?.entityType !== 'custom'),
    [allNodes],
  )

  const filteredNodes = useMemo(() => {
    return allNodes.filter((node) => {
      if (focusedNodeIds && !focusedNodeIds.has(node.id)) return false
      switch (node.data?.entityType) {
        case 'character':
          return showCharacters
        case 'event':
          return showEvents
        case 'country':
          return showCountries
        default:
          return true
      }
    })
  }, [allNodes, focusedNodeIds, showCharacters, showEvents, showCountries])

  const visibleNodeIds = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes])
  const visibleEdges = useMemo(() => {
    const hiddenNodeIds = new Set(
      allNodes
        .filter(
          (node) =>
            node.data?.customSectionId &&
            hiddenSectionIds.has(node.data.customSectionId as string),
        )
        .map((node) => node.id),
    )
    return allEdges
      .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map((edge) => ({
        ...edge,
        hidden: hiddenNodeIds.has(String(edge.source)) || hiddenNodeIds.has(String(edge.target)),
      }))
  }, [allEdges, allNodes, hiddenSectionIds, visibleNodeIds])

  const layoutedNodes = useMemo(() => {
    const savedPositions = loadNodePositions(graphScope)
    if (layoutCacheRef.current.scope !== graphScope) {
      layoutCacheRef.current = { scope: graphScope, positions: {} }
    }
    const cache = layoutCacheRef.current.positions
    const placed: NodeBox[] = []
    const total = Math.max(filteredNodes.length, 4)
    const positioned = filteredNodes.map((node, index) => {
      const sectionId = node.data?.customSectionId as string | undefined
      const hidden = Boolean(sectionId && hiddenSectionIds.has(sectionId))
      const snapshot = visibilitySnapshotRef.current.positions[node.id]
      if (restoreSnapshotRef.current && snapshot) {
        placed.push(estimateNodeBox(node, snapshot))
        return { ...node, hidden, position: snapshot }
      }

      const key = positionKeyOf(node)
      let position = savedPositions[key] ?? cache[key]
      if (!position) {
        position = gridPosition(index, total)
      }
      // 防止头像/卡片叠在一起：与已放置节点重叠时，顺延到下一个空格。
      let slot = index
      let attempts = 0
      while (
        placed.some((box) => boxesOverlap(box, estimateNodeBox(node, position!))) &&
        attempts < 600
      ) {
        slot += 1
        position = gridPosition(slot, total + slot)
        attempts += 1
      }
      cache[key] = position
      placed.push(estimateNodeBox(node, position))
      return { ...node, hidden, position }
    })
    return positioned.map((node) => ({
      ...node,
      className: [
        node.className,
        highlightedNodeId === node.id ? 'relation-node-highlight' : '',
      ]
        .filter(Boolean)
        .join(' '),
    }))
  }, [filteredNodes, graphScope, hiddenSectionIds, highlightedNodeId, layoutVersion])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const persistLayout = useCallback(
    (announce = false, override?: Node) => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) {
        const position = node.id === override?.id ? override.position : node.position
        positions[positionKeyOf(node)] = { x: position.x, y: position.y }
      }
      if (override && !nodes.some((node) => node.id === override.id)) {
        positions[positionKeyOf(override)] = {
          x: override.position.x,
          y: override.position.y,
        }
      }
      if (Object.keys(positions).length === 0) return
      saveNodePositions(graphScope, positions)
      layoutCacheRef.current = {
        scope: graphScope,
        positions: { ...layoutCacheRef.current.positions, ...positions },
      }
      if (announce) toast.success('布局已保存')
    },
    [graphScope, nodes],
  )

  const autoArrange = useCallback(() => {
    layoutCacheRef.current = { scope: graphScope, positions: {} }
    saveNodePositions(graphScope, {})
    setLayoutVersion((value) => value + 1)
    window.setTimeout(() => rfRef.current?.fitView({ padding: 0.25, duration: 280 }), 60)
    toast.success('已自动整理，节点不会互相重叠')
  }, [graphScope])

  const handleExportImage = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const name = await exportRelationGraphPng(nodes, edges, {
        title: focusLabel ? `${focusLabel}` : 'OC 关系图',
      })
      toast.success(`已导出 ${name}`)
    } catch (cause) {
      console.error('[RelationGraph] export failed', cause)
      toast.error(cause instanceof Error ? cause.message : '导出关系图失败')
    } finally {
      setExporting(false)
    }
  }, [edges, exporting, focusLabel, nodes])

  const selectedEdge = selectedEdgeId
    ? edges.find((edge) => edge.id === selectedEdgeId) ?? null
    : null
  const selectedEdgeColor = resolveRelationColor(selectedEdge?.data?.color)
  const selectedEdgeArrow = resolveRelationArrow(selectedEdge?.data?.arrow)

  const applyEdgeStyle = useCallback(
    (patch: { color?: string; arrow?: 'none' | 'forward' | 'reverse' | 'both' }) => {
      if (!selectedEdgeId) return
      // 先即时更新画布，再持久化到 relations 表，避免等待 liveQuery 刷新。
      setEdges((current) =>
        current.map((edge) =>
          String(edge.id) === selectedEdgeId
            ? { ...edge, data: { ...(edge.data ?? {}), ...patch } }
            : edge,
        ),
      )
      void updateRelationStyle(selectedEdgeId, patch)
    },
    [selectedEdgeId, setEdges],
  )

  const toggleSectionVisibility = useCallback(
    (sectionId: string) => {
      // Persist the current layout before hiding so the same cards reappear in
      // exactly the same place instead of being re-laid-out.
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) {
        const key =
          node.data?.entityType === 'custom'
            ? node.id
            : node.data?.entityType && node.data?.entityId
              ? `${node.data.entityType}-${node.data.entityId}`
              : node.id
        positions[key] = { x: node.position.x, y: node.position.y }
      }
      saveNodePositions(graphScope, positions)
      if (!hiddenSectionIds.has(sectionId)) {
        const snapshot: Record<string, { x: number; y: number }> = {}
        for (const node of nodes) {
          snapshot[node.id] = { x: node.position.x, y: node.position.y }
        }
        visibilitySnapshotRef.current = {
          positions: snapshot,
          viewport: rfRef.current?.getViewport() ?? null,
        }
      } else {
        restoreSnapshotRef.current = true
      }
      setHiddenSectionIds((current) => {
        const next = new Set(current)
        if (next.has(sectionId)) next.delete(sectionId)
        else next.add(sectionId)
        return next
      })
    },
    [graphScope, hiddenSectionIds, nodes],
  )

  useEffect(() => {
    setNodes(layoutedNodes)
    if (restoreSnapshotRef.current) {
      restoreSnapshotRef.current = false
      const viewport = visibilitySnapshotRef.current.viewport
      if (viewport) {
        requestAnimationFrame(() => {
          rfRef.current?.setViewport(viewport, { duration: 0 })
        })
      }
    }
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(visibleEdges)
  }, [visibleEdges, setEdges])

  useEffect(() => {
    if (positionScopeRef.current !== graphScope) {
      positionScopeRef.current = graphScope
      return
    }
    const timer = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) {
        const key = node.data?.entityType && node.data?.entityId
          ? `${node.data.entityType}-${node.data.entityId}`
          : String(node.id)
        positions[key] = { x: node.position.x, y: node.position.y }
      }
      if (Object.keys(positions).length > 0) {
        saveNodePositions(graphScope, positions)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [graphScope, nodes])

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const builtIn = (nodeId: string) => {
        const match = /^(character|country|event)-(\d+)$/.exec(nodeId)
        return match ? { type: match[1] as 'character' | 'country' | 'event', id: Number(match[2]) } : null
      }
      const customId = (nodeId: string): { kind: 'section' | 'entry'; id: string } | null => {
        if (nodeId.startsWith('custom-section:')) {
          return { kind: 'section', id: nodeId.slice('custom-section:'.length) }
        }
        if (nodeId.startsWith('custom-entry:')) {
          return { kind: 'entry', id: nodeId.slice('custom-entry:'.length) }
        }
        return null
      }
      const sourceBuiltIn = builtIn(connection.source)
      const targetBuiltIn = builtIn(connection.target)
      const sourceCustom = customId(connection.source)
      const targetCustom = customId(connection.target)

      // Category cards in the sidebar are navigation hubs, not entities.
      const isHub = (id: string): boolean =>
        id.startsWith('category-') || id.startsWith('custom-section:')
      if (isHub(connection.source) || isHub(connection.target)) return

      if (sourceCustom?.kind === 'section' && targetCustom?.kind === 'section') {
        linkSections(sourceCustom.id, targetCustom.id)
        return
      }

      // Two custom entries can be connected directly. The source entry stores
      // the relation; it then appears in "其他关系" and in the graph.
      if (sourceCustom?.kind === 'entry' && targetCustom?.kind === 'entry') {
        const sourceSection = customSections.find((section) =>
          section.entries.some((entry) => entry.id === sourceCustom.id),
        )
        if (sourceSection) {
          linkEntryRelation(sourceSection.id, sourceCustom.id, targetCustom.id)
        }
        return
      }

      // Internal views are only filters, never a separate relationship store.
      // Every connection made there is a canonical relation so the entity
      // panels and the main graph see exactly the same data.
      if ((focusedSectionId || focusedCategory || focusedNodeId) && sourceBuiltIn && targetBuiltIn) {
        await createRelation({
          sourceType: sourceBuiltIn.type,
          sourceId: sourceBuiltIn.id,
          targetType: targetBuiltIn.type,
          targetId: targetBuiltIn.id,
          label: '相关',
          allowDuplicate:
            sourceBuiltIn.type === 'character' && targetBuiltIn.type === 'character',
        })
        refresh()
        return
      }

      if (sourceCustom || targetCustom) {
        const custom = sourceCustom ?? targetCustom
        const entity = sourceBuiltIn ?? targetBuiltIn
        if (!custom || !entity) return
        const field =
          entity.type === 'character'
            ? 'characterIds'
            : entity.type === 'country'
              ? 'countryIds'
              : 'eventIds'
        if (custom.kind === 'section') {
          linkSectionEntity(custom.id, field, entity.id)
        } else {
          const section = customSections.find((item) =>
            item.entries.some((entry) => entry.id === custom.id),
          )
          if (section) linkEntity(section.id, custom.id, field, entity.id)
        }
        return
      }

      setNewSource(connection.source)
      setNewTarget(connection.target)
      setNewLabel('相关')
      setRelationDialogOpen(true)
    },
    [
      createRelation,
      customSections,
      focusedCategory,
      focusedNodeId,
      focusedSectionId,
      linkEntity,
      linkEntryRelation,
      linkSectionEntity,
      linkSections,
      refresh,
    ],
  )

  const handleCreateRelation = useCallback(async () => {
    const parse = (nodeId: string): { type: 'character' | 'country' | 'event'; id: number } | null => {
      const [type, ...rest] = nodeId.split('-')
      const id = Number(rest.join('-'))
      if (!Number.isFinite(id)) return null
      if (type !== 'character' && type !== 'country' && type !== 'event') return null
      return { type, id }
    }
    const source = parse(newSource)
    const target = parse(newTarget)
    if (!source || !target || newSource === newTarget) return
    await createRelation({
      sourceType: source.type,
      sourceId: source.id,
      targetType: target.type,
      targetId: target.id,
      label: newLabel.trim() || '相关',
      allowDuplicate: source.type === 'character' && target.type === 'character',
    })
    setRelationDialogOpen(false)
    setNewSource('')
    setNewTarget('')
    setNewLabel('相关')
    refresh()
  }, [newLabel, newSource, newTarget, refresh])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setHighlightedNodeId(null)
      const entityType = node.data?.entityType as string | undefined
      const entityId = node.data?.entityId as number | undefined
      if (!entityId) return
      switch (entityType) {
        case 'character':
          onNavigateToCharacter?.(entityId)
          break
        case 'event':
          onNavigateToEvent?.(entityId)
          break
        case 'country':
          onNavigateToCountry?.(entityId)
          break
      }
    },
    [onNavigateToCharacter, onNavigateToEvent, onNavigateToCountry],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-ink-muted">加载图谱数据...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-error">{error}</span>
        <button onClick={refresh} className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink">重试</button>
      </div>
    )
  }

  if (allNodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-ink-muted">暂无关系数据，请先创建角色、事件或国家，并添加关联关系</span>
        <button onClick={refresh} className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink">刷新</button>
      </div>
    )
  }

  const openInterface = (nodeId: string): void => {
    const node = allNodes.find((item) => item.id === nodeId)
    if (!node) return
    const categoryKind = node.data?.categoryKind as 'character' | 'event' | 'country' | undefined
    if (categoryKind) {
      setActiveItem(categoryKind === 'character' ? '角色' : categoryKind === 'event' ? '事件' : '国家')
    } else if (node.data?.customKind === 'section' && node.data?.customSectionId) {
      setActiveItem(`custom:${node.data.customSectionId}`)
    } else if (node.data?.customKind === 'entry' && node.data?.customSectionId) {
      localStorage.setItem(
        `oc-focus-custom-entry:${node.data.customSectionId}`,
        nodeId.replace('custom-entry:', ''),
      )
      setActiveItem(`custom:${node.data.customSectionId}`)
    } else {
      const type = node.data?.entityType as string | undefined
      const id = node.data?.entityId as number | undefined
      if (!id) return
      if (type === 'character') onNavigateToCharacter?.(id)
      else if (type === 'country') onNavigateToCountry?.(id)
      else if (type === 'event') onNavigateToEvent?.(id)
    }
    setContextMenu(null)
  }

  const openInternal = (nodeId: string): void => {
    const node = allNodes.find((item) => item.id === nodeId)
    if (!node) return
    const categoryKind = node.data?.categoryKind as 'character' | 'event' | 'country' | undefined
    if (categoryKind) {
      setFocusedSectionId(null)
      setFocusedNodeId(null)
      setFocusedCategory(categoryKind)
    } else if (node.data?.customKind === 'section' && node.data?.customSectionId) {
      setFocusedCategory(null)
      setFocusedNodeId(null)
      setFocusedSectionId(node.data.customSectionId as string)
    } else if (node.data?.customKind === 'entry') {
      setFocusedCategory(null)
      setFocusedSectionId(null)
      setFocusedNodeId(nodeId)
    } else {
      setFocusedCategory(null)
      setFocusedSectionId(null)
      setFocusedNodeId(nodeId)
    }
    setContextMenu(null)
  }

  const deleteNode = async (nodeId: string): Promise<void> => {
    const node = allNodes.find((item) => item.id === nodeId)
    if (!node) {
      toast.error('找不到要删除的节点')
      return
    }
    const categoryKind = node.data?.categoryKind as string | undefined
    if (categoryKind) {
      setPendingDeleteNodeId(null)
      return
    }
    setDeletingNode(true)
    try {
      if (node.data?.customKind === 'section' && node.data?.customSectionId) {
        deleteSection(node.data.customSectionId as string)
      } else if (node.data?.customKind === 'entry' && node.data?.customSectionId) {
        deleteEntry(node.data.customSectionId as string, nodeId.replace('custom-entry:', ''))
      } else {
        const type = node.data?.entityType as string | undefined
        const id = node.data?.entityId as number | undefined
        if (!id) {
          toast.error('这个节点没有可删除的数据')
          return
        }
        if (type === 'character') await deleteCharacter(id)
        else if (type === 'country') await deleteCountry(id)
        else if (type === 'event') await deleteEvent(id)
        else {
          toast.error('未知的节点类型')
          return
        }
      }
      setPendingDeleteNodeId(null)
      setFocusedSectionId(null)
      setFocusedCategory(null)
      setFocusedNodeId(null)
      window.dispatchEvent(new Event('data-updated'))
      refresh()
      toast.success('已移到回收站')
    } catch (error) {
      console.error('[RelationGraph] delete node failed', error)
      toast.error('删除失败，请重试')
    } finally {
      setDeletingNode(false)
    }
  }

  const deleteEdge = async (): Promise<void> => {
    if (!pendingDeleteEdgeId) return
    setDeletingEdge(true)
    try {
      await deleteRelation(pendingDeleteEdgeId)
      setPendingDeleteEdgeId(null)
      refresh()
      toast.success('关系已删除')
    } catch (error) {
      console.error('[RelationGraph] delete edge failed', error)
      toast.error('删除关系失败，请重试')
    } finally {
      setDeletingEdge(false)
    }
  }

  const handleCreateNode = async (): Promise<void> => {
    const name = createName.trim()
    if (!name) return
    let createdNodeId: string | null = null
    if (createType === 'section') {
      const section = createSection(name)
      createdNodeId = `custom-section:${section.id}`
    } else if (createType.startsWith('entry:')) {
      const sectionId = createType.slice('entry:'.length)
      const entry = addEntry(sectionId, name)
      createdNodeId = `custom-entry:${entry.id}`
    } else if (createType === 'character') {
      const id = await createCharacter({
        name,
        aliases: [],
        race: '',
        element: '',
        occupation: '',
        nationalityLegacy: '',
        height: '',
        birthday: '',
        avatarUrl: '',
        bio: '',
        lifeStory: '',
        relatedCharacters: [],
        relatedNations: [],
        relatedNationLabels: {},
        relatedEvents: [],
        relatedEventLabels: {},
        gallery: [],
        avatars: [],
        tags: [],
      })
      createdNodeId = `character-${id}`
    } else if (createType === 'country') {
      const id = await createCountry({
        name,
        parentId: null,
        description: '',
        system: '',
        geography: '',
        culture: '',
        tags: [],
      })
      createdNodeId = `country-${id}`
    } else {
      const id = await createEvent({
        title: name,
        time: '',
        location: '',
        summary: '',
        isMajor: false,
        content: '',
        tags: [],
      })
      createdNodeId = `event-${id}`
    }
    setCreateOpen(false)
    setCreateName('')
    if (createdNodeId) setHighlightedNodeId(createdNodeId)
    window.dispatchEvent(new Event('data-updated'))
    refresh()
  }

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file || !pendingImageNodeId) return
    const node = allNodes.find((item) => item.id === pendingImageNodeId)
    const type = node?.data?.entityType as string | undefined
    const entityId = node?.data?.entityId as number | undefined
    if (node?.data?.customKind === 'entry' && node.data.customSectionId) {
      const path = await saveBlobToDisk(file, 'avatar')
      updateEntry(node.data.customSectionId as string, node.id.replace('custom-entry:', ''), {
        avatarUrl: path,
      })
      window.dispatchEvent(new Event('data-updated'))
      refresh()
      setPendingImageNodeId(null)
      return
    }
    if (!type || !entityId) return
    try {
      const path = await saveBlobToDisk(file, type === 'country' ? 'flag' : type === 'event' ? 'header' : 'avatar')
      if (type === 'character') {
        await updateCharacter(entityId, { avatarUrl: path, qAvatarUrl: path })
      } else if (type === 'country') {
        await updateCountry(entityId, { flagUrl: path })
      } else if (type === 'event') {
        await updateEvent(entityId, { headerUrl: path })
      }
      window.dispatchEvent(new Event('data-updated'))
      refresh()
    } finally {
      setPendingImageNodeId(null)
    }
  }

  const dragPoint = (event: MouseEvent | TouchEvent): { x: number; y: number } =>
    'clientX' in event
      ? { x: event.clientX, y: event.clientY }
      : {
          x: event.touches[0]?.clientX ?? 0,
          y: event.touches[0]?.clientY ?? 0,
        }

  return (
    <div className="relative h-full w-full">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleImageChange(event)}
      />
      {contextMenu
        ? createPortal(
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setContextMenu(null)}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div
                className="absolute w-36 rounded-lg border border-line bg-paper p-1 shadow-xl"
                style={{
                  left: Math.min(contextMenu.x, window.innerWidth - 160),
                  top: Math.min(contextMenu.y, window.innerHeight - 120),
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={() => openInterface(contextMenu.nodeId)}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-paper-card hover:text-ink"
                >
                  打开界面
                </button>
                <button
                  onClick={() => openInternal(contextMenu.nodeId)}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-paper-card hover:text-ink"
                >
                  内部关系
                </button>
                {(() => {
                  const node = allNodes.find((item) => item.id === contextMenu.nodeId)
                  const type = node?.data?.entityType
                  const isCustomEntry = node?.data?.customKind === 'entry'
                  if (
                    !isCustomEntry &&
                    type !== 'character' &&
                    type !== 'country' &&
                    type !== 'event'
                  ) {
                    return null
                  }
                  return (
                    <button
                      onClick={() => {
                        setPendingImageNodeId(contextMenu.nodeId)
                        setContextMenu(null)
                        if (imageInputRef.current) {
                          imageInputRef.current.value = ''
                          imageInputRef.current.click()
                        }
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-paper-card hover:text-ink"
                    >
                      更换图片
                    </button>
                  )
                })()}
                {(() => {
                  const node = allNodes.find((item) => item.id === contextMenu.nodeId)
                  if (!node || node.data?.categoryKind) return null
                  return (
                    <button
                      onClick={() => {
                        setPendingDeleteNodeId(contextMenu.nodeId)
                        setContextMenu(null)
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-xs text-error hover:bg-error/10"
                    >
                      删除
                    </button>
                  )
                })()}
              </div>
            </div>,
            document.body,
          )
        : null}

      <AppConfirm
        open={pendingDeleteNodeId !== null}
        title="删除节点"
        description="删除后会从角色/武器/宠物列表、关系图和所有关联面板同时移除，并进入回收站。确定删除吗？"
        confirmLabel="删除"
        danger
        busy={deletingNode}
        onCancel={() => setPendingDeleteNodeId(null)}
        onConfirm={() => {
          if (pendingDeleteNodeId) void deleteNode(pendingDeleteNodeId)
        }}
      />

      <AppConfirm
        open={pendingDeleteEdgeId !== null}
        title="删除关系"
        description="这条关系会从两个实体和相关关系图中一起移除。确定删除吗？"
        confirmLabel="删除"
        danger
        busy={deletingEdge}
        onCancel={() => setPendingDeleteEdgeId(null)}
        onConfirm={() => void deleteEdge()}
      />

      {hasFocus ? (
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-lg border border-line bg-paper/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
          <button
            onClick={() => {
              setFocusedSectionId(null)
              setFocusedCategory(null)
              setFocusedNodeId(null)
            }}
            className="text-ink-muted hover:text-ink"
          >
            ← 返回总关系图
          </button>
          <span className="h-3 w-px bg-line" />
          <span className="text-ink">{focusLabel} · 内部关系</span>
        </div>
      ) : null}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <div className="flex h-8 items-center rounded border border-line bg-paper p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setEdgeStyle('bezier')}
            className={`h-7 rounded px-2 text-[10px] ${
              edgeStyle === 'bezier' ? 'bg-paper-card text-ink' : 'text-ink-muted hover:text-ink'
            }`}
            title="曲线"
          >
            曲线
          </button>
          <button
            type="button"
            onClick={() => setEdgeStyle('straight')}
            className={`h-7 rounded px-2 text-[10px] ${
              edgeStyle === 'straight' ? 'bg-paper-card text-ink' : 'text-ink-muted hover:text-ink'
            }`}
            title="直线"
          >
            直线
          </button>
        </div>
        <button
          type="button"
          onClick={() => persistLayout(true)}
          title="保存当前布局"
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-paper text-ink-muted shadow-sm transition-colors hover:border-line-hover hover:text-ink"
        >
          <Save size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={autoArrange}
          title="自动整理布局（避免头像重叠）"
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-paper text-ink-muted shadow-sm transition-colors hover:border-line-hover hover:text-ink"
        >
          <LayoutGrid size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => void handleExportImage()}
          disabled={exporting}
          title="导出关系图 PNG"
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-paper text-ink-muted shadow-sm transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
        >
          <Download size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => refresh()}
          title="刷新关系图"
          className="flex h-8 w-8 items-center justify-center rounded border border-line bg-paper text-ink-muted shadow-sm transition-colors hover:border-line-hover hover:text-ink"
        >
          <RefreshCw size={13} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded border border-line bg-paper px-2.5 text-[11px] text-ink-muted shadow-sm transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={13} strokeWidth={2} />
          创建
        </button>
        <button
          type="button"
          onClick={() => setRelationDialogOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded border border-line bg-paper px-2.5 text-[11px] text-ink-muted shadow-sm transition-colors hover:border-line-hover hover:text-ink"
        >
          <Plus size={13} strokeWidth={2} />
          添加关系
        </button>
      </div>

      {selectedEdge ? (
        <div className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-line bg-paper/95 p-2.5 shadow-lg backdrop-blur md:bottom-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-ink-muted">
                关系线样式 · <span style={{ color: selectedEdgeColor }}>文字与线条同色</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedEdgeId(null)}
                className="text-ink-faint hover:text-ink"
                title="关闭"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {RELATION_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => applyEdgeStyle({ color: color.value })}
                  title={color.name}
                  aria-label={color.name}
                  className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                    selectedEdgeColor === color.value
                      ? 'border-ink ring-2 ring-line-hover'
                      : 'border-line'
                  }`}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {RELATION_ARROW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    applyEdgeStyle({ arrow: option.value })
                    toast.success(`箭头已设为${option.label}`)
                  }}
                  title={option.hint}
                  className={`h-6 flex-1 rounded border px-1.5 text-[10px] transition-colors ${
                    selectedEdgeArrow === option.value
                      ? 'border-line-hover bg-paper-card text-ink'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  {option.glyph} {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {relationDialogOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 p-4">
          <div className="w-[340px] rounded border border-line bg-paper p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-ink">建立新关系</p>
              <button onClick={() => setRelationDialogOpen(false)} className="text-ink-faint hover:text-ink">
                <X size={15} strokeWidth={2} />
              </button>
            </div>
            <label className="mb-2 flex flex-col gap-1 text-[10px] text-ink-faint">
              起点
              <select
                value={newSource}
                onChange={(event) => setNewSource(event.target.value)}
                className="h-8 rounded border border-line bg-paper-card px-2 text-xs text-ink outline-none"
              >
                <option value="">选择起点</option>
                {builtInNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.data.label as string}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-2 flex flex-col gap-1 text-[10px] text-ink-faint">
              终点
              <select
                value={newTarget}
                onChange={(event) => setNewTarget(event.target.value)}
                className="h-8 rounded border border-line bg-paper-card px-2 text-xs text-ink outline-none"
              >
                <option value="">选择终点</option>
                {builtInNodes
                  .filter((node) => node.id !== newSource)
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.data.label as string}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mb-3 flex flex-col gap-1 text-[10px] text-ink-faint">
              关系标签
              <input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                className="h-8 rounded border border-line bg-paper-card px-2 text-xs text-ink outline-none focus:border-line-hover"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRelationDialogOpen(false)}
                className="h-8 rounded border border-line px-3 text-xs text-ink-muted hover:text-ink"
              >
                取消
              </button>
              <button
                onClick={() => void handleCreateRelation()}
                disabled={!newSource || !newTarget}
                className="h-8 rounded bg-ink px-3 text-xs text-paper disabled:opacity-40"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        connectionMode={ConnectionMode.Loose}
        panOnDrag={mouseMode === 'right-pan' ? [2] : true}
        selectionOnDrag={mouseMode === 'right-pan'}
        selectionKeyCode={mouseMode === 'right-pan' ? null : 'Shift'}
        selectionMode={SelectionMode.Partial}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          setHighlightedNodeId(null)
          setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
        }}
        onPaneClick={() => {
          setContextMenu(null)
          setHighlightedNodeId(null)
          setSelectedEdgeId(null)
        }}
        onPaneContextMenu={(event) => event.preventDefault()}
        onEdgeClick={(_event, edge) => {
          setHighlightedNodeId(null)
          setSelectedEdgeId(String(edge.id).includes('->') ? String(edge.id) : null)
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()
          setSelectedEdgeId(String(edge.id).includes('->') ? String(edge.id) : null)
        }}
        onConnect={(connection) => void handleConnect(connection)}
        onNodeDragStart={(event, node) => {
          setHighlightedNodeId(null)
          const point = dragPoint(event)
          setDragGhost({ label: String(node.data?.label ?? ''), x: point.x, y: point.y })
        }}
        onNodeDrag={(event, node) => {
          const point = dragPoint(event)
          setDragGhost({ label: String(node.data?.label ?? ''), x: point.x, y: point.y })
        }}
        onNodeDragStop={(_event, node) => {
          setDragGhost(null)
          persistLayout(false, node)
        }}
        connectionLineStyle={{ stroke: '#8B8579', strokeWidth: 1.5 }}
        onMove={handleMove}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <ZoomReader onInstance={handleInstance} />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E7E3DC" />

        <DesktopRelationPanel
          showCharacters={showCharacters}
          showEvents={showEvents}
          showCountries={showCountries}
          onToggleCharacters={() => setShowCharacters(!showCharacters)}
          onToggleEvents={() => setShowEvents(!showEvents)}
          onToggleCountries={() => setShowCountries(!showCountries)}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          sections={customSections}
          hiddenSectionIds={hiddenSectionIds}
          onToggleSection={toggleSectionVisibility}
          onCreateSection={() => {
            setCreateType('section')
            setCreateOpen(true)
          }}
        />

        <FitViewOnLoad
          key={`${focusedSectionId ?? 'all'}:${focusedCategory ?? ''}:${focusedNodeId ?? ''}`}
          ready={filteredNodes.length > 0 && !loading}
        />
        <MiniMap
          nodeColor={(node) => {
            switch (node.data?.entityType as string | undefined) {
              case 'character':
                return '#D6D0C4'
              case 'event':
                return '#E7E3DC'
              case 'country':
                return '#F3EFE9'
              default:
                return '#A5A098'
            }
          }}
          maskColor="rgba(0,0,0,0.03)"
          className="!border !border-line !rounded-md !bg-paper"
        />
      </ReactFlow>

      <MobileRelationControls
        showCharacters={showCharacters}
        showEvents={showEvents}
        showCountries={showCountries}
        onToggleCharacters={() => setShowCharacters(!showCharacters)}
        onToggleEvents={() => setShowEvents(!showEvents)}
        onToggleCountries={() => setShowCountries(!showCountries)}
        zoom={zoom}
        onZoomChange={handleZoomChange}
        sections={customSections}
        hiddenSectionIds={hiddenSectionIds}
        onToggleSection={toggleSectionVisibility}
        onCreateSection={() => {
          setCreateType('section')
          setCreateOpen(true)
        }}
      />

      {dragGhost
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999] max-w-[180px] truncate rounded-lg border border-line-hover bg-paper/90 px-3 py-1.5 text-xs text-ink shadow-lg backdrop-blur"
              style={{ left: dragGhost.x + 14, top: dragGhost.y + 12, opacity: 0.82 }}
            >
              {dragGhost.label}
            </div>,
            document.body,
          )
        : null}

      {edgeEditor
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25 p-4"
              onClick={(event) => {
                if (event.target === event.currentTarget) setEdgeEditor(null)
              }}
            >
              <div className="w-[360px] rounded-xl border border-line bg-paper p-4 shadow-xl">
                <h3 className="font-serif text-base text-ink">编辑关系标签</h3>
                <p className="mt-1 text-[11px] text-ink-muted">
                  修改后会同步到相关实体面板。
                </p>
                <input
                  ref={edgeEditorInputRef}
                  autoFocus
                  value={edgeEditorValue}
                  onChange={(event) => setEdgeEditorValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const next =
                        (edgeEditorInputRef.current?.value ?? edgeEditorValue).trim() || '相关'
                      edgeEditor.save(next)
                      setEdgeEditor(null)
                    }
                    if (event.key === 'Escape') setEdgeEditor(null)
                  }}
                  className="mt-3 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setEdgeEditor(null)}
                    className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const next =
                        (edgeEditorInputRef.current?.value ?? edgeEditorValue).trim() || '相关'
                      edgeEditor.save(next)
                      setEdgeEditor(null)
                    }}
                    className="h-8 rounded-lg bg-ink px-3 text-xs text-paper"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {createOpen ? createPortal(
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false)
          }}
        >
          <div className="w-[360px] rounded-xl border border-line bg-paper p-4 shadow-xl">
            <h3 className="font-serif text-base text-ink">在关系图中创建</h3>
            <p className="mt-1 text-[11px] text-ink-muted">
              创建后会同步出现在侧边栏对应分类中。
            </p>
            <select
              value={createType}
              onChange={(event) => setCreateType(event.target.value)}
              className="mt-3 h-8 w-full rounded-lg border border-line bg-paper-card px-2 text-xs text-ink outline-none"
            >
              <option value="character">角色</option>
              <option value="country">国家</option>
              <option value="event">事件</option>
              <option value="section">＋ 新建自定义分类</option>
              {customSections.length > 0 ? (
                <optgroup label="在已有分类中创建">
                  {customSections.map((section) => (
                    <option key={section.id} value={`entry:${section.id}`}>
                      {section.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <input
              autoFocus
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreateNode()
                if (event.key === 'Escape') setCreateOpen(false)
              }}
              placeholder={
                createType === 'section'
                  ? '分类名称，例如：信仰'
                  : createType.startsWith('entry:')
                    ? `${customSections.find((section) => section.id === createType.slice(6))?.name ?? '条目'}名称`
                    : '名称'
              }
              className="mt-2 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted"
              >
                取消
              </button>
              <button
                onClick={() => void handleCreateNode()}
                disabled={!createName.trim()}
                className="h-8 rounded-lg bg-ink px-3 text-xs text-paper disabled:opacity-40"
              >
                创建
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
