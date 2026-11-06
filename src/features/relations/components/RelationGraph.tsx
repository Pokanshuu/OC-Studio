'use client'

import { useState, useCallback, useMemo, useEffect, useRef, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  MiniMap,
  SelectionMode,
  ViewportPortal,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
  type OnMove,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import { ArrowUpRight, Focus, Image as ImageIcon, ImageDown, LayoutGrid, RefreshCw, Trash2 } from 'lucide-react'

import type { EdgeStyle } from '@/lib/edge-style'
import { useSettings } from '@/lib/settings'
import { useDevice } from '@/lib/use-device'
import { saveBlobToDisk } from '@/lib/image-service'
import { newCharacterData, newCountryData, newEventData } from '@/lib/entity-defaults'
import { createCharacter } from '@/features/characters/services'
import { createCountry } from '@/features/countries/services'
import { createEvent } from '@/features/events/services'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MediaContextMenu, type MediaMenuItem } from '@/components/shared/MediaContextMenu'
import { CENTER_STATE } from '@/lib/ui-tokens'
import { useGraphData } from '../hooks/useGraphData'
import {
  deleteGraphNode,
  deleteRelationBetween,
  createRelationBetween,
  saveNodePosition,
  setGraphNodeImage,
  updateEdgeStyle,
} from '../services'
import { EdgeStylePanel, type EdgeStylePatchInput, type EdgeStyleSelection } from './EdgeStylePanel'
import { useExportCenter } from '@/components/shared/export/ExportCenterHost'
import { computeForceLayout, NODE_SIZE, resolveGraphPositions } from '../layout'
import { nodeRect } from './floating-edge'
import { FitViewOnLoad, ZoomReader } from './RelationGraphHelpers'
import { RelationCreateDialog } from './RelationCreateDialog'
import { RelationTopBar } from './RelationTopBar'
import { RelationToolsBar } from './RelationToolsBar'
import { RelationControlBar } from './RelationControlBar'
import { RelationZoomBar } from './RelationZoomBar'
import { RelationNodeCreateDialog } from './RelationNodeCreateDialog'
import {
  LABEL_ZOOM,
  MIN_ZOOM,
  nodeTypes,
  edgeTypes,
  relationPlan,
  routeEdges,
  type RelationDraft,
} from './relation-graph-utils'
import type { GraphEdgeData, GraphNode, GraphNodeData, RelationEdgeType, RelationNodeType } from '../types'

interface RelationGraphProps {
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onNavigateToWorld?: (id: number) => void
  visible?: boolean
}

/** 无序节点对：同一对节点在图里只有一条边（与 services.buildGraphData 的去重口径一致） */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('||')
}

function isEdgeNodeType(value: string | undefined): value is RelationNodeType {
  return value === 'character' || value === 'event' || value === 'country' || value === 'world'
}

const ALIGN_THRESHOLD = 8
const SNAP_GRID: [number, number] = [8, 8]
const EMPTY_GUIDES: AlignGuides = { vertical: null, horizontal: null }
const MINI_MAP_SIZE = { width: 160, height: 110 }

interface AlignGuides {
  vertical: { x: number; y1: number; y2: number } | null
  horizontal: { y: number; x1: number; x2: number } | null
}

/** 删除确认的两类目标：节点 / 一条关系 */
type DeleteTarget =
  | { kind: 'node'; nodeId: string; label: string }
  | { kind: 'relation'; selection: EdgeStyleSelection }

export function RelationGraph({
  onNavigateToCharacter,
  onNavigateToEvent,
  onNavigateToCountry,
  onNavigateToWorld,
  visible,
}: RelationGraphProps) {
  const { nodes: rawNodes, edges: rawEdges, loading, error, refresh } = useGraphData()
  const { settings, updateSetting } = useSettings()
  const { isMobile } = useDevice()
  const mouseMode = settings.mouseMode
  const edgeStyle = settings.edgeStyle
  const prevVisible = useRef(false)

  /* ── 显示开关（不落盘：与地图的图层开关同一口径，重开回到默认） ── */
  const [visibleTypes, setVisibleTypes] = useState<Record<RelationNodeType, boolean>>({
    character: true,
    event: true,
    country: true,
    world: true,
  })
  const [showIsolated, setShowIsolated] = useState(true)
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [showMiniMap, setShowMiniMap] = useState(true)

  const [zoom, setZoom] = useState(1)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  /** 停在某条边上时显示它的关系名（默认不显示，避免一屏全是标签） */
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  /** 「只看它的关系」：只留这个节点与它的一跳邻居 */
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RelationDraft | null>(null)
  const [savingRelation, setSavingRelation] = useState(false)
  const openExportCenter = useExportCenter()
  const [edgePanel, setEdgePanel] = useState<{
    selection: EdgeStyleSelection
    anchor: { x: number; y: number }
  } | null>(null)
  const [nodeMenu, setNodeMenu] = useState<{ at: { x: number; y: number }; nodeId: string } | null>(null)
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const [guides, setGuides] = useState<AlignGuides>(EMPTY_GUIDES)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [imageTarget, setImageTarget] = useState<string | null>(null)
  const [dragGhost, setDragGhost] = useState<{ label: string; x: number; y: number } | null>(null)
  /** 定位请求：等这一类节点的显示开关生效、节点进了画布再去居中 */
  const [locateRequest, setLocateRequest] = useState<string | null>(null)

  const rfRef = useRef<ReactFlowInstance | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  // 面板已经自带外点/取消失败的收口；这里再兜一层 Esc，画布上按 Esc 等价于点空白
  useEffect(() => {
    if (!edgePanel) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEdgePanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edgePanel])

  const handleZoomPercent = useCallback((percent: number) => {
    const clamped = Math.max(Math.round(MIN_ZOOM * 100), Math.min(200, percent))
    rfRef.current?.zoomTo(clamped / 100, { duration: 0 })
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
      void refresh()
    }
    // 离开关系图时把浮层收掉：面板 Portal 在 #overlay-root，不随画布卸载，
    // 否则切到别的分区还能看见一个「关系线」飘在那里
    if (!isVisible) {
      setEdgePanel(null)
      setDraft(null)
      setNodeMenu(null)
      setMoreMenu(null)
      setCreateOpen(false)
    }
    prevVisible.current = isVisible
  }, [visible, refresh])

  /* ── 派生：计数 / 邻接 / 过滤 ─────────────────────────────── */

  const counts = useMemo(() => {
    const base: Record<RelationNodeType, number> = { character: 0, event: 0, country: 0, world: 0 }
    for (const node of rawNodes) base[node.data.entityType] += 1
    return base
  }, [rawNodes])

  /** 每个节点连着几条边：0 = 孤立节点（新建后还没连线的那些） */
  const degree = useMemo(() => {
    const map = new Map<string, number>()
    for (const edge of rawEdges) {
      map.set(edge.source, (map.get(edge.source) ?? 0) + 1)
      map.set(edge.target, (map.get(edge.target) ?? 0) + 1)
    }
    return map
  }, [rawEdges])

  /** 聚焦：这个节点 + 一跳邻居 */
  const focusSet = useMemo(() => {
    if (!focusNodeId) return null
    const set = new Set<string>([focusNodeId])
    for (const edge of rawEdges) {
      if (edge.source === focusNodeId) set.add(edge.target)
      if (edge.target === focusNodeId) set.add(edge.source)
    }
    return set
  }, [focusNodeId, rawEdges])

  const filteredNodes = useMemo(() => {
    return rawNodes.filter((node) => {
      if (!visibleTypes[node.data.entityType]) return false
      if (!showIsolated && (degree.get(node.id) ?? 0) === 0) return false
      if (focusSet && !focusSet.has(node.id)) return false
      return true
    })
  }, [rawNodes, visibleTypes, showIsolated, degree, focusSet])

  const nodeIdSet = useMemo(() => new Set(filteredNodes.map((node) => node.id)), [filteredNodes])

  const visibleEdges = useMemo(
    () => rawEdges.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)),
    [rawEdges, nodeIdSet],
  )

  const layoutedNodes = useMemo(() => {
    // 只有**实体里存过坐标**的节点才钉住（用户拖过才有），其余交给力导向布局。
    // 「哪些算有坐标」与导出重绘共用一份（`layout.ts#resolveGraphPositions`）。
    return resolveGraphPositions(filteredNodes, rawEdges)
  }, [filteredNodes, rawEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // 保留选中：刷新（改名 / 删除 / 新建之后都会刷）不该把用户刚点上的那颗节点弹掉
  useEffect(() => {
    setNodes((current) => {
      const selected = new Set(current.filter((node) => node.selected).map((node) => node.id))
      if (selected.size === 0) return layoutedNodes
      return layoutedNodes.map((node) => (selected.has(node.id) ? { ...node, selected: true } : node))
    })
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(visibleEdges)
  }, [visibleEdges, setEdges])

  /** 每条边按两端节点的相对方位选手柄（否则所有线都从同一个点挤出来） */
  const routedEdges = useMemo(() => routeEdges(nodes, edges), [nodes, edges])

  /** 选中的节点（React Flow 自己维护 `selected`，不再存第二份） */
  const selectedIds = useMemo(() => {
    const set = new Set<string>()
    for (const node of nodes) if (node.selected) set.add(node.id)
    return set
  }, [nodes])

  /**
   * 聚焦集合：悬停优先（看完就走），否则用选中（停着看）。
   * 高亮的不只是那几颗节点，还有它们之间的线 —— 否则「邻居」只有点没有关系，看不出谁连谁。
   */
  const active = useMemo(() => {
    const source: ReadonlySet<string> = hoveredNodeId ? new Set([hoveredNodeId]) : selectedIds
    if (source.size === 0) return null
    const nodeIds = new Set(source)
    const edgeIds = new Set<string>()
    for (const edge of routedEdges) {
      if (source.has(edge.source) || source.has(edge.target)) {
        nodeIds.add(edge.source)
        nodeIds.add(edge.target)
        edgeIds.add(edge.id)
      }
    }
    return { nodeIds, edgeIds }
  }, [hoveredNodeId, selectedIds, routedEdges])

  /**
   * 打开某条边（改名 / 颜色 / 箭头 / 删除）。点线与点线上的文字标签共用这一条路径，
   * 所以两者打开的永远是同一个面板、同一套数据。
   */
  const openEdgePanel = useCallback((edge: Edge, point: { x: number; y: number }) => {
    const [sourceType, sourceIdRaw] = edge.source.split('-')
    const [targetType, targetIdRaw] = edge.target.split('-')
    if (!isEdgeNodeType(sourceType) || !isEdgeNodeType(targetType)) return
    const sourceId = Number(sourceIdRaw)
    const targetId = Number(targetIdRaw)
    if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) return
    const data = edge.data as GraphEdgeData | undefined
    // 正文推出来的「引用」不是可编辑的边：不给面板，避免误删成命名边
    if (data?.kind === 'reference') return
    setEdgePanel({
      selection: {
        sourceType,
        sourceId,
        targetType,
        targetId,
        relation: data?.relation ?? '',
        kind: data?.kind,
        color: data?.color,
        arrow: data?.arrow,
      },
      anchor: point,
    })
  }, [])

  /* ── 导航 / 节点动作 ─────────────────────────────────────── */

  const openEntity = useCallback(
    (node: Node) => {
      const entityType = node.data?.entityType as RelationNodeType | undefined
      const entityId = node.data?.entityId as number | undefined
      if (!entityType || entityId === undefined) return
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
        case 'world':
          onNavigateToWorld?.(entityId)
          break
      }
    },
    [onNavigateToCharacter, onNavigateToEvent, onNavigateToCountry, onNavigateToWorld],
  )

  const displayNodes = useMemo<Node<GraphNodeData>[]>(() => {
    return nodes.map((node) => {
      const dim = active !== null && !active.nodeIds.has(node.id)
      return {
        ...node,
        zIndex: node.selected || node.id === hoveredNodeId ? 1000 : undefined,
        // 打开动作从节点冒出去（选中时右上角那枚圆钮，见 NodeOpenButton）
        data: { ...(node.data as GraphNodeData), onOpen: () => openEntity(node) },
        style: { ...(node.style as Record<string, unknown> | undefined), opacity: dim ? 0.25 : 1 },
      }
    })
  }, [nodes, active, hoveredNodeId, openEntity])

  const displayEdges = useMemo(() => {
    return routedEdges.map((edge) => {
      const [sourceType, sourceIdRaw] = edge.source.split('-')
      const [targetType, targetIdRaw] = edge.target.split('-')
      const panelMatches =
        edgePanel !== null &&
        edgePanel.selection.sourceType === sourceType &&
        edgePanel.selection.sourceId === Number(sourceIdRaw) &&
        edgePanel.selection.targetType === targetType &&
        edgePanel.selection.targetId === Number(targetIdRaw) &&
        edgePanel.selection.relation === ((edge.data?.relation as string | undefined) ?? '')
      const showLabel =
        showEdgeLabels ||
        edge.id === hoveredEdgeId ||
        panelMatches ||
        (active !== null && active.edgeIds.has(edge.id))
      const dim = active !== null && !active.edgeIds.has(edge.id)
      return {
        ...edge,
        // 标签在 EdgeLabelRenderer 里渲染，拿不到画布的 onEdgeClick —— 把回调挂到边上
        data: {
          ...edge.data,
          showLabel,
          onLabelClick: (point: { x: number; y: number }) => openEdgePanel(edge, point),
        },
        ...(dim ? { style: { ...(edge.style as Record<string, unknown> | undefined), opacity: 0.08 } } : {}),
      }
    })
  }, [routedEdges, hoveredEdgeId, active, edgePanel, openEdgePanel, showEdgeLabels])

  /**
   * 单击 = **选中**（高亮它和它的邻居，不跳走）；双击 = 打开。
   * 移动端没有 hover / 双击，tap 就是打开（保持原来的手感）。
   */
  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      setEdgePanel(null)
      if (isMobile) openEntity(node)
    },
    [isMobile, openEntity],
  )

  const handleNodeDoubleClick = useCallback(
    (_event: ReactMouseEvent, node: Node) => {
      if (!isMobile) openEntity(node)
    },
    [isMobile, openEntity],
  )

  /** 拖拽结束 → 坐标写回实体（仓库模式下会落成 frontmatter 的 `graph_position`） */
  const handleNodeDragStop = useCallback((_event: ReactMouseEvent, node: Node) => {
    setGuides(EMPTY_GUIDES)
    setDragGhost(null)
    const entityType = node.data?.entityType as RelationNodeType | undefined
    const entityId = node.data?.entityId as number | undefined
    if (!entityType || entityId === undefined) return
    void saveNodePosition(entityType, entityId, node.position.x, node.position.y)
  }, [])

  /** 拖拽时跟着指针走的「名字浮尘」：缩得很小时节点名看不见，跟着手反而看得清 */
  const dragPoint = (event: ReactMouseEvent): { x: number; y: number } => ({
    x: event.clientX,
    y: event.clientY,
  })

  /**
   * 拖动中找对齐参考线（docs/关系图.md §3）：中心线在 8px 内对齐就画一条，
   * 只做视觉提示，不强行吸过去 —— 吸附交给 `snapGrid` 的 8px 网格，二者互不抢手。
   */
  const handleNodeDrag = useCallback(
    (event: ReactMouseEvent, node: Node) => {
      setDragGhost({
        label: String(node.data?.label ?? ''),
        ...dragPoint(event),
      })

      const moving = nodeRect({
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width,
        height: node.measured?.height,
        entityType: node.data?.entityType,
      })
      const movingCenterX = moving.x + moving.width / 2
      const movingCenterY = moving.y + moving.height / 2
      let vertical: AlignGuides['vertical'] = null
      let horizontal: AlignGuides['horizontal'] = null

      for (const other of nodes) {
        if (other.id === node.id) continue
        const rect = nodeRect({
          x: other.position.x,
          y: other.position.y,
          width: other.measured?.width,
          height: other.measured?.height,
          entityType: other.data?.entityType,
        })
        const centerX = rect.x + rect.width / 2
        const centerY = rect.y + rect.height / 2
        if (vertical === null && Math.abs(centerX - movingCenterX) <= ALIGN_THRESHOLD) {
          vertical = {
            x: centerX,
            y1: Math.min(rect.y, moving.y) - 16,
            y2: Math.max(rect.y + rect.height, moving.y + moving.height) + 16,
          }
        }
        if (horizontal === null && Math.abs(centerY - movingCenterY) <= ALIGN_THRESHOLD) {
          horizontal = {
            y: centerY,
            x1: Math.min(rect.x, moving.x) - 16,
            x2: Math.max(rect.x + rect.width, moving.x + moving.width) + 16,
          }
        }
        if (vertical !== null && horizontal !== null) break
      }
      setGuides({ vertical, horizontal })
    },
    [nodes],
  )

  /* ── 整理 / 保存 / 导出 ─────────────────────────────────── */

  /**
   * 重新布局：无视已有坐标，整张图重跑力导向，并把新坐标写回实体。
   * 显式动作，所以覆盖用户之前的摆位是符合预期的；不写回的话下次打开又会弹回旧位置。
   * **整理前先记一次坐标快照**，整理后给一个「撤销」（会话内一次，见 docs/关系图.md §6.1）。
   *
   * 只在 ⋯ 里（一级栏放它太容易手滑：一次就覆盖全部手摆位置）。
   */
  const handleRelayout = useCallback(() => {
    if (filteredNodes.length === 0) return

    const snapshot = new Map<string, { x: number; y: number; entityType: RelationNodeType; entityId: number }>()
    for (const node of nodes) {
      const entityType = node.data?.entityType as RelationNodeType | undefined
      const entityId = node.data?.entityId as number | undefined
      if (!entityType || entityId === undefined) continue
      snapshot.set(node.id, { x: node.position.x, y: node.position.y, entityType, entityId })
    }

    const layout = computeForceLayout(filteredNodes, rawEdges)
    setNodes((current) =>
      current.map((node) => ({ ...node, position: layout.get(node.id) ?? node.position })),
    )
    for (const node of filteredNodes) {
      const position = layout.get(node.id)
      const entityType = node.data?.entityType as RelationNodeType | undefined
      const entityId = node.data?.entityId as number | undefined
      if (!position || !entityType || entityId === undefined) continue
      void saveNodePosition(entityType, entityId, position.x, position.y)
    }
    rfRef.current?.fitView({ padding: 0.2, duration: 200, minZoom: MIN_ZOOM })

    toast('已整理布局', {
      duration: 8000,
      action: {
        label: '撤销',
        onClick: () => {
          setNodes((current) =>
            current.map((node) => {
              const previous = snapshot.get(node.id)
              return previous ? { ...node, position: { x: previous.x, y: previous.y } } : node
            }),
          )
          // 快照也要写回实体：否则只是画布回原位，下次打开还是整理后的位置
          for (const previous of snapshot.values()) {
            void saveNodePosition(previous.entityType, previous.entityId, previous.x, previous.y)
          }
        },
      },
    })
  }, [filteredNodes, rawEdges, nodes, setNodes])


  const handleEdgeStyleChange = useCallback(
    (value: EdgeStyle) => updateSetting('edgeStyle', value),
    [updateSetting],
  )

  /* ── 建关系（拖拽连线） ──────────────────────────────────── */

  const existingPairs = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const e of rawEdges) {
      // 只在一侧有记录的成员关系（data.incomplete）允许再拖一次补全
      map.set(pairKey(e.source, e.target), e.data?.incomplete === true)
    }
    return map
  }, [rawEdges])

  const nodeTypeOf = useCallback(
    (nodeId: string | null): RelationNodeType | undefined => {
      if (!nodeId) return undefined
      return nodes.find((n) => n.id === nodeId)?.data?.entityType as RelationNodeType | undefined
    },
    [nodes],
  )

  /** 连线是否成立：不同节点、这类组合有对应字段可写；角色/事件之间允许多条（成员关系仍一对一） */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target } = connection
      if (!source || !target || source === target) return false
      const sourceType = nodeTypeOf(source)
      const targetType = nodeTypeOf(target)
      if (!sourceType || !targetType) return false
      const plan = relationPlan(sourceType, targetType)
      if (!plan.supported) return false
      // 成员 / 归属类：两侧写的是同一条事实，已完整就不能再连
      // 角色↔角色、事件↔事件：同一条线可以有多条不同名字的关系（PR #5 的 #1）
      const allowsParallel = sourceType === targetType && (sourceType === 'character' || sourceType === 'event')
      if (!allowsParallel && existingPairs.get(pairKey(source, target)) === false) return false
      return true
    },
    [existingPairs, nodeTypeOf],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return
      const sourceType = sourceNode.data?.entityType as RelationNodeType | undefined
      const targetType = targetNode.data?.entityType as RelationNodeType | undefined
      const sourceId = sourceNode.data?.entityId as number | undefined
      const targetId = targetNode.data?.entityId as number | undefined
      if (!sourceType || !targetType || sourceId === undefined || targetId === undefined) return

      setDraft({
        source: { entityType: sourceType, entityId: sourceId, label: String(sourceNode.data?.label ?? '') },
        target: { entityType: targetType, entityId: targetId, label: String(targetNode.data?.label ?? '') },
        plan: relationPlan(sourceType, targetType),
      })
    },
    [nodes],
  )

  const handleCancelRelation = useCallback(() => {
    if (savingRelation) return
    setDraft(null)
  }, [savingRelation])

  const handleSubmitRelation = useCallback(
    async (relation: string) => {
      if (!draft || savingRelation) return
      setSavingRelation(true)
      try {
        const result = await createRelationBetween(draft.source, draft.target, relation)
        if (!result.ok) {
          if (result.reason === 'duplicate') toast('这两个条目已经有关联')
          else if (result.reason === 'missing') toast.error('条目已不存在')
          else toast('这两类条目之间暂不支持关联')
          setDraft(null)
          return
        }
        setDraft(null)
        // 静默刷新：新边直接出现，画布不闪、视口与缩放保留
        await refresh({ silent: true })
      } catch (err) {
        toast.error('添加关系失败', { description: err instanceof Error ? err.message : String(err) })
      } finally {
        setSavingRelation(false)
      }
    },
    [draft, savingRelation, refresh],
  )

  /* ── 新建 / 删 / 换图 ───────────────────────────────────── */

  /**
   * 新建节点：建完**落在当前视口中心**，而不是交给力导向。
   * 新节点没有坐标时力导向把它排在已钉住节点的质心周围（半径 max(220, n×16)），
   * 几十个节点时那圈在屏幕外 —— 「点了新建，什么都没发生」。
   */
  const handleCreateNode = useCallback(
    async (type: RelationEdgeType, name: string) => {
      if (creating) return
      setCreating(true)
      try {
        const size = NODE_SIZE[type]
        const rect = wrapperRef.current?.getBoundingClientRect()
        const rf = rfRef.current
        const anchor =
          rect && rf
            ? rf.screenToFlowPosition({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              })
            : { x: 0, y: 0 }
        const position = { x: anchor.x - size.w / 2, y: anchor.y - size.h / 2 }

        let entityId: number
        if (type === 'character') {
          entityId = await createCharacter({ ...newCharacterData(), name })
        } else if (type === 'country') {
          entityId = await createCountry({ ...newCountryData(), name })
        } else {
          entityId = await createEvent({ ...newEventData(), title: name })
        }

        await saveNodePosition(type, entityId, position.x, position.y)
        setCreateOpen(false)
        await refresh({ silent: true })
        toast.success(`已创建「${name}」`)
      } catch (err) {
        toast.error('创建失败', { description: err instanceof Error ? err.message : String(err) })
      } finally {
        setCreating(false)
      }
    },
    [creating, refresh],
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setEdgePanel(null)
    try {
      if (deleteTarget.kind === 'node') {
        const node = rawNodes.find((item) => item.id === deleteTarget.nodeId)
        if (!node) return
        await deleteGraphNode(node.data.entityType, node.data.entityId)
        setFocusNodeId(null)
        await refresh({ silent: true })
        toast.success('已移到回收站')
      } else {
        const { selection } = deleteTarget
        const ok = await deleteRelationBetween(
          { entityType: selection.sourceType, entityId: selection.sourceId },
          { entityType: selection.targetType, entityId: selection.targetId },
          selection.relation,
        )
        if (ok) toast.success('已删除关系')
        else toast('这条关系没有可删的数据')
        await refresh({ silent: true })
      }
    } catch (err) {
      toast.error('删除失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, deleting, rawNodes, refresh])

  const handleEdgePatch = useCallback(
    (patch: EdgeStylePatchInput) => {
      if (!edgePanel) return
      const { selection } = edgePanel
      // 乐观更新面板自己的选中态：改颜色、再接箭头是一次动作里的两下，
      // 面板不能在第一下就关掉（关掉就逼用户重新点那条细线）
      setEdgePanel((current) => {
        if (!current) return current
        return {
          ...current,
          selection: {
            ...current.selection,
            relation: patch.relation ?? current.selection.relation,
            color: patch.color === null ? undefined : (patch.color ?? current.selection.color),
            arrow: patch.arrow === null ? undefined : (patch.arrow ?? current.selection.arrow),
          },
        }
      })
      void updateEdgeStyle(
        { entityType: selection.sourceType, entityId: selection.sourceId },
        { entityType: selection.targetType, entityId: selection.targetId },
        patch,
      ).then((ok) => {
        if (!ok) toast.error('这条关系已不在数据里')
        void refresh({ silent: true })
      })
    },
    [edgePanel, refresh],
  )

  const handleImageSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      const targetId = imageTarget
      event.target.value = ''
      setImageTarget(null)
      if (!file || !targetId) return
      const node = rawNodes.find((item) => item.id === targetId)
      if (!node) return
      try {
        const slot =
          node.data.entityType === 'country' ? 'flag' : node.data.entityType === 'event' ? 'header' : 'avatar'
        const path = await saveBlobToDisk(file, slot)
        await setGraphNodeImage(node.data.entityType, node.data.entityId, path)
        await refresh({ silent: true })
      } catch (err) {
        toast.error('更换图片失败', { description: err instanceof Error ? err.message : String(err) })
      }
    },
    [imageTarget, rawNodes, refresh],
  )

  /* ── 定位 / 聚焦 ───────────────────────────────────────── */

  const handleLocate = useCallback((nodeId: string) => {
    const node = rawNodes.find((item) => item.id === nodeId)
    if (!node) return
    // 被筛掉的那一类要一并打开，否则「定位」定位到一个不在画布上的节点
    setVisibleTypes((current) =>
      current[node.data.entityType] ? current : { ...current, [node.data.entityType]: true },
    )
    // 聚焦状态下只留了一小撮节点，先退回去，否则目标根本不在画布里
    setFocusNodeId(null)
    // 孤立节点被隐藏时同样找不到它 —— 定位就是「把它摆到眼前」，两个开关都放行
    setShowIsolated(true)
    setLocateRequest(nodeId)
  }, [rawNodes])

  // 等显示开关生效、节点进了画布，再居中 + 选中
  useEffect(() => {
    if (!locateRequest) return
    const node = nodes.find((item) => item.id === locateRequest)
    if (!node) return
    const type = node.data?.entityType as RelationNodeType
    const width = node.measured?.width ?? NODE_SIZE[type]?.w ?? 60
    const height = node.measured?.height ?? NODE_SIZE[type]?.h ?? 84
    setLocateRequest(null)
    setNodes((current) => current.map((item) => ({ ...item, selected: item.id === locateRequest })))
    rfRef.current?.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      zoom: Math.max(rfRef.current.getZoom(), 0.85),
      duration: 260,
    })
  }, [locateRequest, nodes, setNodes])

  const focusNode = focusNodeId ? rawNodes.find((node) => node.id === focusNodeId) : undefined
  const focusLabel = focusNode ? focusNode.data.label : null

  /* ── 菜单 ─────────────────────────────────────────────── */

  const moreItems: MediaMenuItem[] = [
    {
      label: '重排全部',
      icon: <LayoutGrid size={13} strokeWidth={2} />,
      onSelect: handleRelayout,
    },
    {
      label: '刷新',
      icon: <RefreshCw size={13} strokeWidth={2} />,
      onSelect: () => void refresh(),
    },
    {
      label: '导出图片…',
      icon: <ImageDown size={13} strokeWidth={2} />,
      onSelect: () => openExportCenter({ tab: 'graph' }),
    },
  ]

  const menuNode = nodeMenu ? rawNodes.find((node) => node.id === nodeMenu.nodeId) : undefined
  const nodeMenuItems: MediaMenuItem[] = menuNode
    ? [
        {
          label: '打开',
          icon: <ArrowUpRight size={13} strokeWidth={2} />,
          onSelect: () => openEntity(menuNode),
        },
        {
          label: menuNode.id === focusNodeId ? '退出聚焦' : '只看它的关系',
          icon: <Focus size={13} strokeWidth={2} />,
          onSelect: () => setFocusNodeId(menuNode.id === focusNodeId ? null : menuNode.id),
        },
        {
          label: '更换图片',
          icon: <ImageIcon size={13} strokeWidth={2} />,
          onSelect: () => {
            setImageTarget(menuNode.id)
            imageInputRef.current?.click()
          },
        },
        {
          label: '删除',
          danger: true,
          icon: <Trash2 size={13} strokeWidth={2} />,
          onSelect: () =>
            setDeleteTarget({
              kind: 'node',
              nodeId: menuNode.id,
              label: String(menuNode.data.label ?? ''),
            }),
        },
      ]
    : []

  /* ── 空态 ─────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载图谱数据…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-[13px] text-error">{error}</span>
        <button onClick={() => void refresh()} className="px-1.5 py-1 text-[13px] text-ink-muted transition-colors hover:text-ink">重试</button>
      </div>
    )
  }

  if (rawNodes.length === 0) {
    return (
      <div className={CENTER_STATE}>
        <span className="font-serif text-sm text-ink-faint">暂无关系数据，请先创建角色、事件或国家，并添加关联关系</span>
        <button onClick={() => void refresh()} className="px-1.5 py-1 text-[13px] text-ink-muted transition-colors hover:text-ink">刷新</button>
      </div>
    )
  }

  const edgeSelection = edgePanel?.selection
  const edgeCanStyle =
    edgeSelection !== undefined &&
    edgeSelection.kind !== 'reference' &&
    ((edgeSelection.sourceType === edgeSelection.targetType &&
      (edgeSelection.sourceType === 'character' ||
        edgeSelection.sourceType === 'event' ||
        edgeSelection.sourceType === 'world')) ||
      (edgeSelection.sourceType === 'character' && edgeSelection.targetType === 'world') ||
      (edgeSelection.sourceType === 'world' && edgeSelection.targetType === 'character'))

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      data-graph-labels={zoom < LABEL_ZOOM ? 'off' : 'on'}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleImageSelected(event)}
      />

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          setNodeMenu({ at: { x: event.clientX, y: event.clientY }, nodeId: node.id })
        }}
        onNodeDragStart={(event, node) =>
          setDragGhost({ label: String(node.data?.label ?? ''), ...dragPoint(event) })
        }
        onNodeDrag={!isMobile ? handleNodeDrag : undefined}
        onNodeDragStop={handleNodeDragStop}
        onNodeMouseEnter={(_event, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onEdgeMouseEnter={(_event, edge) => setHoveredEdgeId(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdgeId(null)}
        onMove={handleMove}
        onConnect={handleConnect}
        // 移动端只读（docs/关系图.md）：禁拖、禁连、禁框选；点节点就是打开
        nodesDraggable={!isMobile}
        nodesConnectable={!isMobile}
        // 双击是「打开条目」，不能再让画布顺手放大一次
        zoomOnDoubleClick={false}
        elementsSelectable={!isMobile}
        // 框选 / 鼠标模式（设置 → 个性化）：左键平移时 Shift 框选；右键平移时左键直接框选
        panOnDrag={mouseMode === 'right-pan' ? [2] : true}
        selectionOnDrag={!isMobile && mouseMode === 'right-pan'}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={!isMobile && mouseMode === 'left-pan' ? 'Shift' : null}
        // 手摆精修：8px 网格吸附（docs/关系图.md §3）
        snapToGrid={!isMobile}
        snapGrid={SNAP_GRID}
        // 删除只能走 ⋯ / 右键菜单（软删除 + 二次确认），画布上的 Backspace 只删本地状态
        deleteKeyCode={null}
        onPaneClick={() => {
          setEdgePanel(null)
          setGuides(EMPTY_GUIDES)
        }}
        onEdgeClick={(event, edge) => openEdgePanel(edge, { x: event.clientX, y: event.clientY })}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        connectOnClick={false}
        // 松手判定半径给到「整颗节点都算落在手柄上」——否则拖到头像/名字中间会没反应
        connectionRadius={48}
        connectionLineStyle={{ stroke: 'var(--color-ink-muted)', strokeWidth: 1.5 }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        // 缩到 0.2 就打住：全景要能把整张图塞进来（低于 0.7 时名字整批淡出）
        fitViewOptions={{ padding: 0.2, minZoom: MIN_ZOOM }}
        minZoom={MIN_ZOOM}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <ZoomReader onInstance={handleInstance} />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-line)" />

        {/* 对齐参考线：只在拖动中出现，画在 flow 坐标系里（随缩放/平移一起走） */}
        <ViewportPortal>
          {guides.vertical ? (
            <div
              aria-hidden
              data-align-guide="vertical"
              className="pointer-events-none absolute"
              style={{
                left: guides.vertical.x,
                top: guides.vertical.y1,
                width: 1,
                height: guides.vertical.y2 - guides.vertical.y1,
                background: 'var(--color-ink-faint)',
              }}
            />
          ) : null}
          {guides.horizontal ? (
            <div
              aria-hidden
              data-align-guide="horizontal"
              className="pointer-events-none absolute"
              style={{
                left: guides.horizontal.x1,
                top: guides.horizontal.y,
                width: guides.horizontal.x2 - guides.horizontal.x1,
                height: 1,
                background: 'var(--color-ink-faint)',
              }}
            />
          ) : null}
        </ViewportPortal>

        <FitViewOnLoad
          key={`${focusNodeId ?? 'all'}:${filteredNodes.length}`}
          ready={filteredNodes.length > 0 && !loading}
        />

        {/* 小地图：小一号（160×110），默认开；视口框给可见的墨色边，不然只剩一块灰贴纸 */}
        {showMiniMap ? (
          <MiniMap
            nodeColor={(node) => {
              switch (node.data?.entityType as string | undefined) {
                case 'character':
                  return 'var(--color-line-hover)'
                case 'event':
                  return 'var(--color-line)'
                case 'country':
                  return 'var(--color-paper-card)'
                default:
                  return 'var(--color-ink-faint)'
              }
            }}
            maskColor="var(--oc-scrim)"
            pannable
            zoomable
            style={{ ...MINI_MAP_SIZE, marginBottom: 52, marginRight: 12 }}
            className="!border !border-line !rounded-item !bg-paper max-md:hidden"
          />
        ) : null}
      </ReactFlow>

      {filteredNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <span className="text-[13px] text-ink-faint">当前筛选下没有节点</span>
        </div>
      ) : null}

      {/* 四角：左上身份 + 定位 / 右上新建 + 更多 / 左下显示 / 右下视口 */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="absolute left-3 top-3 max-md:hidden">
          <RelationTopBar
            nodes={rawNodes}
            edgeCount={rawEdges.length}
            focusLabel={focusLabel}
            onExitFocus={() => setFocusNodeId(null)}
            onLocate={handleLocate}
          />
        </div>
        <div className="absolute right-3 top-3">
          <RelationToolsBar onCreate={() => setCreateOpen(true)} onMore={setMoreMenu} />
        </div>
        <div className="absolute bottom-3 left-3">
          <RelationControlBar
            counts={counts}
            visible={visibleTypes}
            onToggleType={(type) => setVisibleTypes((current) => ({ ...current, [type]: !current[type] }))}
            showIsolated={showIsolated}
            onToggleIsolated={() => setShowIsolated((value) => !value)}
            showEdgeLabels={showEdgeLabels}
            onToggleEdgeLabels={() => setShowEdgeLabels((value) => !value)}
            edgeStyle={edgeStyle}
            onEdgeStyleChange={handleEdgeStyleChange}
            showMiniMap={showMiniMap}
            onToggleMiniMap={() => setShowMiniMap((value) => !value)}
          />
        </div>
        <div className="absolute bottom-3 right-3">
          <RelationZoomBar
            zoom={zoom}
            onZoomChange={handleZoomPercent}
            onFit={() => rfRef.current?.fitView({ padding: 0.2, duration: 240, minZoom: MIN_ZOOM })}
          />
        </div>
      </div>

      {nodeMenu ? (
        <MediaContextMenu at={nodeMenu.at} items={nodeMenuItems} onClose={() => setNodeMenu(null)} />
      ) : null}
      {moreMenu ? (
        <MediaContextMenu at={moreMenu} items={moreItems} onClose={() => setMoreMenu(null)} />
      ) : null}

      {dragGhost
        ? createPortal(
            <div
              className="graph-drag-ghost pointer-events-none fixed z-[9999] max-w-[180px] truncate rounded-item border border-line-hover bg-paper/90 px-2 py-1 text-[12px] text-ink"
              style={{ left: dragGhost.x + 14, top: dragGhost.y + 12 }}
            >
              {dragGhost.label}
            </div>,
            document.body,
          )
        : null}

      {draft ? (
        <RelationCreateDialog
          // 每次拖出的线都是一个新弹窗：关系名输入框随之回到空值
          key={`${draft.source.entityType}-${draft.source.entityId}->${draft.target.entityType}-${draft.target.entityId}`}
          draft={draft}
          saving={savingRelation}
          onCancel={handleCancelRelation}
          onSubmit={handleSubmitRelation}
        />
      ) : null}

      {edgePanel ? (
        <EdgeStylePanel
          selection={edgePanel.selection}
          anchor={edgePanel.anchor}
          canStyle={edgeCanStyle}
          canRename={edgeCanStyle}
          onClose={() => setEdgePanel(null)}
          onChange={handleEdgePatch}
          onDelete={() => {
            const selection = edgePanel.selection
            setEdgePanel(null)
            setDeleteTarget({ kind: 'relation', selection })
          }}
        />
      ) : null}

      <RelationNodeCreateDialog
        open={createOpen}
        busy={creating}
        onCreate={(type, name) => void handleCreateNode(type, name)}
        onClose={() => setCreateOpen(false)}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.kind === 'relation' ? '删除关系' : '删除节点'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === 'relation'
                ? '这条关系会从两端的条目上一起移除。'
                : `「${deleteTarget?.kind === 'node' ? deleteTarget.label : ''}」会移入回收站，与它相连的线一起消失。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
              disabled={deleting}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
