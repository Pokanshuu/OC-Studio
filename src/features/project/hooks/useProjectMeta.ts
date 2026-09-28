'use client'

import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectMeta } from '@/types'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'
import * as projectService from '../services'
import type { ProjectMetaPatch } from '../services'

const META_KEY = ['project-meta']

export function useProjectMeta(): {
  meta: ProjectMeta
  loading: boolean
  save: (data: ProjectMetaPatch) => Promise<void>
} {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: META_KEY,
    queryFn: () => projectService.getProjectMeta(),
    staleTime: 30_000,
  })

  useEffect(() => {
    const handler = () => { void refetch() }
    window.addEventListener(DATA_UPDATED_EVENT, handler)
    return () => window.removeEventListener(DATA_UPDATED_EVENT, handler)
  }, [refetch])

  const mutation = useMutation({
    mutationFn: (payload: ProjectMetaPatch) => projectService.updateProjectMeta(payload),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: META_KEY }) },
  })

  const save = useCallback(
    async (payload: ProjectMetaPatch) => {
      await mutation.mutateAsync(payload)
    },
    [mutation],
  )

  return {
    meta: data ?? { id: 1, ...projectService.DEFAULT_PROJECT_META, updatedAt: 0 },
    loading: isLoading,
    save,
  }
}
