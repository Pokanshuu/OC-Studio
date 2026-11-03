'use client'

/**
 * 树形表格（W5）：词条 / 国家 / 角色 / 事件 的同源表格视图。
 *
 * 口径（`docs/todo.md` §1、`docs/模板.md` §1.4）：
 * **只做渲染层** —— 词条的层级一律由 `lib/world-tree.ts#buildEntryTree` 决定，
 * 这里不再写第二套排序；其它三类是平表（它们没有层级）。
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, RotateCw, Search } from 'lucide-react'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import { createEntry } from '@/features/world/services'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { notifyDataUpdated } from '@/lib/data-events'
import { BTN_QUIET, PAGE_TITLE, ROUND_ITEM, SEARCH_ICON, SEARCH_INPUT } from '@/lib/ui-tokens'
import type { WorldEntry } from '@/types'

type Tab = 'entry' | 'country' | 'character' | 'event'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'entry', label: '词条' },
  { value: 'country', label: '国家' },
  { value: 'character', label: '角色' },
  { value: 'event', label: '事件' },
]

interface Row {
  id: string
  name: string
  depth: number
  hasChildren: boolean
  category: string
  tags: string
  updatedAt: number
}

function formatDate(value: number): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

/** 树 → 扁平行（受展开状态控制）；渲染与计数共用这一份 */
export function flattenTree(nodes: WorldTreeNode[], expanded: Set<number>, depth = 0): Row[] {
  const rows: Row[] = []
  for (const node of nodes) {
    const hasChildren = node.children.length > 0
    rows.push({
      id: `entry-${node.entry.id}`,
      name: node.entry.title,
      depth,
      hasChildren,
      category: node.entry.category || '—',
      tags: node.entry.tags?.length ? String(node.entry.tags.length) : '—',
      updatedAt: node.entry.updatedAt ?? 0,
    })
    if (hasChildren && expanded.has(node.entry.id)) {
      rows.push(...flattenTree(node.children, expanded, depth + 1))
    }
  }
  return rows
}

export function TreeTable() {
  const [tab, setTab] = useState<Tab>('entry')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())

  const entryList = useEntryList()
  const characterList = useCharacterList()
  const countryList = useCountryList()
  const eventList = useEventList()

  const entries = entryList.entries as WorldEntry[]
  const tree = useMemo(() => buildEntryTree(entries), [entries])
  const entryRows = useMemo(() => flattenTree(tree, expanded), [tree, expanded])

  const rows: Row[] = useMemo(() => {
    if (tab === 'entry') return entryRows
    if (tab === 'country') {
      return countryList.countries.map((item) => ({
        id: `country-${item.id}`,
        name: item.name,
        depth: 0,
        hasChildren: false,
        category: item.system || '—',
        tags: item.tags?.length ? String(item.tags.length) : '—',
        updatedAt: item.updatedAt ?? 0,
      }))
    }
    if (tab === 'character') {
      return characterList.characters.map((item) => ({
        id: `character-${item.id}`,
        name: item.name,
        depth: 0,
        hasChildren: false,
        category: item.occupation || item.race || '—',
        tags: item.tags?.length ? String(item.tags.length) : '—',
        updatedAt: item.updatedAt ?? 0,
      }))
    }
    return eventList.events.map((item) => ({
      id: `event-${item.id}`,
      name: item.title,
      depth: 0,
      hasChildren: false,
      category: item.time || '—',
      tags: item.tags?.length ? String(item.tags.length) : '—',
      updatedAt: item.updatedAt ?? 0,
    }))
  }, [tab, entryRows, countryList.countries, characterList.characters, eventList.events])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((row) => row.name.toLowerCase().includes(keyword))
  }, [rows, search])

  const handleCreate = async () => {
    await createEntry({ title: '新词条', content: '', parentId: null, order: 0, isConcept: false, tags: [] })
    notifyDataUpdated()
    entryList.refresh()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-end justify-between gap-4 px-6 pt-4">
        <h1 className={PAGE_TITLE}>树形表格</h1>
        <nav className="flex items-center gap-4">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`relative pb-1 text-[13px] transition-colors ${
                tab === item.value ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {item.label}
              {tab === item.value ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" aria-hidden />
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex items-center gap-1 border-b border-line px-6 py-2">
        <div className="relative">
          <Search size={14} strokeWidth={2} className={SEARCH_ICON} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索当前视图…"
            className={SEARCH_INPUT}
          />
        </div>
        <span className="ml-2 text-xs text-ink-faint tabular-nums">
          {filtered.length} / {rows.length}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => entryList.refresh()} className={BTN_QUIET} title="刷新">
            <RotateCw size={14} strokeWidth={2} />
          </button>
          {tab === 'entry' ? (
            <>
              <button
                type="button"
                onClick={() => setExpanded(new Set(entries.map((entry) => entry.id)))}
                className={BTN_QUIET}
              >
                展开全部
              </button>
              <button type="button" onClick={() => setExpanded(new Set())} className={BTN_QUIET}>
                折叠全部
              </button>
              <button type="button" onClick={() => void handleCreate()} className={BTN_QUIET}>
                <Plus size={14} strokeWidth={2} />
                新增
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-line text-ink-faint">
              <th className="py-2 pl-6 font-normal">名称</th>
              <th className="w-40 py-2 font-normal">
                {tab === 'entry' ? '分类' : tab === 'character' ? '职业 / 种族' : tab === 'event' ? '时间' : '体制'}
              </th>
              <th className="w-24 py-2 font-normal">标签</th>
              <th className="w-32 py-2 pr-6 font-normal">更新</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-ink-faint">
                  没有匹配的条目
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const numericId = Number(row.id.replace('entry-', ''))
                const open = expanded.has(numericId)
                return (
                  <tr key={row.id} className="row-rule transition-colors hover:bg-[var(--oc-hover)]">
                    <td className="py-1.5 pl-6">
                      <span className="flex items-center gap-1" style={{ paddingLeft: row.depth * 18 }}>
                        {row.hasChildren ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev)
                                if (next.has(numericId)) next.delete(numericId)
                                else next.add(numericId)
                                return next
                              })
                            }
                            className={`flex h-5 w-5 items-center justify-center text-ink-faint hover:text-ink ${ROUND_ITEM}`}
                            aria-label={open ? '折叠' : '展开'}
                          >
                            {open ? (
                              <ChevronDown size={13} strokeWidth={2} />
                            ) : (
                              <ChevronRight size={13} strokeWidth={2} />
                            )}
                          </button>
                        ) : (
                          <span className="h-5 w-5" />
                        )}
                        <span className="truncate text-ink">{row.name}</span>
                      </span>
                    </td>
                    <td className="py-1.5 text-ink-muted">{row.category}</td>
                    <td className="py-1.5 text-ink-muted">{row.tags}</td>
                    <td className="py-1.5 pr-6 text-ink-faint tabular-nums">{formatDate(row.updatedAt)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
