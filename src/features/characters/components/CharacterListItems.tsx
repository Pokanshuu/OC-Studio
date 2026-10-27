'use client'

import { Circle } from 'lucide-react'
import type { Character } from '@/types'
import { Avatar } from '@/components/shared/Avatar'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { useLongPress } from '@/lib/useLongPress'
import { aliasesText } from './character-list-utils'
import { ROUND_MEDIA } from '@/lib/ui-tokens'

interface CharacterItemProps {
  character: Character
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  countryName?: string
  isMobile: boolean
}

/** 「画廊」视图的卡片 */
export function CharacterCard({
  character,
  onSelect,
  onDelete,
  onLongPress,
  countryName,
  isMobile,
}: CharacterItemProps) {
  const displayNationality = countryName || character.nationalityLegacy

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="relative group touch-feedback" {...longPress}>
      <button
        onClick={() => onSelect(character.id)}
        className={`flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_MEDIA}`}
      >
        <div className="relative aspect-[3/2] w-full bg-paper-card">
          {character.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(character.headerUrl, 'header')}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* 图片与卡片底色之间做渐变过渡 */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paper-card to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center font-serif text-2xl text-ink-faint">
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
}: CharacterItemProps) {
  const displayNationality = countryName || character.nationalityLegacy
  const aliasText = aliasesText(character.aliases)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(character.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(character.id)}
      onKeyDown={handleKeyDown}
      className="group relative flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--oc-hover)]"
      {...longPress}
    >
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
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DeleteButton onDelete={() => onDelete(character.id)} />
        </div>
      ) : null}
    </div>
  )
}
