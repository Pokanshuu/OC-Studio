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
  type Node,
  type Edge,
  type ReactFlowInstance,
  type OnMove,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useGraphData } from '../hooks/useGraphData'
import { MobileRelationControls, DesktopRelationPanel } from './MobileRelationControls'
import { FitViewOnLoad, ZoomReader } from './RelationGraphHelpers'
import { loadNodePositions, saveNodePositions, nodePositionKey, nodeTypes, edgeTypes } from './relation-graph-utils'

interface RelationGraphProps {
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  visible?: boolean
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
    const savedPositions = loadNodePositions()
    return filteredNodes.map((node, index) => {
      // use saved position if available
      const savedKey = nodePositionKey(node)
      if (savedPositions[savedKey]) {
        return { ...node, position: savedPositions[savedKey] }
      }
      if (node.position.x !== 0 || node.position.y !== 0) return node
      const angle = (index / filteredNodes.length) * 2 * Math.PI
      const radius = Math.max(400, filteredNodes.length * 24)
      return {
        ...node,
        position: {
          x: 500 + radius * Math.cos(angle),
          y: 350 + radius * Math.sin(angle),
        },
      }
    })
  }, [filteredNodes])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes(layoutedNodes)
  }, [layoutedNodes, setNodes])

  useEffect(() => {
    setEdges(rawEdges)
  }, [rawEdges, setEdges])

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
    if (!hoveredNodeId) return edges
    return edges.map((e) => ({
      ...e,
      style: { ...(e.style as Record<string, unknown>), opacity: connectedEdgeIds.has(e.id) ? 1 : 0.1 },
    }))
  }, [edges, hoveredNodeId, connectedEdgeIds])

  useEffect(() => {
    const timer = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) {
        const key = nodePositionKey(node)
        positions[key] = { x: node.position.x, y: node.position.y }
      }
      if (Object.keys(positions).length > 0) {
        saveNodePositions(positions)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [nodes])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
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
        <span className="text-[13px] text-ink-faint">加载图谱数据…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-[13px] text-error">{error}</span>
        <button onClick={refresh} className="px-1.5 py-1 text-[13px] text-ink-muted transition-colors hover:text-ink">重试</button>
      </div>
    )
  }

  if (rawNodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="font-serif text-sm text-ink-faint">暂无关系数据，请先创建角色、事件或国家，并添加关联关系</span>
        <button onClick={refresh} className="px-1.5 py-1 text-[13px] text-ink-muted transition-colors hover:text-ink">刷新</button>
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
        onNodeMouseEnter={(_event, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onMove={handleMove}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
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
        />

        <Panel position="bottom-left" className="max-md:hidden m-3 flex flex-col gap-1 border border-line bg-paper/85 px-3 py-2 text-[11px] text-ink-muted backdrop-blur-lg">
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
      />
    </div>
  )
}


