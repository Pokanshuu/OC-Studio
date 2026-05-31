'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type OnMove,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Minus, Maximize } from 'lucide-react'

import { useGraphData } from '../hooks/useGraphData'
import { CharacterNode } from './CharacterNode'
import { EventNode } from './EventNode'
import { CountryNode } from './CountryNode'
import { RelationEdge } from './RelationEdge'
import { MobileRelationControls, DesktopRelationPanel } from './MobileRelationControls'

const NODE_POSITIONS_KEY = 'oc-relation-node-positions'

function loadNodePositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(NODE_POSITIONS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveNodePositions(positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(NODE_POSITIONS_KEY, JSON.stringify(positions))
  } catch { /* quota exceeded, ignore */ }
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
}

const edgeTypes = {
  relationEdge: RelationEdge,
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

function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  return (
    <Controls className="!border !border-line !rounded-md !bg-paper !shadow-none" position="bottom-right">
      <ControlButton onClick={() => zoomIn({ duration: 200 })}>
        <Plus size={14} strokeWidth={2} />
      </ControlButton>
      <ControlButton onClick={() => zoomOut({ duration: 200 })}>
        <Minus size={14} strokeWidth={2} />
      </ControlButton>
      <ControlButton onClick={() => fitView({ padding: 0.2, duration: 200 })}>
        <Maximize size={14} strokeWidth={2} />
      </ControlButton>
    </Controls>
  )
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
  const prevVisible = useRef(false)

  const [showCharacters, setShowCharacters] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showCountries, setShowCountries] = useState(true)
  const [zoom, setZoom] = useState(1)
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
      const savedKey = node.data?.entityType && node.data?.entityId
        ? `${node.data.entityType}-${node.data.entityId}`
        : node.id
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

  useEffect(() => {
    const timer = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const node of nodes) {
        const key = node.data?.entityType && node.data?.entityId
          ? `${node.data.entityType}-${node.data.entityId}`
          : String(node.id)
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

  if (rawNodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-ink-muted">暂无关系数据，请先创建角色、事件或国家，并添加关联关系</span>
        <button onClick={refresh} className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted hover:text-ink">刷新</button>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E7E3DC" />
        <ZoomControls />

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

        <FitViewOnLoad key={filteredNodes.length} ready={filteredNodes.length > 0 && !loading} />
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
      />
    </div>
  )
}
