'use client'

import { Circle } from 'lucide-react'
import type { Character } from '@/types'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { CoverCard } from '@/components/shared/cover/CoverCard'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { coverExcerpt } from '@/lib/cover'
import { useLongPress } from '@/lib/useLongPress'
import { aliasesText } from './character-list-utils'
import { DRAG_SLOT_ROW, ROW_ACTIONS, ROW_SELECTED } from '@/lib/ui-tokens'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { MoveToFolderMenu } from './MoveToFolderMenu'
import { listRowClass, listRowProps } from '@/lib/list-item'
import type { ListItemHandlers } from '@/lib/use-list-navigation'

interface CharacterItemProps {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
  /** 现有文件夹名（用于「移到文件夹」菜单） */
  folders?: string[]
  onMoveToFolder?: (id: number, folder: string | null) => void
  /** 手动排序模式下才挂拖拽手柄 */
  sortable?: boolean
  /** 桌面列表选中模型（use-list-navigation）给的一组属性 */
  nav?: ListItemHandlers
}

/** 「画廊」视图的卡片：一张封面（照片 → 渐进模糊 → 色块，名字落在色块里） */
export function CharacterCard({
  character,
  onSelect,
  onDelete,
  onLongPress,
  countryName,
  isMobile,
  folders = [],
  onMoveToFolder,
  sortable = false,
  nav,
}: CharacterItemProps) {
  const displayNationality = countryName || character.nationalityLegacy
  const meta = [character.race, displayNationality].filter(Boolean).join(' · ')
  const avatar = character.avatarUrl ? resolveImageUrl(character.avatarUrl, 'avatar') : undefined

  return (
    <CoverCard
      id={character.id}
      nav={nav}
      title={character.name}
      intro={coverExcerpt(character.bio, 84)}
      meta={meta || undefined}
      imageSrc={character.headerUrl ? resolveImageUrl(character.headerUrl, 'header') : undefined}
      tintSrc={avatar}
      emblem={avatar ? <Avatar src={character.avatarUrl} fill /> : undefined}
      marker={
        character.isMajor ? (
          <Circle size={7} strokeWidth={0} fill="currentColor" className="text-paper-fixed/70" />
        ) : undefined
      }
      onSelect={() => onSelect(character.id)}
      onLongPress={onLongPress}
      isMobile={isMobile}
      sortable={sortable}
      actions={
        !isMobile ? (
          <>
            <MoveToFolderMenu
              folders={folders}
              current={character.folder}
              onMove={(folder) => onMoveToFolder?.(character.id, folder)}
              tone="overlay"
            />
            <DeleteButton tone="overlay" onDelete={() => onDelete(character.id)} />
          </>
        ) : undefined
      }
    />
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
  folders = [],
  onMoveToFolder,
  sortable = false,
  nav,
}: CharacterItemProps) {
  const displayNationality = countryName || character.nationalityLegacy
  const aliasText = aliasesText(character.aliases)

  const { setNodeRef, style, attributes, listeners, longPress: longPressSort, cardAttributes, cardListeners } =
    useSortableItem(character.id, !sortable)
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile && !longPressSort,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(character.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listRowProps(nav, { onClick: () => onSelect(character.id), onKeyDown: handleKeyDown })}
      className={listRowClass(
        nav,
        `group relative row-rule flex w-full items-center gap-3 rounded-item py-2 pr-4 text-left transition-colors hover:bg-[var(--oc-hover)] ${sortable ? 'pl-10' : 'pl-4'} ${longPressSort ? 'touch-none' : ''}`,
        ROW_SELECTED,
      )}
      {...longPress}
      {...cardAttributes}
      {...cardListeners}
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
          <h3 className="truncate text-body leading-5 font-medium text-ink">{character.name}</h3>
          {aliasText ? (
            <span className="shrink-0 text-caption leading-4 text-ink-muted">({aliasText})</span>
          ) : null}
        </div>
        <div className="truncate text-caption leading-4 text-ink-muted">
          {displayNationality ? <span>{displayNationality}</span> : null}
          {displayNationality && character.race ? <span> · </span> : null}
          {character.race ? <span>{character.race}</span> : null}
        </div>
      </div>
      {!isMobile ? (
        <div className={ROW_ACTIONS}>
          <MoveToFolderMenu
            folders={folders}
            current={character.folder}
            onMove={(folder) => onMoveToFolder?.(character.id, folder)}
          />
          <DeleteButton onDelete={() => onDelete(character.id)} />
        </div>
      ) : null}
    </div>
  )
}
