'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import * as eventService from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'

const TIMELINE_KEY = ['timeline-events']

export function useEventList(): {
  events: Event[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [events, setEvents] = useState<Event[]>([])
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
        const data = await eventService.getEvents()
        if (!cancelled) {
          setEvents(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
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

  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener(DATA_UPDATED_EVENT, handler)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handler)
  }, [refresh])

  return { events, loading, error, refresh }
}

export function useEvent(id: number | null): {
  event: Event | undefined
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [event, setEvent] = useState<Event | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    if (id === null) return

    let cancelled = false

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const data = await eventService.getEvent(id as number)
        if (!cancelled) {
          setEvent(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
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
  }, [id, refreshKey])

  return {
    event: id === null ? undefined : event?.id === id ? event : undefined,
    loading: id === null ? false : loading,
    error: id === null ? null : error,
    refresh,
  }
}

export function useCreateEvent(): {
  createEvent: (data: EventFormData) => Promise<number>
  creating: boolean
} {
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()

  const create = useCallback(async (data: EventFormData): Promise<number> => {
    setCreating(true)
    try {
      const id = await eventService.createEvent(data)
      void queryClient.invalidateQueries({ queryKey: TIMELINE_KEY })
      void queryClient.invalidateQueries({ queryKey: ['event', id] })
      return id
    } finally {
      setCreating(false)
    }
  }, [queryClient])

  return { createEvent: create, creating }
}

export function useUpdateEvent(): {
  updateEvent: (id: number, data: Partial<EventFormData>) => Promise<void>
  updating: boolean
} {
  const [updating, setUpdating] = useState(false)
  const queryClient = useQueryClient()

  const update = useCallback(
    async (id: number, data: Partial<EventFormData>): Promise<void> => {
      setUpdating(true)
      try {
        await eventService.updateEvent(id, data)
        void queryClient.invalidateQueries({ queryKey: TIMELINE_KEY })
        void queryClient.invalidateQueries({ queryKey: ['event', id] })
      } finally {
        setUpdating(false)
      }
    },
    [queryClient],
  )

  return { updateEvent: update, updating }
}

export function useDeleteEvent(): {
  deleteEvent: (id: number) => Promise<void>
  deleting: boolean
} {
  const [deleting, setDeleting] = useState(false)
  const queryClient = useQueryClient()

  const remove = useCallback(async (id: number): Promise<void> => {
    setDeleting(true)
    try {
      await eventService.deleteEvent(id)
      void queryClient.invalidateQueries({ queryKey: TIMELINE_KEY })
    } finally {
      setDeleting(false)
    }
  }, [queryClient])

  return { deleteEvent: remove, deleting }
}
