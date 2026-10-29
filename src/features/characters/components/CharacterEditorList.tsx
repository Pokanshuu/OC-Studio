'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { ROUND_ITEM } from '@/lib/ui-tokens'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import type { Character } from '@/types'
import { useCharacterList } from '../hooks/useCharacters'

interface CharacterEditorListProps {
  currentId: number
  onSelect?: (id: number) => void
}

/**
 * 三栏左栏：搜索 + 按国家分组。
 * 只做「换人」，不复制列表页的卡片 / 视图切换 / 删除 / 拖拽。
 */
export function CharacterEditorList({ currentId, onSelect }: CharacterEditorListProps) {
  const { characters, loading, error } = useCharacterList()
  const { countries } = useCountryList()
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!q) return characters
    return characters.filter((character) =>
      [character.name, character.aliases.join(' '), character.race, character.occupation]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [characters, q])

  const groups = useMemo(() => {
    const countryIdOf = (character: Character): number | undefined => {
      if (character.countryId != null) return character.countryId
      // 国家侧是成员关系的镜像；列表数据可能只带了这一侧。
      const byRelation = countries.find((country) => country.characters.includes(character.id))
      if (byRelation) return byRelation.id
      const byLegacy = countries.find((country) => country.name === character.nationalityLegacy)
      return byLegacy?.id
    }
    const known = new Set(countries.map((country) => country.id))
    const result = countries
      .map((country) => ({
        id: country.id as number,
        name: country.name,
        items: filtered.filter((character) => countryIdOf(character) === country.id),
      }))
      .filter((group) => group.items.length > 0)

    const unassigned = filtered.filter((character) => {
      const id = countryIdOf(character)
      return id == null || !known.has(id)
    })
    if (unassigned.length) result.push({ id: -1, name: '未归属', items: unassigned })
    return result
  }, [countries, filtered])

  const toggleGroup = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderRow = (character: Character) => {
    const subtitle = [character.race, character.occupation].filter(Boolean).join(' · ')
    return (
      <button
        key={character.id}
        type="button"
        onClick={() => onSelect?.(character.id)}
        className={`flex w-full items-center gap-2 text-left transition-colors ${ROUND_ITEM} px-2 py-1.5 ${
          character.id === currentId ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
        }`}
      >
        <Avatar src={character.avatarUrl} size="md" className="shrink-0" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-ink">{character.name}</span>
          {subtitle ? <span className="truncate text-[11px] text-ink-muted">{subtitle}</span> : null}
        </span>
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" aria-label="角色列表">
      <div className="border-b border-line px-3 py-1.5">
        <div className={`flex items-center gap-2 border-b transition-colors ${searchFocused ? 'border-line-hover' : 'border-transparent'}`}>
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索"
            aria-label="搜索角色"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {loading ? <p className="px-2 py-3 text-[12px] text-ink-faint">加载中…</p> : null}
        {error ? <p className="px-2 py-3 text-[12px] text-error">{error}</p> : null}
        {!loading && !error && groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-faint">没有匹配的角色</p>
        ) : null}

        {groups.map((group) => {
          const isCollapsed = !q && collapsed.has(group.id)
          return (
            <div key={group.id} className="mt-1 first:mt-0">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] tracking-[0.06em] text-ink-faint transition-colors hover:text-ink-muted"
              >
                <ChevronDown
                  size={12}
                  strokeWidth={2}
                  className={isCollapsed ? '-rotate-90 transition-transform' : 'transition-transform'}
                />
                <span>{group.name}</span>
                <span className="ml-auto tabular-nums">{group.items.length}</span>
              </button>
              {isCollapsed ? null : <div className="flex flex-col gap-0.5">{group.items.map(renderRow)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
