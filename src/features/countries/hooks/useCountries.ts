'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Country } from '@/types'
import type { CountryFormData } from '../types'
import * as countryService from '../services'

const LIST_KEY = ['countries']

function makeCountryKey(id: number) {
  return ['country', id]
}

export function useCountryList(): {
  countries: Country[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => countryService.getCountries(),
    staleTime: 30_000,
  })

  return {
    countries: data ?? [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => {
      void refetch()
    },
  }
}

export function useCountry(id: number | null): {
  country: Country | undefined
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: makeCountryKey(id as number),
    queryFn: () => countryService.getCountry(id as number),
    enabled: id !== null,
    staleTime: 30_000,
  })

  return {
    country: id === null ? undefined : data?.id === id ? data : undefined,
    loading: id === null ? false : isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => {
      void refetch()
    },
  }
}

export function useCreateCountry(): {
  createCountry: (data: CountryFormData) => Promise<number>
  creating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (data: CountryFormData) => countryService.createCountry(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    createCountry: async (data: CountryFormData) => mutation.mutateAsync(data),
    creating: mutation.isPending,
  }
}

export function useUpdateCountry(): {
  updateCountry: (id: number, data: Partial<CountryFormData>) => Promise<void>
  updating: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CountryFormData> }) =>
      countryService.updateCountry(id, data),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: makeCountryKey(variables.id) })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    updateCountry: async (id: number, data: Partial<CountryFormData>) =>
      mutation.mutateAsync({ id, data }),
    updating: mutation.isPending,
  }
}

export function useDeleteCountry(): {
  deleteCountry: (id: number) => Promise<void>
  deleting: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (id: number) => countryService.deleteCountry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  return {
    deleteCountry: async (id: number) => mutation.mutateAsync(id),
    deleting: mutation.isPending,
  }
}
