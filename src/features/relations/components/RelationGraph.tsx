'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
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

import { useGraphData } from '../hooks/useGraphData'
import { createRelationBetween, saveNodePosition } from '../services'
import { computeForceLayout } from '../layout'
import { MobileRelationControls, DesktopRelationPanel } from './MobileRelationControls'
import { FitViewOnLoad, ZoomReader } from './RelationGraphHelpers'
import { RelationCreateDialog } from './RelationCreateDialog'
import {
  MIN_ZOOM,
  nodeTypes,
  edgeTypes,
  relationPlan,
  routeEdges,
  type RelationDraft,
} from './relation-graph-utils'
import type { RelationNodeType } from '../types'
import { CENTER_STATE } from '@/lib/ui-tokens'

interface RelationGraphProps {
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  visible?: boolean
}

/** 无序节点对：同一对节点在图里只有一条边（与 services.buildGraphData 的去重口径一致） */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('||')
}

export function RelationGraph({
  onNavigateToCharacter,
  onNavigateToEvent,
  onNavigateToCountry,
  visible,
}: RelationGraphProps) {
  const { nodes: rawNodes, edges: rawEdges, loading, error, refresh } = useGraphData()
  const prevVisible = useRef(false)

  const [showCharacters, setShowCharacters] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showCountries, setShowCountries] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RelationDraft | null>(null)
  const [savingRelation, setSavingRelation] = useState(false)
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
      void refresh()
    }
    prevVisible.current = isVisible
  }, [visible, refresh])

  const filteredNodes = useMemo(() => {
    return rawNodes.filter((node) => {
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
  }, [rawNodes, showCharacters, showEvents, showCountries])

  const layoutedNodes = useMemo(() => {
    // 只有**实体里存过坐标**的节点才钉住（用户拖过才有）。缓存不作数 ——
    // 旧版把径向布局的坐标写进 localStorage，结果整张图被钉死、力导向永远不跑。
    const pinned = new Map<string, { x: number; y: number }>()
    for (const node of filteredNodes) {
      if (node.position.x !== 0 || node.position.y !== 0) pinned.set(node.id, node.position)
    }
    if (pinned.size === filteredNodes.length) {
      return filteredNodes.map((node) => ({ ...node, position: pinned.get(node.id) ?? node.position }))
    }
    const layout = computeForceLayout(filteredNodes, rawEdges, { pinned })
    return filteredNodes.map((node) => ({ ...node, position: layout.get(node.id) ?? node.position }))
  }, [filteredNodes, rawEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes(layoutedNodes)
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(rawEdges)
  }, [rawEdges, setEdges])

  /** 每条边按两端节点的相对方位选手柄（否则所有线都从同一个点挤出来） */
  const routedEdges = useMemo(() => routeEdges(nodes, edges), [nodes, edges])

  // 悬停聚焦：高亮该节点及其邻居，其余淡化
  const { neighborNodeIds, connectedEdgeIds } = useMemo(() => {
    const nIds = new Set<string>()
    const eIds = new Set<string>()
    if (hoveredNodeId) {
      for (const e of rawEdges) {
        if (e.source === hoveredNodeId || e.target === hoveredNodeId) {
          nIds.add(e.source)
          nIds.add(e.target)
          eIds.add(e.id)
        }
      }
    }
    return { neighborNodeIds: nIds, connectedEdgeIds: eIds }
  }, [hoveredNodeId, rawEdges])

  const displayNodes = useMemo(() => {
    if (!hoveredNodeId) return nodes
    return nodes.map((n) => ({
      ...n,
      style: {
        ...(n.style as Record<string, unknown>),
        opacity: n.id === hoveredNodeId || neighborNodeIds.has(n.id) ? 1 : 0.2,
      },
    }))
  }, [nodes, hoveredNodeId, neighborNodeIds])

  const displayEdges = useMemo(() => {
    if (!hoveredNodeId) return routedEdges
    return routedEdges.map((e) => ({
      ...e,
      style: { ...(e.style as Record<string, unknown>), opacity: connectedEdgeIds.has(e.id) ? 1 : 0.1 },
    }))
  }, [routedEdges, hoveredNodeId, connectedEdgeIds])

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // 点在连线手柄上不算「打开条目」：手柄只用来拖关系
      const target = event.target as Element | null
      if (target?.closest('.react-flow__handle')) return
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

  /** 拖拽结束 → 坐标写回实体（仓库模式下会落成 frontmatter 的 `graph_position`） */
  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: Node) => {
    const entityType = node.data?.entityType as RelationNodeType | undefined
    const entityId = node.data?.entityId as number | undefined
    if (!entityType || entityId === undefined) return
    void saveNodePosition(entityType, entityId, node.position.x, node.position.y)
  }, [])

  /**
   * 重新布局：无视已有坐标，整张图重跑力导向，并把新坐标写回实体。
   * 显式动作，所以覆盖用户之前的摆位是符合预期的；不写回的话下次打开又会弹回旧位置。
   */
  const handleRelayout = useCallback(() => {
    if (filteredNodes.length === 0) return
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
  }, [filteredNodes, rawEdges, setNodes])

  /* ── 拖拽连线 ─────────────────────────────────────────── */
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

  /** 连线是否成立：不同节点、这一对还没有完整的关系、且这类组合有对应字段可写 */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target } = connection
      if (!source || !target || source === target) return false
      if (existingPairs.get(pairKey(source, target)) === false) return false
      const sourceType = nodeTypeOf(source)
      const targetType = nodeTypeOf(target)
      if (!sourceType || !targetType) return false
      return relationPlan(sourceType, targetType).supported
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

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onNodeMouseEnter={(_event, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onMove={handleMove}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        connectOnClick={false}
        // 松手判定半径给到「整颗节点都算落在手柄上」——否则拖到头像/名字中间会没反应
        connectionRadius={48}
        connectionLineStyle={{ stroke: 'var(--color-ink-muted)', strokeWidth: 1.5 }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        // 缩到 0.6 就打住：再小人脸和名字就看不清了（宁可少看一点，也不要糊成一片）
        fitViewOptions={{ padding: 0.2, minZoom: MIN_ZOOM }}
        minZoom={MIN_ZOOM}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <ZoomReader onInstance={handleInstance} />
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-line)" />

        <DesktopRelationPanel
          showCharacters={showCharacters}
          showEvents={showEvents}
          showCountries={showCountries}
          onToggleCharacters={() => setShowCharacters(!showCharacters)}
          onToggleEvents={() => setShowEvents(!showEvents)}
          onToggleCountries={() => setShowCountries(!showCountries)}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          onRelayout={handleRelayout}
        />

        <Panel position="bottom-left" className="max-md:hidden m-3 flex flex-col gap-1 border border-line bg-paper/85 px-3 py-2 text-[11px] text-ink-muted backdrop-blur-lg float-shadow">
          <span className="text-ink-faint">图例</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-line-hover bg-paper-card" />角色</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 border border-line bg-paper-card" />事件</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 border border-line bg-paper-card" />国家</span>
        </Panel>

        <FitViewOnLoad key={filteredNodes.length} ready={filteredNodes.length > 0 && !loading} />
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
          maskColor="rgba(0,0,0,0.03)"
          className="!border !border-line !rounded-item !bg-paper"
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
        onRelayout={handleRelayout}
      />

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
    </div>
  )
}
