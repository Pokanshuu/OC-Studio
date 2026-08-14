'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Period } from '@/types'
import * as service from '../services'
import { DATA_UPDATED_EVENT, notifyDataUpdated } from '@/lib/data-events'

export function usePeriods() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await service.getAllPeriods()
      setPeriods(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载时期失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => { void load() }
    window.addEventListener(DATA_UPDATED_EVENT, handler)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handler)
  }, [load])

  const addPeriod = useCallback(async (data: { name: string; startTime: string; endTime: string; color: string }) => {
    await service.createPeriod(data)
    notifyDataUpdated()
  }, [])

  const updatePeriod = useCallback(async (id: number, data: Partial<{ name: string; startTime: string; endTime: string; color: string }>) => {
    await service.updatePeriod(id, data)
    notifyDataUpdated()
  }, [])

  const removePeriod = useCallback(async (id: number) => {
    await service.deletePeriod(id)
    notifyDataUpdated()
  }, [])

  return { periods, loading, error, refresh: load, addPeriod, updatePeriod, removePeriod }
}
