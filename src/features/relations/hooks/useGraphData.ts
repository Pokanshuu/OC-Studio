'use client'

import { useState, useEffect, useCallback } from 'react'
import { buildGraphData } from '../services'
import type { GraphNode, GraphEdge } from '../types'

export function useGraphData() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await buildGraphData()
      console.log('[useGraphData] refresh 完成', { nodes: data.nodes.length, edges: data.edges.length })
      setNodes(data.nodes)
      setEdges(data.edges)
    } catch (e) {
      console.error('[useGraphData] 聚合失败', e)
      setError('图谱数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await buildGraphData()
        console.log('[useGraphData] load 完成', { nodes: data.nodes.length, edges: data.edges.length })
        if (!cancelled) {
          setNodes(data.nodes)
          setEdges(data.edges)
        }
      } catch (e) {
        console.error('[useGraphData] 聚合失败', e)
        if (!cancelled) {
          setError('图谱数据加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return { nodes, edges, loading, error, refresh }
}
