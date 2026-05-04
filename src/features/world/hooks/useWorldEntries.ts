'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { WorldEntry } from '@/types'
import type { WorldFormData } from '../types'
import { registerEntityType } from '@/lib/reference-registry'
import * as service from '../services'

const LIST_KEY = ['worldEntries']
let worldRegistered = false

export function useEntryList() {
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await service.getEntries()
        if (!cancelled) {
          setEntries(data)
          if (!worldRegistered) {
            worldRegistered = true
            registerEntityType({
              type: 'world',
              label: '词条',
              fetch: async () => {
                const entries = await service.getEntries()
                return entries.map((e) => ({
                  type: 'world' as const,
                  id: String(e.id),
                  name: e.title,
                  keywords: [e.category].filter(Boolean) as string[],
                }))
              },
            })
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refreshKey])

  return { entries, loading, error, refresh }
}

export function useEntry(id: number | null) {
  const [entry, setEntry] = useState<WorldEntry | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (id === null) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await service.getEntry(id)
        if (!cancelled) {
          if (data) queryClient.setQueryData(['worldEntry', id], data)
          else queryClient.invalidateQueries({ queryKey: ['worldEntry', id] })
          setEntry(data)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [id, queryClient])

  return { entry, loading, error }
}

export function useCreateEntry() {
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()
  const create = useCallback(async (data: WorldFormData) => {
    setCreating(true)
    try {
      const id = await service.createEntry(data)
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      return id
    } finally { setCreating(false) }
  }, [queryClient])
  return { createEntry: create, creating }
}

export function useUpdateEntry() {
  const [updating, setUpdating] = useState(false)
  const queryClient = useQueryClient()
  const update = useCallback(async (id: number, data: Partial<WorldFormData>) => {
    setUpdating(true)
    try {
      await service.updateEntry(id, data)
      void queryClient.invalidateQueries({ queryKey: ['worldEntry', id] })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    } finally { setUpdating(false) }
  }, [queryClient])
  return { updateEntry: update, updating }
}

export function useDeleteEntry() {
  const [deleting, setDeleting] = useState(false)
  const queryClient = useQueryClient()
  const remove = useCallback(async (id: number) => {
    setDeleting(true)
    try {
      await service.deleteEntry(id)
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    } finally { setDeleting(false) }
  }, [queryClient])
  return { deleteEntry: remove, deleting }
}
