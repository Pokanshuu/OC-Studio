'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { ROUND_ITEM } from '@/lib/ui-tokens'
import type { Country } from '@/types'
import { useCountryList } from '../hooks/useCountries'

interface CountryEditorListProps {
  currentId: number
  onSelect?: (id: number) => void
}

/** 三栏左栏：搜索 + 国家行（旗帜 + 名称）。 */
export function CountryEditorList({ currentId, onSelect }: CountryEditorListProps) {
  const { countries, loading, error } = useCountryList()
  const [query, setQuery] = useState('')
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
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${ROUND_ITEM} ${
        country.id === currentId ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
      }`}
    >
      <Avatar src={country.flagUrl} type="flag" shape="square" size="md" className="shrink-0" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink">{country.name}</span>
        <span className="text-[11px] text-ink-muted">国家</span>
      </span>
    </button>
  )

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="国家列表">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <Search size={14} strokeWidth={2} className="text-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索"
          aria-label="搜索国家"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {loading ? <p className="px-2 py-3 text-[12px] text-ink-faint">加载中…</p> : null}
        {error ? <p className="px-2 py-3 text-[12px] text-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-faint">没有匹配的国家</p>
        ) : null}
        {filtered.map(renderRow)}
      </div>
    </div>
  )
}
