'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TrashItem } from '../types'
import * as trashService from '../services'

export function useTrash(): {
  items: TrashItem[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const data = await trashService.getDeletedItems()
        if (!cancelled) {
          setItems(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载回收站失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return { items, loading, error, refresh }
}
