'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { buildGraphData } from '../services'
import type { GraphNode, GraphEdge } from '../types'

export interface RefreshOptions {
  /**
   * 静默刷新：不动 `loading`，画布不卸载。
   * 拖拽连线新增关系后走这条 —— 否则整块图会闪一下「加载中」并丢掉视口与缩放。
   */
  silent?: boolean
}

export function useGraphData() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const refresh = useCallback(async (options?: RefreshOptions) => {
    if (!aliveRef.current) return
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await buildGraphData()
      if (!aliveRef.current) return
      setNodes(data.nodes)
      setEdges(data.edges)
    } catch (e) {
      console.error('[useGraphData] 聚合失败', e)
      if (aliveRef.current) setError('图谱数据加载失败')
    } finally {
      if (aliveRef.current && !options?.silent) setLoading(false)
    }
  }, [])

  // 首屏：`loading` 初值就是 true，这里只取数据 —— 所有 setState 都在 await 之后
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await buildGraphData()
        if (cancelled) return
        setNodes(data.nodes)
        setEdges(data.edges)
      } catch (e) {
        console.error('[useGraphData] 聚合失败', e)
        if (!cancelled) setError('图谱数据加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return { nodes, edges, loading, error, refresh }
}
