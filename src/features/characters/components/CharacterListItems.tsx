'use client'

import { Circle } from 'lucide-react'
import type { Character } from '@/types'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { useLongPress } from '@/lib/useLongPress'
import { aliasesText } from './character-list-utils'
import { DRAG_SLOT_CARD, DRAG_SLOT_ROW, MEDIA_CARD, MEDIA_FALLBACK, MEDIA_GRADIENT, MEDIA_IMG, ROUND_ITEM, ROW_ACTIONS } from '@/lib/ui-tokens'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'

interface CharacterItemProps {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
  /** 手动排序模式下才挂拖拽手柄 */
  sortable?: boolean
}

/** 「画廊」视图的卡片 */
export function CharacterCard({
  character,
  onSelect,
  onDelete,
  onLongPress,
  countryName,
  isMobile,
  sortable = false,
}: CharacterItemProps) {
  const displayNationality = countryName || character.nationalityLegacy

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })
  const { setNodeRef, style, attributes, listeners } = useSortableItem(character.id, !sortable)

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
        onClick={() => onSelect(character.id)}
        className={`flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_ITEM}`}
      >
        <div className={MEDIA_CARD}>
          {character.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(character.headerUrl, 'header')}
                alt=""
                className={MEDIA_IMG}
              />
              {/* 图片与卡片底色之间做渐变过渡 */}
              <div className={MEDIA_GRADIENT} />
            </>
          ) : (
            <div className={MEDIA_FALLBACK}>
              {character.name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className={`flex gap-3 p-2.5 ${displayNationality ? 'items-start' : 'items-center'}`}>
          <Avatar src={character.avatarUrl} size="md" className="shrink-0" />
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {character.isMajor ? (
                <span title="主要角色" className="shrink-0">
                  <Circle size={8} fill="var(--color-ink-muted)" className="text-ink-muted" />
                </span>
              ) : null}
              <h3 className="text-sm font-medium text-ink truncate">{character.name}</h3>
            </div>
            {displayNationality ? (
              <span className="text-xs text-ink-faint">{displayNationality}</span>
            ) : null}
          </div>
        </div>
      </button>

      {!isMobile ? (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(character.id)} />
        </div>
      ) : null}
    </div>
  )
}

/** 「目录」视图的行 */
export function CharacterRow({
  character,
  onSelect,
  onDelete,
  onLongPress,
  countryName,
  isMobile,
  sortable = false,
}: CharacterItemProps) {
  const displayNationality = countryName || character.nationalityLegacy
  const aliasText = aliasesText(character.aliases)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })
  const { setNodeRef, style, attributes, listeners } = useSortableItem(character.id, !sortable)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(character.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(character.id)}
      onKeyDown={handleKeyDown}
      className={`group relative row-rule flex w-full cursor-pointer items-center gap-3 rounded-item py-2 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'}`}
      {...longPress}
    >
      {sortable ? (
        <div className={DRAG_SLOT_ROW}>
          <DragHandle handleProps={{ attributes, listeners }} />
        </div>
      ) : null}
      <Avatar src={getImageUrl(character.avatarUrl, 'avatar')} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {character.isMajor ? (
            <span title="主要角色" className="shrink-0">
              <Circle size={8} fill="var(--color-ink-muted)" className="text-ink-muted" />
            </span>
          ) : null}
          <h3 className="truncate text-sm font-medium text-ink">{character.name}</h3>
          {aliasText ? (
            <span className="shrink-0 text-xs text-ink-muted">({aliasText})</span>
          ) : null}
        </div>
        <div className="truncate text-xs text-ink-muted">
          {displayNationality ? <span>{displayNationality}</span> : null}
          {displayNationality && character.race ? <span> · </span> : null}
          {character.race ? <span>{character.race}</span> : null}
        </div>
      </div>
      {!isMobile ? (
        <div className={ROW_ACTIONS}>
          <DeleteButton onDelete={() => onDelete(character.id)} />
        </div>
      ) : null}
    </div>
  )
}
