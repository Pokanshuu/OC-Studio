'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { GroupModeMenu, type GroupModeOption } from '@/components/shared/GroupModeMenu'
import { ListGroupSection } from '@/components/shared/ListGroupSection'
import { ICON_BTN_MD, PAGE_TITLE, ROUND_ITEM } from '@/lib/ui-tokens'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { isGroupCollapsed, toggleCollapsedKey } from '@/lib/list-grouping'
import {
  readCharacterGroupMode,
  writeCharacterGroupMode,
  type CharacterGroupMode,
} from '@/lib/list-grouping-preference'
import type { Character } from '@/types'
import { listFolders, loadFolderRegistry, useFolderRegistry } from '../folders'
import { groupCharactersByCountry, groupCharactersByFolder } from '../grouping'
import { useCharacterList } from '../hooks/useCharacters'

const GROUP_OPTIONS: GroupModeOption<CharacterGroupMode>[] = [
  { value: 'country', label: '按国家' },
  { value: 'folder', label: '按文件夹' },
]

interface CharacterEditorListProps {
  currentId: number
  onSelect?: (id: number) => void
  onCollapse: () => void
  onCreate?: () => void
}

/**
 * 三栏左栏：搜索 + 分组（按国家 / 按文件夹，默认按国家）。
 * 只做「换人」，不复制列表页的卡片 / 视图切换 / 删除 / 拖拽。
 *
 * 分组只改展示：切换方式不写 `countryId` / `folder`，也不重挂右侧编辑器 ——
 * 搜索文本、当前选中、未保存正文都留在原处。
 */
export function CharacterEditorList({ currentId, onSelect, onCollapse, onCreate }: CharacterEditorListProps) {
  const { characters, loading, error } = useCharacterList()
  const { countries } = useCountryList()
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [groupMode, setGroupMode] = useState<CharacterGroupMode>(readCharacterGroupMode)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const registeredFolders = useFolderRegistry()

  // 角色文件夹清单（`.ocstudio/folders.json`）随库读一次：空文件夹只有这份清单记得住
  useEffect(() => {
    void loadFolderRegistry()
  }, [])

  const q = query.trim().toLowerCase()
  const searching = q !== ''

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
    if (groupMode === 'country') return groupCharactersByCountry(filtered, countries)
    const folderNames = listFolders(characters, registeredFolders).folders.map((folder) => folder.name)
    return groupCharactersByFolder({ items: filtered, folderNames, searching })
  }, [characters, countries, filtered, groupMode, registeredFolders, searching])

  const handleGroupModeChange = (mode: CharacterGroupMode): void => {
    setGroupMode(mode)
    writeCharacterGroupMode(mode)
  }

  const toggleGroup = (key: string): void => {
    setCollapsed((prev) => toggleCollapsedKey(prev, key))
  }

  const renderRow = (character: Character) => {
    const subtitle = [character.race, character.occupation].filter(Boolean).join(' · ')
    return (
      <button
        key={character.id}
        type="button"
        onClick={() => onSelect?.(character.id)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${ROUND_ITEM} ${
          character.id === currentId ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink hover:bg-[var(--oc-hover)]'
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
    <div className="flex h-full min-h-0 flex-col bg-paper-alt" aria-label="角色列表">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onCollapse}
            className={ICON_BTN_MD}
            title="收起列表"
            aria-label="收起列表"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>角色</h2>
        </div>
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className={ICON_BTN_MD}
            title="新建角色"
            aria-label="新建角色"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-line px-3 py-1.5">
        <div className={`flex items-center gap-2 border-b transition-colors ${searchFocused ? 'border-line-hover' : 'border-transparent'}`}>
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索角色…"
            aria-label="搜索角色"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="shrink-0 px-3 py-2">
        <GroupModeMenu
          value={groupMode}
          onChange={handleGroupModeChange}
          options={GROUP_OPTIONS}
          className="-ml-1.5"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        {loading ? <p className="px-3 py-3 text-[12px] text-ink-faint">加载中…</p> : null}
        {error ? <p className="px-3 py-3 text-[12px] text-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-ink-faint">没有匹配的角色</p>
        ) : null}

        {filtered.length > 0 ? (
          <nav className="flex flex-col gap-1">
            {groups.map((group) => (
              <ListGroupSection
                key={group.key}
                label={group.label}
                count={group.items.length}
                collapsed={isGroupCollapsed(collapsed, group.key, searching)}
                onToggle={() => toggleGroup(group.key)}
              >
                <div className="flex flex-col gap-0.5">{group.items.map(renderRow)}</div>
              </ListGroupSection>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  )
}
