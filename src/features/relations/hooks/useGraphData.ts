'use client'

import { useState, useEffect, useCallback } from 'react'
import { liveQuery } from 'dexie'
import { buildGraphData, syncRelationsFromEntities } from '../services'
import type { GraphNode, GraphEdge } from '../types'

/**
 * Dexie liveQuery 直接观察 characters / countries / events / relations。
 * buildGraphData 会先把实体数组投影归一到 relations，再从唯一真相源建图。
 */
export function useGraphData() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    // 写迁移必须在 liveQuery 外执行；liveQuery 只负责只读快照。
    void syncRelationsFromEntities().catch((cause) => {
      console.error('[useGraphData] 关系归一失败', cause)
    })

    const subscription = liveQuery(() => buildGraphData()).subscribe({
      next: (data) => {
        setNodes(data.nodes)
        setEdges(data.edges)
        setError(null)
        setLoading(false)
      },
      error: (cause) => {
        console.error('[useGraphData] 聚合失败', cause)
        setError(cause instanceof Error ? cause.message : '图谱数据加载失败')
        setLoading(false)
      },
    })

    let syncTimer: ReturnType<typeof setTimeout> | null = null
    const reloadFromDb = async (): Promise<void> => {
      try {
        // 面板保存后先归一再重建。除了 liveQuery，这里主动拉一次快照，
        // 避免某些 Dexie 批量更新/外部写入没有触发 observable 时图仍显示旧标签。
        await syncRelationsFromEntities()
        const data = await buildGraphData()
        setNodes(data.nodes)
        setEdges(data.edges)
        setError(null)
        setLoading(false)
      } catch (cause) {
        console.error('[useGraphData] 关系刷新失败', cause)
      }
    }
    const queueSync = (): void => {
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        void reloadFromDb()
      }, 180)
    }
    window.addEventListener('data-updated', queueSync)
    window.addEventListener('oc-relations-changed', queueSync)

    return () => {
      subscription.unsubscribe()
      if (syncTimer) clearTimeout(syncTimer)
      window.removeEventListener('data-updated', queueSync)
      window.removeEventListener('oc-relations-changed', queueSync)
    }
  }, [reloadKey])

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  return { nodes, edges, loading, error, refresh }
}
