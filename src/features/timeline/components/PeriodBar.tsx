'use client'

import { X } from 'lucide-react'
import { useLongPress } from '@/lib/useLongPress'

export function PeriodBar({
  period,
  left,
  width,
  isDark,
  hex,
  hexDark,
  row,
  isMobile,
  onEdit,
  onDelete,
  onLongPress,
}: {
  period: import('@/types').Period
  left: number
  width: number
  isDark: boolean
  hex: string
  hexDark: string
  row: number
  isMobile: boolean
  onEdit: () => void
  onDelete: () => void
  onLongPress?: () => void
}) {
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div
      className="touch-feedback absolute group flex items-center rounded"
      style={{
        left,
        top: row * 28,
        width,
        height: 24,
        backgroundColor: isDark ? hexDark : hex,
      }}
      onClick={onEdit}
      title={period.name}
      {...longPress}
    >
      <span className="truncate sticky left-2 px-2 text-xs text-ink font-medium leading-4">
        {period.name}
      </span>
      {!isMobile ? (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-none bg-paper-card border border-line text-ink-muted group-hover:flex hover:text-error"
        >
          <X size={10} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}



