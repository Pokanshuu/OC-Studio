'use client'

import { X } from 'lucide-react'
import { useLongPress } from '@/lib/useLongPress'
import { useIsDarkTheme } from '@/lib/use-theme'
import { ROUND_ITEM } from '@/lib/ui-tokens'
import { isLightColor } from '../utils'

export function PeriodBar({
  period,
  left,
  width,
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
  hex: string
  hexDark: string
  row: number
  isMobile: boolean
  onEdit: () => void
  onDelete: () => void
  onLongPress?: () => void
}) {
  const isDark = useIsDarkTheme()
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  // 底色是用户选的固定色，不随主题翻转 —— 文字也必须用固定墨色/纸色，
  // 否则暗色主题下浅底会配上浅字（对比度接近 0）。
  const fill = isDark ? hexDark : hex
  const labelInk = isLightColor(fill) ? 'text-ink-fixed' : 'text-paper-fixed'

  return (
    <div
      className={`touch-feedback group absolute flex items-center ${ROUND_ITEM}`}
      style={{
        left,
        top: row * 28,
        width,
        height: 24,
        backgroundColor: fill,
      }}
      onClick={onEdit}
      title={period.name}
      {...longPress}
    >
      <span className={`sticky left-2 truncate pl-2 text-xs font-medium leading-4 ${labelInk} ${isMobile ? 'pr-2' : 'pr-5'}`}>
        {period.name}
      </span>
      {!isMobile ? (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          aria-label={`删除时期「${period.name}」`}
          className={`absolute right-0.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center opacity-0 transition-opacity hover:!opacity-100 focus-visible:opacity-100 group-hover:opacity-60 hover:bg-[var(--oc-hover)] ${ROUND_ITEM} ${labelInk}`}
        >
          <X size={10} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}
