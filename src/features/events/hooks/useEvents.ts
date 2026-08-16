'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import type { Event } from '@/types'
import type { EventFormData } from '../types'
import * as eventService from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'

const LIST_KEY = ['events']
const TIMELINE_KEY = ['timeline-events']

function makeEventKey(id: number) {
  return ['event', id]
}

export function useEventList(): {
  events: Event[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => eventService.getEvents(),
    staleTime: 30_000,
  })

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    const handler = () => {
      void refetch()
    }
    window.addEventListener(DATA_UPDATED_EVENT, handler)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handler)
  }, [refetch])

  return {
    events: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  }
}

export function useEvent(id: number | null): {
  event: Event | undefined
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: makeEventKey(id as number),
    queryFn: () => eventService.getEvent(id as number),
    enabled: id !== null,
    // 详情始终取最新：时间线拖拽等跨模块写入后，重新挂载编辑器时必须读到新值
    staleTime: 0,
  })

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  return {
    event: id === null ? undefined : data?.id === id ? data : undefined,
    loading: id === null ? false : isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  }
}

export function useCreateEvent(): {
  createEvent: (data: EventFormData) => Promise<number>
  creating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data: EventFormData) => eventService.createEvent(data),
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      void queryClient.invalidateQueries({ queryKey: TIMELINE_KEY })
      void queryClient.invalidateQueries({ queryKey: makeEventKey(id) })
    },
  })

  return {
    createEvent: async (data: EventFormData) => mutation.mutateAsync(data),
    creating: mutation.isPending,
  }
}

export function useUpdateEvent(): {
  updateEvent: (id: number, data: Partial<EventFormData>) => Promise<void>
  updating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EventFormData> }) =>
      eventService.updateEvent(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      void queryClient.invalidateQueries({ queryKey: TIMELINE_KEY })
      void queryClient.invalidateQueries({ queryKey: makeEventKey(variables.id) })
    },
  })

  return {
    updateEvent: async (id: number, data: Partial<EventFormData>) =>
      mutation.mutateAsync({ id, data }),
    updating: mutation.isPending,
  }
}

export function useDeleteEvent(): {
  deleteEvent: (id: number) => Promise<void>
  deleting: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => eventService.deleteEvent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      void queryClient.invalidateQueries({ queryKey: TIMELINE_KEY })
    },
  })

  return {
    deleteEvent: async (id: number) => mutation.mutateAsync(id),
    deleting: mutation.isPending,
  }
}
