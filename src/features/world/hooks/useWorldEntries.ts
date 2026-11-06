'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import type { WorldEntry } from '@/types'
import { isCodexEntry } from '@/lib/entry-kinds'
import type { WorldFormData } from '../types'
import * as service from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'

const LIST_KEY = ['worldEntries']

function makeEntryKey(id: number | null) {
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

/**
 * 全部笔记（**不**按分类过滤）：给角色「相关笔记」提供候选与当前标题。
 * 与 `useEntryList` 分开：那个列表是世界观目录，会把已启用分类的条目摘掉。
 */
export function useAllEntryList(): {
  entries: WorldEntry[]
  loading: boolean
} {
  const { data, isLoading } = useQuery({
    queryKey: [...LIST_KEY, 'all'],
    queryFn: () => service.getAllEntries(),
    staleTime: 30_000,
  })
  return { entries: data ?? [], loading: isLoading }
}

/** 只看设定类笔记（角色相关笔记的候选）：小说 / 地图不进关系块 */
export function useCodexEntryList(): {
  entries: WorldEntry[]
  loading: boolean
} {
  const all = useAllEntryList()
  return { entries: all.entries.filter(isCodexEntry), loading: all.loading }
}

export function useEntry(id: number | null): {
  entry: WorldEntry | undefined
  loading: boolean
  error: string | null
} {
  const { data, isLoading, error } = useQuery({
    queryKey: makeEntryKey(id),
    queryFn: async () => (id === null ? undefined : service.getEntry(id)),
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
