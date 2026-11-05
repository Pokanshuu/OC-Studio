'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
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

import type { RelationArrow } from '@/lib/relation-colors'
import type { EdgeStyle } from '@/lib/edge-style'
import { useSettings } from '@/lib/settings'
import { useDevice } from '@/lib/use-device'
import { useGraphData } from '../hooks/useGraphData'
import { updateEdgeStyle } from '../services'
import { EdgeStylePanel, type EdgeStyleSelection } from './EdgeStylePanel'
import { createRelationBetween, saveNodePosition } from '../services'
import { computeForceLayout } from '../layout'
import { nodeRect } from './floating-edge'
import { exportRelationGraphPng } from '../export-graph'
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
  onNavigateToWorld?: (id: number) => void
  visible?: boolean
}

/** 无序节点对：同一对节点在图里只有一条边（与 services.buildGraphData 的去重口径一致） */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('||')
}

const ALIGN_THRESHOLD = 8
const SNAP_GRID: [number, number] = [8, 8]
const EMPTY_GUIDES: AlignGuides = { vertical: null, horizontal: null }

interface AlignGuides {
  vertical: { x: number; y1: number; y2: number } | null
  horizontal: { y: number; x1: number; x2: number } | null
}

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

  const [showCharacters, setShowCharacters] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showCountries, setShowCountries] = useState(true)
  const [showWorlds, setShowWorlds] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  /** 停在某条边上时显示它的关系名（默认不显示，避免一屏全是标签） */
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RelationDraft | null>(null)
  const [savingRelation, setSavingRelation] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [savingLayout, setSavingLayout] = useState(false)
  const [edgePanel, setEdgePanel] = useState<{ selection: EdgeStyleSelection; anchor: { x: number; y: number } } | null>(null)
  const [guides, setGuides] = useState<AlignGuides>(EMPTY_GUIDES)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  // 面板已经自带外点/取消失败的收口；这里再兜一层 Esc，画布上按 Esc 等价于点空白
  useEffect(() => {
    if (!edgePanel) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEdgePanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edgePanel])

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
    // 离开关系图时把浮层收掉：面板 Portal 在 #overlay-root，不随画布卸载，
    // 否则切到别的分区还能看见一个「关系线样式」飘在那里
    if (!isVisible) {
      setEdgePanel(null)
      setDraft(null)
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
        case 'world':
          return showWorlds
        default:
          return true
      }
    })
  }, [rawNodes, showCharacters, showEvents, showCountries, showWorlds])

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

  /**
   * 打开某条边的样式面板（颜色 / 箭头）。点线与点线上的文字标签共用这一条路径，
   * 所以两者打开的永远是同一个面板、同一套数据。
   */
  const openEdgePanel = useCallback((edge: Edge, point: { x: number; y: number }) => {
    const [sourceType, sourceIdRaw] = edge.source.split('-')
    const [targetType, targetIdRaw] = edge.target.split('-')
    if (sourceType !== 'character' && sourceType !== 'event') return
    if (sourceType !== targetType) return
    const sourceId = Number(sourceIdRaw)
    const targetId = Number(targetIdRaw)
    if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) return
    const data = edge.data as { relation?: string; color?: string; arrow?: RelationArrow } | undefined
    setEdgePanel({
      selection: {
        sourceType,
        sourceId,
        targetType,
        targetId,
        relation: data?.relation ?? '',
        color: data?.color,
        arrow: data?.arrow,
      },
      anchor: point,
    })
  }, [])

  const displayEdges = useMemo(() => {
    return routedEdges.map((edge) => {
      const opacity = hoveredNodeId ? (connectedEdgeIds.has(edge.id) ? 1 : 0.1) : null
      // 关系名只在「悬停节点 / 悬停这条线 / 打开这条线的样式面板」时出现（`docs/关系图.md` §2）
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
        edge.id === hoveredEdgeId ||
        panelMatches ||
        (hoveredNodeId !== null && connectedEdgeIds.has(edge.id))
      return {
        ...edge,
        // 标签在 EdgeLabelRenderer 里渲染，拿不到画布的 onEdgeClick —— 把回调挂到边上
        data: {
          ...edge.data,
          showLabel,
          onLabelClick: (point: { x: number; y: number }) => openEdgePanel(edge, point),
        },
        ...(opacity === null
          ? {}
          : { style: { ...(edge.style as Record<string, unknown>), opacity } }),
      }
    })
  }, [routedEdges, hoveredNodeId, hoveredEdgeId, connectedEdgeIds, edgePanel, openEdgePanel])

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
        case 'world':
          onNavigateToWorld?.(entityId)
          break
      }
    },
    [onNavigateToCharacter, onNavigateToEvent, onNavigateToCountry, onNavigateToWorld],
  )

  /** 拖拽结束 → 坐标写回实体（仓库模式下会落成 frontmatter 的 `graph_position`） */
  const handleNodeDragStop = useCallback((_event: unknown, node: Node) => {
    setGuides(EMPTY_GUIDES)
    const entityType = node.data?.entityType as RelationNodeType | undefined
    const entityId = node.data?.entityId as number | undefined
    if (!entityType || entityId === undefined) return
    void saveNodePosition(entityType, entityId, node.position.x, node.position.y)
  }, [])

  /**
   * 拖动中找对齐参考线（docs/关系图.md §3）：中心线在 8px 内对齐就画一条，
   * 只做视觉提示，不强行吸过去 —— 吸附交给 `snapGrid` 的 8px 网格，二者互不抢手。
   */
  const handleNodeDrag = useCallback(
    (_event: unknown, node: Node) => {
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

  /**
   * 重新布局：无视已有坐标，整张图重跑力导向，并把新坐标写回实体。
   * 显式动作，所以覆盖用户之前的摆位是符合预期的；不写回的话下次打开又会弹回旧位置。
   * **整理前先记一次坐标快照**，整理后给一个「撤销」（会话内一次，见 docs/关系图.md §6.1）。
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

  /**
   * 保存布局：把当前所有节点坐标批量写回实体。
   * 拖动本身已经逐点保存，这个按钮是「我排完了，确认一下」的显式动作（并给一次可见的反馈）。
   */
  const handleSaveLayout = useCallback(async () => {
    if (savingLayout) return
    setSavingLayout(true)
    try {
      const writes: Promise<void>[] = []
      for (const node of nodes) {
        const entityType = node.data?.entityType as RelationNodeType | undefined
        const entityId = node.data?.entityId as number | undefined
        if (!entityType || entityId === undefined) continue
        writes.push(saveNodePosition(entityType, entityId, node.position.x, node.position.y))
      }
      await Promise.all(writes)
      toast.success('已保存')
    } catch (err) {
      toast.error('保存布局失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setSavingLayout(false)
    }
  }, [nodes, savingLayout])

  /** 导出 PNG：按当前坐标与当前边型离线重绘（桌面走系统保存对话框） */
  const handleExport = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const saved = await exportRelationGraphPng({ nodes, edges, edgeStyle })
      // 用户在保存对话框里按了取消 —— 不是失败，不提示
      if (saved) toast.success('已导出 PNG')
    } catch (err) {
      toast.error('导出失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setExporting(false)
    }
  }, [nodes, edges, edgeStyle, exporting])

  const handleEdgeStyleChange = useCallback(
    (value: EdgeStyle) => updateSetting('edgeStyle', value),
    [updateSetting],
  )

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
        onNodeDrag={!isMobile ? handleNodeDrag : undefined}
        onNodeDragStop={handleNodeDragStop}
        onNodeMouseEnter={(_event, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onEdgeMouseEnter={(_event, edge) => setHoveredEdgeId(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdgeId(null)}
        onMove={handleMove}
        onConnect={handleConnect}
        // 移动端只读（docs/关系图.md）：禁拖、禁连、禁框选；样式面板仍可点开查看
        nodesDraggable={!isMobile}
        nodesConnectable={!isMobile}
        elementsSelectable={!isMobile}
        // 框选 / 鼠标模式（设置 → 个性化）：左键平移时 Shift 框选；右键平移时左键直接框选
        panOnDrag={mouseMode === 'right-pan' ? [2] : true}
        selectionOnDrag={!isMobile && mouseMode === 'right-pan'}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={!isMobile && mouseMode === 'left-pan' ? 'Shift' : null}
        // 手摆精修：8px 网格吸附（docs/关系图.md §3）
        snapToGrid={!isMobile}
        snapGrid={SNAP_GRID}
        // 删除只能走编辑器（软删除 + 二次确认），画布上的 Backspace 只删本地状态、刷新就回来
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
        // 缩到 0.6 就打住：再小人脸和名字就看不清了（宁可少看一点，也不要糊成一片）
        fitViewOptions={{ padding: 0.2, minZoom: MIN_ZOOM }}
        minZoom={MIN_ZOOM}
        maxZoom={2}
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

        <DesktopRelationPanel
          showCharacters={showCharacters}
          showEvents={showEvents}
          showCountries={showCountries}
          showWorlds={showWorlds}
          onToggleCharacters={() => setShowCharacters(!showCharacters)}
          onToggleEvents={() => setShowEvents(!showEvents)}
          onToggleCountries={() => setShowCountries(!showCountries)}
          onToggleWorlds={() => setShowWorlds(!showWorlds)}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          onRelayout={handleRelayout}
          edgeStyle={edgeStyle}
          onEdgeStyleChange={handleEdgeStyleChange}
          onExport={() => void handleExport()}
          exporting={exporting}
          onSaveLayout={() => void handleSaveLayout()}
          savingLayout={savingLayout}
        />

        <Panel position="bottom-left" className="max-md:hidden m-3 flex flex-col gap-1 border border-line bg-paper/85 px-3 py-2 text-[11px] text-ink-muted backdrop-blur-lg float-shadow">
          <span className="text-ink-faint">图例</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-line-hover bg-paper-card" />角色</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 border border-line bg-paper-card" />事件</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 border border-line bg-paper-card" />国家</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 border border-line bg-paper-card" />分类</span>
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
        showWorlds={showWorlds}
        onToggleCharacters={() => setShowCharacters(!showCharacters)}
        onToggleEvents={() => setShowEvents(!showEvents)}
        onToggleCountries={() => setShowCountries(!showCountries)}
        onToggleWorlds={() => setShowWorlds(!showWorlds)}
        zoom={zoom}
        onZoomChange={handleZoomChange}
        onRelayout={handleRelayout}
        edgeStyle={edgeStyle}
        onEdgeStyleChange={handleEdgeStyleChange}
        onExport={() => void handleExport()}
        exporting={exporting}
        onSaveLayout={() => void handleSaveLayout()}
        savingLayout={savingLayout}
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
      {edgePanel ? (
        <EdgeStylePanel
          selection={edgePanel.selection}
          anchor={edgePanel.anchor}
          onClose={() => setEdgePanel(null)}
          onChange={(patch) => {
            const { selection } = edgePanel
            // 乐观更新面板自己的选中态：改颜色、再接箭头是一次动作里的两下，
            // 面板不能在第一下就关掉（关掉就逼用户重新点那条细线）
            setEdgePanel((current) =>
              current
                ? {
                    ...current,
                    selection: {
                      ...current.selection,
                      color: patch.color === null ? undefined : (patch.color ?? current.selection.color),
                      arrow:
                        patch.arrow === null
                          ? undefined
                          : (patch.arrow ?? current.selection.arrow),
                    },
                  }
                : current,
            )
            void updateEdgeStyle(
              { entityType: selection.sourceType, entityId: selection.sourceId },
              { entityType: selection.targetType, entityId: selection.targetId },
              patch,
            ).then((ok) => {
              if (!ok) toast.error('这条关系已不在数据里')
              void refresh({ silent: true })
            })
          }}
        />
      ) : null}
    </div>
  )
}
