'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Users, Calendar, Flag, Minus, Plus } from 'lucide-react'

import { useGraphData } from '../hooks/useGraphData'
import { CharacterNode } from './CharacterNode'
import { EventNode } from './EventNode'
import { CountryNode } from './CountryNode'
import { RelationEdge } from './RelationEdge'

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

  useEffect(() => {
    if (ready && !called.current) {
      setTimeout(() => fitView({ padding: 0.3 }), 100)
      called.current = true
    }
  }, [ready, fitView])

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
    return filteredNodes.map((node, index) => {
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

  if (nodes.length === 0) {
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E7E3DC" />
        <Controls className="!border !border-line !rounded-md !bg-paper !shadow-none" position="bottom-right" />

        <Panel position="top-left" className="flex items-center gap-4 bg-paper/90 backdrop-blur-sm border border-line rounded-md px-3 py-2 m-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCharacters(!showCharacters)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                showCharacters ? 'bg-paper-card border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <Users size={14} strokeWidth={2} />
              <span>角色</span>
            </button>
            <button
              onClick={() => setShowEvents(!showEvents)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                showEvents ? 'bg-paper-card border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <Calendar size={14} strokeWidth={2} />
              <span>事件</span>
            </button>
            <button
              onClick={() => setShowCountries(!showCountries)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                showCountries ? 'bg-paper-card border border-line-hover text-ink' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <Flag size={14} strokeWidth={2} />
              <span>国家</span>
            </button>
          </div>

          <ZoomSlider />
        </Panel>

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
    </div>
  )
}

function ZoomSlider() {
  const { zoomTo } = useReactFlow()
  const zoom = useStore((state) => state.transform[2])
  const zoomValue = Math.round(zoom * 100)

  const handleZoom = (value: number) => {
    const clamped = Math.max(10, Math.min(200, value))
    zoomTo(clamped / 100, { duration: 0 })
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleZoom(zoomValue - 10)}
        className="h-6 w-6 flex items-center justify-center rounded text-ink-faint hover:text-ink transition-colors"
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <input
        type="range"
        min={10}
        max={200}
        step={1}
        value={zoomValue}
        onChange={(e) => handleZoom(Number(e.target.value))}
        className="w-24 h-6 cursor-pointer appearance-none bg-transparent
          [&::-webkit-slider-runnable-track]:h-1
          [&::-webkit-slider-runnable-track]:rounded
          [&::-webkit-slider-runnable-track]:bg-line
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:-mt-1
          [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-ink-muted
          [&::-webkit-slider-thumb]:border
          [&::-webkit-slider-thumb]:border-line
          [&::-moz-range-track]:h-1
          [&::-moz-range-track]:rounded
          [&::-moz-range-track]:bg-line
          [&::-moz-range-thumb]:h-3.5
          [&::-moz-range-thumb]:w-3.5
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-ink-muted
          [&::-moz-range-thumb]:border-0"
      />
      <button
        onClick={() => handleZoom(zoomValue + 10)}
        className="h-6 w-6 flex items-center justify-center rounded text-ink-faint hover:text-ink transition-colors"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
