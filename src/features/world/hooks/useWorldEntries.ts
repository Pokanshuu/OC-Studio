'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import type { WorldEntry } from '@/types'
import type { WorldFormData } from '../types'
import * as service from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'

const LIST_KEY = ['worldEntries']

function makeEntryKey(id: number) {
  return ['worldEntry', id]
}

export function useEntryList(): {
  entries: WorldEntry[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => service.getEntries(),
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
    entries: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  }
}

export function useEntry(id: number | null): {
  entry: WorldEntry | undefined
  loading: boolean
  error: string | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: makeEntryKey(id as number),
    queryFn: () => service.getEntry(id as number),
    enabled: id !== null,
    // 详情始终取最新：WorldLayout 自动保存（saveEntryContent）直连 service、不走 mutation，
    // 缓存过久会导致切换词条后读到旧内容
    staleTime: 0,
  })

  return {
    entry: id === null ? undefined : data?.id === id ? data : undefined,
    loading: id === null ? false : isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

export function useCreateEntry(): {
  createEntry: (data: WorldFormData) => Promise<number>
  creating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data: WorldFormData) => service.createEntry(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    createEntry: async (data: WorldFormData) => mutation.mutateAsync(data),
    creating: mutation.isPending,
  }
}

export function useUpdateEntry(): {
  updateEntry: (id: number, data: Partial<WorldFormData>) => Promise<void>
  updating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WorldFormData> }) =>
      service.updateEntry(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: makeEntryKey(variables.id) })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    updateEntry: async (id: number, data: Partial<WorldFormData>) =>
      mutation.mutateAsync({ id, data }),
    updating: mutation.isPending,
  }
}

export function useDeleteEntry(): {
  deleteEntry: (id: number) => Promise<void>
  deleting: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => service.deleteEntry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    deleteEntry: async (id: number) => mutation.mutateAsync(id),
    deleting: mutation.isPending,
  }
}
