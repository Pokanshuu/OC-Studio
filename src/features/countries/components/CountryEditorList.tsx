'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { ICON_BTN_MD, PAGE_TITLE, ROUND_ITEM, SEARCH_ICON } from '@/lib/ui-tokens'
import type { Country } from '@/types'
import { useCountryList } from '../hooks/useCountries'

interface CountryEditorListProps {
  currentId: number
  onSelect?: (id: number) => void
  onCollapse: () => void
}

/** 三栏左栏：搜索 + 国家行（旗帜 + 名称）。 */
export function CountryEditorList({ currentId, onSelect, onCollapse }: CountryEditorListProps) {
  const { countries, loading, error } = useCountryList()
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return countries
    return countries.filter((country) =>
      [country.name, (country.aliases ?? []).join(' ')].join(' ').toLowerCase().includes(q),
    )
  }, [countries, q])

  const renderRow = (country: Country) => (
    <button
      key={country.id}
      type="button"
      onClick={() => onSelect?.(country.id)}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${ROUND_ITEM} ${
        country.id === currentId ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink hover:bg-[var(--oc-hover)]'
      }`}
    >
      <Avatar src={country.flagUrl} type="flag" shape="square" size="md" className="shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink">{country.name}</span>
      </span>
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper-alt" aria-label="国家列表">
      <div className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-6">
        <h2 className={PAGE_TITLE}>国家</h2>
        <div className="relative min-w-0 flex-1">
          <Search size={16} strokeWidth={2} className={SEARCH_ICON} />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索国家…"
            aria-label="搜索国家"
            className={`h-8 w-full border-b bg-transparent pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:outline-none ${
              searchFocused ? 'border-line-hover' : 'border-transparent'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className={ICON_BTN_MD}
          title="收起列表"
          aria-label="收起列表"
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {loading ? <p className="px-3 py-3 text-[12px] text-ink-faint">加载中…</p> : null}
        {error ? <p className="px-3 py-3 text-[12px] text-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-faint">没有匹配的国家</p>
        ) : null}
        <nav className="flex flex-col gap-1">{filtered.map(renderRow)}</nav>
      </div>
    </div>
  )
}
