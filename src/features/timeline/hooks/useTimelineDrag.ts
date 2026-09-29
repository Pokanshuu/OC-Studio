'use client'

import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { updateEventTime } from '../services'
import type { TimelineEvent } from '../types'
import { addOneYear } from '@/features/events/utils'
import { shiftYear } from '../utils'

/**
 * 时间线拖拽落位：把横向位移换算成年份差，按「移动 / 左边缘 / 右边缘」写回事件时间。
 * 聚合模式下不可拖拽（由调用方通过 `canDrag` 控制）。
 */
export function useTimelineDrag(refresh: () => void) {
  return useCallback(
    async (e: DragEndEvent, pxPerYear: number) => {
      const { active, delta } = e
      const data = active.data.current as
        | { event: TimelineEvent; startX: number; type: 'move' | 'resize-left' | 'resize-right' }
        | undefined
      if (!data) return

      const deltaYears = Math.round(delta.x / pxPerYear)
      if (deltaYears === 0) return

      if (data.type === 'resize-left') {
        const newTime = shiftYear(data.event.time, deltaYears)
        try {
          await updateEventTime(data.event.id, newTime, data.event.endTime)
          refresh()
        } catch { /* ignore */ }
      } else if (data.type === 'resize-right') {
        const endTime = data.event.endTime || addOneYear(data.event.time)
        const newEndTime = shiftYear(endTime, deltaYears)
        try {
          await updateEventTime(data.event.id, data.event.time, newEndTime)
          refresh()
        } catch { /* ignore */ }
      } else {
        const newTime = shiftYear(data.event.time, deltaYears)
        const newEndTime = data.event.endTime
          ? shiftYear(data.event.endTime, deltaYears)
          : undefined
        try {
          await updateEventTime(data.event.id, newTime, newEndTime)
          refresh()
        } catch { /* ignore */ }
      }
    },
    [refresh],
  )
}
