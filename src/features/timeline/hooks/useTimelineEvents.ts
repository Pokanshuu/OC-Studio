'use client'

import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as timelineService from '../services'
import type { TimelineEvent } from '../types'
import type { TimelineFilter } from '../services'
import { DATA_UPDATED_EVENT } from '@/lib/data-events'
import { useFieldConfig } from '@/lib/fields'

/**
 * 时间线的事件列表。
 *
 * **必须订阅 `data-updated`**：事件 / 角色（出生节点）/ 时期在别的页面被改过之后，
 * 时间线只要还挂在树上就不会重新取数 —— 表现是「刚建的事件，切到时间线看不到」，
 * 只有重启或重新挂载才出现。其它列表 hook（角色 / 事件 / 国家 / 时期 / 词条）都订阅了。
 */
export function useTimelineEvents(
  filter?: TimelineFilter,
): {
  events: TimelineEvent[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const countryTimeKey = useFieldConfig()
    .country.filter((field) => field.type === 'time')
    .map((field) => `${field.id}:${field.key ?? ''}:${field.label}`)
    .join('|')

  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery<TimelineEvent[]>({
    queryKey: ['timeline-events', filter, countryTimeKey],
    queryFn: () => timelineService.getTimelineEvents(filter),
    staleTime: 0,
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
    events: data,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refresh,
  }
}
