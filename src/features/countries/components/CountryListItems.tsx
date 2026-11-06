'use client'

import type { Country } from '@/types'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { CoverCard } from '@/components/shared/cover/CoverCard'
import { useLongPress } from '@/lib/useLongPress'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { coverExcerpt } from '@/lib/cover'
import { countryPreview } from './country-list-utils'
import { DRAG_SLOT_ROW, ROW_ACTIONS } from '@/lib/ui-tokens'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'

interface CountryItemProps {
  country: Country
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  isMobile: boolean
  /** 手动排序模式下才挂拖拽手柄 */
  sortable?: boolean
}

/** 「目录」视图的行 */
export function CountryRow({
  country,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
  sortable = false,
}: CountryItemProps) {
  const preview = countryPreview(country)

  const { setNodeRef, style, attributes, listeners, longPress: longPressSort, cardAttributes, cardListeners } =
    useSortableItem(country.id, !sortable)
  // 长按拖动和「长按动作表」抢同一个手势：排序模式下让拖动赢
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile && !longPressSort,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(country.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={longPressSort ? { ...style, touchAction: 'none' } : style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(country.id)}
      onKeyDown={handleKeyDown}
      className={`group relative row-rule flex w-full cursor-pointer items-center gap-3 rounded-item py-3 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'}`}
      {...longPress}
      {...cardAttributes}
      {...cardListeners}
    >
      {sortable ? (
        <div className={DRAG_SLOT_ROW}>
          <DragHandle handleProps={{ attributes, listeners }} />
        </div>
      ) : null}
      <Avatar src={getImageUrl(country.flagUrl, 'flag')} size="md" type="flag" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-sm font-medium text-ink">{country.name}</h3>
        {preview ? (
          <span className="text-xs text-ink-muted truncate">{preview}</span>
        ) : null}
      </div>
      {!isMobile ? (
        <div className={ROW_ACTIONS}>
          <DeleteButton onDelete={() => onDelete(country.id)} />
        </div>
      ) : null}
    </div>
  )
}

/** 「画廊」视图的卡片：一张封面（照片 → 渐进模糊 → 色块，国名落在色块里） */
export function CountryCard({
  country,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
  sortable = false,
}: CountryItemProps) {
  return (
    <CoverCard
      id={country.id}
      title={country.name}
      intro={coverExcerpt(countryPreview(country), 84)}
      imageSrc={country.headerUrl ? resolveImageUrl(country.headerUrl, 'header') : undefined}
      tintSrc={country.flagUrl ? resolveImageUrl(country.flagUrl, 'flag') : undefined}
      emblem={country.flagUrl ? <Avatar src={country.flagUrl} fill type="flag" /> : undefined}
      onSelect={() => onSelect(country.id)}
      onLongPress={onLongPress}
      isMobile={isMobile}
      sortable={sortable}
      actions={!isMobile ? <DeleteButton tone="overlay" onDelete={() => onDelete(country.id)} /> : undefined}
    />
  )
}
