'use client'

import { useQuery } from '@tanstack/react-query'
import * as timelineService from '../services'
import type { TimelineEvent } from '../types'
import type { TimelineFilter } from '../services'

export function useTimelineEvents(
  filter?: TimelineFilter,
): {
  events: TimelineEvent[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery<TimelineEvent[]>({
    queryKey: ['timeline-events', filter],
    queryFn: () => timelineService.getTimelineEvents(filter),
    staleTime: 0,
  })

  return {
    events: data,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => { void refetch() },
  }
}
