'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useCallback } from 'react'
import type { Character } from '@/types'
import type { CharacterFormData } from '../types'
import * as characterService from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'

const LIST_KEY = ['characters']

function makeCharacterKey(id: number) {
  return ['character', id]
}

export function useCharacterList(): {
  characters: Character[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => characterService.getCharacters(),
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
    characters: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  }
}

export function useCharacter(id: number | null): {
  character: Character | undefined
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: makeCharacterKey(id as number),
    queryFn: () => characterService.getCharacter(id as number),
    enabled: id !== null,
    // 详情始终取最新（编辑器显式保存后失效重取，跨模块写入也依赖挂载时重取）
    staleTime: 0,
  })

  const refresh = useCallback(() => {
    void refetch()
  }, [refetch])

  return {
    character: id === null ? undefined : data?.id === id ? data : undefined,
    loading: id === null ? false : isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  }
}

export function useCreateCharacter(): {
  createCharacter: (data: CharacterFormData) => Promise<number>
  creating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data: CharacterFormData) => characterService.createCharacter(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    createCharacter: async (data: CharacterFormData) => mutation.mutateAsync(data),
    creating: mutation.isPending,
  }
}

export function useUpdateCharacter(): {
  updateCharacter: (id: number, data: Partial<CharacterFormData>) => Promise<void>
  updating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CharacterFormData> }) =>
      characterService.updateCharacter(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: makeCharacterKey(variables.id) })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    updateCharacter: async (id: number, data: Partial<CharacterFormData>) =>
      mutation.mutateAsync({ id, data }),
    updating: mutation.isPending,
  }
}

export function useDeleteCharacter(): {
  deleteCharacter: (id: number) => Promise<void>
  deleting: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => characterService.deleteCharacter(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    deleteCharacter: async (id: number) => mutation.mutateAsync(id),
    deleting: mutation.isPending,
  }
}
