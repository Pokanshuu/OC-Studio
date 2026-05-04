'use client'

import { useQuery } from '@tanstack/react-query'
import * as timelineService from '../services'
import type { TimelineEvent } from '../types'

export function useTimelineEvents(): {
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
    queryKey: ['timeline-events'],
    queryFn: timelineService.getTimelineEvents,
    staleTime: 0,
  })

  return {
    events: data,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => { void refetch() },
  }
}
