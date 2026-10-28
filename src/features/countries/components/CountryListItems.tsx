'use client'

import type { Country } from '@/types'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { useLongPress } from '@/lib/useLongPress'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { countryPreview } from './country-list-utils'
import { DRAG_SLOT_CARD, DRAG_SLOT_ROW, MEDIA_CARD, MEDIA_FALLBACK, MEDIA_GRADIENT, MEDIA_IMG, ROUND_ITEM, ROW_ACTIONS } from '@/lib/ui-tokens'
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

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })
  const { setNodeRef, style, attributes, listeners } = useSortableItem(country.id, !sortable)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(country.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(country.id)}
      onKeyDown={handleKeyDown}
      className={`group relative row-rule flex w-full cursor-pointer items-center gap-3 rounded-item py-3 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'}`}
      {...longPress}
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

/** 「画廊」视图的卡片 */
export function CountryCard({
  country,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
  sortable = false,
}: CountryItemProps) {
  const preview = countryPreview(country)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })
  const { setNodeRef, style, attributes, listeners } = useSortableItem(country.id, !sortable)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group touch-feedback"
      {...longPress}
    >
      {sortable ? (
        <div className={DRAG_SLOT_CARD}>
          <DragHandle tone="overlay" handleProps={{ attributes, listeners }} />
        </div>
      ) : null}
      <button
        onClick={() => onSelect(country.id)}
        className={`flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_ITEM}`}
      >
        <div className={MEDIA_CARD}>
          {country.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(country.headerUrl, 'header')}
                alt=""
                className={MEDIA_IMG}
              />
              <div className={MEDIA_GRADIENT} />
            </>
          ) : (
            <div className={MEDIA_FALLBACK}>
              {country.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="flex items-start gap-3 p-2.5">
          <Avatar src={country.flagUrl} size="md" type="flag" className="shrink-0" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <h3 className="text-sm font-medium text-ink truncate">{country.name}</h3>
            {preview ? (
              <p className="text-xs text-ink-muted truncate">{preview}</p>
            ) : null}
          </div>
        </div>
      </button>

      {!isMobile ? (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(country.id)} />
        </div>
      ) : null}
    </div>
  )
}
