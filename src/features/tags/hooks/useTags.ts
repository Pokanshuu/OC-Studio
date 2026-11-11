'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Tag } from '@/types'
import * as tagService from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'

export function useTags(): {
  tags: Tag[]
  loading: boolean
  error: string | null
  refresh: () => void
  optimisticAdd: (tag: Tag) => void
} {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const optimisticAdd = useCallback((tag: Tag) => {
    setTags((prev) => {
      if (prev.some((t) => t.id === tag.id)) return prev
      return [tag, ...prev]
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await tagService.getAllTags()
        if (!cancelled) setTags(data)
      } catch {
        if (!cancelled) setError('加载标签失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [refreshKey])

  /**
   * 别处改了标签（设置里改名 / 合并、导入、助手写入）之后，这里也要重新读 ——
   * 标签列表是「打标签」下拉的数据源，不刷新就会一直显示旧名字、旧颜色。
   * 与角色 / 事件 / 国家 / 时期 / 时间线那几个列表同一套约定（`data-updated`）。
   */
  useEffect(() => {
    const handler = () => setRefreshKey((key) => key + 1)
    window.addEventListener(DATA_UPDATED_EVENT, handler)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handler)
  }, [])

  return { tags, loading, error, refresh, optimisticAdd }
}

export function useTagMutations(): {
  createTag: (data: { name: string; category: string; color: string }) => Promise<number>
  updateTag: (id: number, data: Partial<{ name: string; category: string; color: string }>) => Promise<void>
  deleteTag: (id: number) => Promise<void>
} {
  const queryClient = useQueryClient()

  const createTag = useCallback(async (data: { name: string; category: string; color: string }) => {
    const id = await tagService.createTag(data)
    queryClient.invalidateQueries({ queryKey: ['tags'] })
    return id
  }, [queryClient])

  const updateTag = useCallback(async (id: number, data: Partial<{ name: string; category: string; color: string }>) => {
    await tagService.updateTag(id, data)
    queryClient.invalidateQueries({ queryKey: ['tags'] })
  }, [queryClient])

  const deleteTag = useCallback(async (id: number) => {
    await tagService.deleteTag(id)
    queryClient.invalidateQueries({ queryKey: ['tags'] })
  }, [queryClient])

  return { createTag, updateTag, deleteTag }
}
