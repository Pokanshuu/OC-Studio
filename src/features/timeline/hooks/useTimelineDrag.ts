'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import type { DragEndEvent } from '@dnd-kit/core'
import { updateEventTime } from '../services'
import type { TimelineEvent } from '../types'
import { addOneYear } from '@/features/events/utils'
import { shiftYear } from '../utils'

/**
 * 时间线拖拽落位：把横向位移换算成年份差，按「移动 / 左边缘 / 右边缘」写回事件时间。
 * 聚合模式下不可拖拽（由调用方通过 `canDrag` 控制）。
 *
 * **写失败要说出来**：以前三个分支各自 `catch { /* ignore *\/ }`，落盘一失败
 * 就是「拖了、松手、条子弹回去，界面一声不吭」——用户只会以为拖拽坏了。
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

      try {
        if (data.type === 'resize-left') {
          await updateEventTime(data.event.id, shiftYear(data.event.time, deltaYears), data.event.endTime)
        } else if (data.type === 'resize-right') {
          const endTime = data.event.endTime || addOneYear(data.event.time)
          await updateEventTime(data.event.id, data.event.time, shiftYear(endTime, deltaYears))
        } else {
          const newTime = shiftYear(data.event.time, deltaYears)
          const newEndTime = data.event.endTime ? shiftYear(data.event.endTime, deltaYears) : undefined
          await updateEventTime(data.event.id, newTime, newEndTime)
        }
        refresh()
      } catch (error) {
        toast.error('调整时间失败', {
          description: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [refresh],
  )
}
