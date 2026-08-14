'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  const [characters, setCharacters] = useState<Character[]>([])
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
        const data = await characterService.getCharacters()
        if (!cancelled) {
          setCharacters(data)
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

  return { characters, loading, error, refresh }
}

export function useCharacter(id: number | null): {
  character: Character | undefined
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [character, setCharacter] = useState<Character | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const queryClient = useQueryClient()

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (id === null) return

    let cancelled = false
    const characterId = id

    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const data = await characterService.getCharacter(characterId)
        if (!cancelled) {
          if (data) {
            queryClient.setQueryData(makeCharacterKey(characterId), data)
          } else {
            queryClient.invalidateQueries({ queryKey: makeCharacterKey(characterId) })
          }
          setCharacter(data)
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
  }, [id, queryClient, refreshKey])

  return {
    character: id === null ? undefined : character?.id === id ? character : undefined,
    loading: id === null ? false : loading,
    error: id === null ? null : error,
    refresh,
  }
}

export function useCreateCharacter(): {
  createCharacter: (data: CharacterFormData) => Promise<number>
  creating: boolean
} {
  const [creating, setCreating] = useState(false)
  const queryClient = useQueryClient()

  const create = useCallback(async (data: CharacterFormData): Promise<number> => {
    setCreating(true)
    try {
      const id = await characterService.createCharacter(data)
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      return id
    } finally {
      setCreating(false)
    }
  }, [queryClient])

  return { createCharacter: create, creating }
}

export function useUpdateCharacter(): {
  updateCharacter: (id: number, data: Partial<CharacterFormData>) => Promise<void>
  updating: boolean
} {
  const [updating, setUpdating] = useState(false)
  const queryClient = useQueryClient()

  const update = useCallback(
    async (id: number, data: Partial<CharacterFormData>): Promise<void> => {
      setUpdating(true)
      try {
        await characterService.updateCharacter(id, data)
        queryClient.invalidateQueries({ queryKey: makeCharacterKey(id) })
        void queryClient.invalidateQueries({ queryKey: LIST_KEY })
      } finally {
        setUpdating(false)
      }
    },
    [queryClient],
  )

  return { updateCharacter: update, updating }
}

export function useDeleteCharacter(): {
  deleteCharacter: (id: number) => Promise<void>
  deleting: boolean
} {
  const [deleting, setDeleting] = useState(false)
  const queryClient = useQueryClient()

  const remove = useCallback(async (id: number): Promise<void> => {
    setDeleting(true)
    try {
      await characterService.deleteCharacter(id)
      queryClient.invalidateQueries({ queryKey: makeCharacterKey(id) })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    } finally {
      setDeleting(false)
    }
  }, [queryClient])

  return { deleteCharacter: remove, deleting }
}
