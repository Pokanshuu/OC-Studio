'use client'

import { Search, Users, Calendar, Flag, BookOpen } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { splitHighlight, type SearchMatchField } from '@/lib/search/matcher'
import type { GlobalSearchHit, GlobalSearchKind } from '@/lib/search'
import { ROUND_ITEM } from '@/lib/ui-tokens'

const KIND_ICON: Record<GlobalSearchKind, typeof Users> = {
  character: Users,
  event: Calendar,
  country: Flag,
  world: BookOpen,
}

const MATCH_HINT: Record<Exclude<SearchMatchField, 'title'>, string> = {
  alias: '别名',
  field: '字段',
  body: '正文',
}

/** 桌面菜单行与移动端列表行共用的结果行：标题 + 关键词摘要（两行布局） */
const MENU_ROW = `flex w-full items-start gap-2 px-3 py-1 text-left text-[13px] transition-colors ${ROUND_ITEM}`
const TOUCH_ROW = 'flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm text-ink transition-colors active:bg-[var(--oc-hover)]'

interface SearchHitRowProps {
  hit: GlobalSearchHit
  terms: string[]
  variant: 'menu' | 'touch'
  active?: boolean
  onSelect: () => void
}

function HighlightedText({
  text,
  terms,
  hitClassName,
}: {
  text: string
  terms: string[]
  hitClassName: string
}) {
  const parts = splitHighlight(text, terms)
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <span key={index} className={hitClassName}>
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function SearchHitRow({ hit, terms, variant, active = false, onSelect }: SearchHitRowProps) {
  const Icon = KIND_ICON[hit.kind] ?? Search
  const isMenu = variant === 'menu'
  const rowClass = isMenu
    ? `${MENU_ROW} ${active ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'}`
    : TOUCH_ROW
  const snippetClass = isMenu
    ? 'mt-0.5 block truncate text-[11px] leading-4 text-ink-faint'
    : 'mt-0.5 block line-clamp-2 text-[12px] leading-[1.5] text-ink-faint'

  return (
    <button
      type="button"
      data-selected={active}
      className={rowClass}
      onMouseDown={isMenu ? (event) => event.preventDefault() : undefined}
      onClick={(event) => {
        if (!isMenu) event.stopPropagation()
        onSelect()
      }}
    >
      <span className={isMenu ? 'mt-[2px] shrink-0' : 'mt-0.5 shrink-0'}>
        {hit.kind === 'character' ? (
          <Avatar src={getImageUrl(hit.avatarUrl, 'avatar')} size="sm" />
        ) : hit.kind === 'country' ? (
          <Avatar src={getImageUrl(hit.avatarUrl, 'flag')} size="sm" type="flag" />
        ) : (
          <Icon size={isMenu ? 14 : 20} strokeWidth={2} className="text-ink-faint" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate">
            <HighlightedText text={hit.title} terms={terms} hitClassName="font-medium text-ink" />
          </span>
          {hit.matched !== 'title' ? (
            <span className="shrink-0 text-[10px] leading-none text-ink-faint">{MATCH_HINT[hit.matched]}</span>
          ) : null}
        </span>
        {hit.snippet !== undefined ? (
          <span className={snippetClass}>
            <HighlightedText text={hit.snippet} terms={terms} hitClassName="font-medium text-ink-muted" />
          </span>
        ) : null}
      </span>
    </button>
  )
}
