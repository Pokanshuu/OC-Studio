'use client'

import type { Country } from '@/types'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { useLongPress } from '@/lib/useLongPress'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl, resolveImageUrl } from '@/lib/image-service'
import { countryPreview } from './country-list-utils'
import { ROUND_MEDIA } from '@/lib/ui-tokens'

interface CountryItemProps {
  country: Country
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onLongPress?: () => void
  isMobile: boolean
}

/** 「目录」视图的行 */
export function CountryRow({
  country,
  onSelect,
  onDelete,
  onLongPress,
  isMobile,
}: CountryItemProps) {
  const preview = countryPreview(country)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSelect(country.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(country.id)}
      onKeyDown={handleKeyDown}
      className="group relative flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)]"
      {...longPress}
    >
      <Avatar src={getImageUrl(country.flagUrl, 'flag')} size="md" type="flag" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="truncate text-sm font-medium text-ink">{country.name}</h3>
        {preview ? (
          <span className="text-xs text-ink-muted truncate">{preview}</span>
        ) : null}
      </div>
      {!isMobile ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
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
}: CountryItemProps) {
  const preview = countryPreview(country)

  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile,
  })

  return (
    <div className="relative group touch-feedback" {...longPress}>
      <button
        onClick={() => onSelect(country.id)}
        className={`flex w-full flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_MEDIA}`}
      >
        <div className="relative aspect-[3/2] w-full bg-paper-card">
          {country.headerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(country.headerUrl, 'header')}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-paper-card to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center font-serif text-2xl text-ink-faint">
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
