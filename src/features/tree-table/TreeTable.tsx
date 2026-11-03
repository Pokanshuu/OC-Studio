'use client'

/**
 * 树形表格（W5）：词条 / 国家 / 角色 / 事件 的同源表格视图。
 *
 * 口径（`docs/todo.md` §1、`docs/模板.md` §1.4）：
 * **只做渲染层** —— 词条的层级一律由 `lib/world-tree.ts#buildEntryTree` 决定，
 * 这里不再写第二套排序；其它三类是平表（它们没有层级）。
 *
 * 一行 = 一个实体：整行可点（进入对应编辑器），展开箭头只负责展开/收起。
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
import { BTN_QUIET, ICON_BTN, ROUND_ITEM, SEARCH_ICON, SEARCH_INPUT } from '@/lib/ui-tokens'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { WorldEntry } from '@/types'

type Tab = 'entry' | 'country' | 'character' | 'event'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'entry', label: '词条' },
  { value: 'country', label: '国家' },
  { value: 'character', label: '角色' },
  { value: 'event', label: '事件' },
]

export type TreeTableKind = 'world' | 'country' | 'character' | 'event'

interface Row {
  id: string
  entityId: number
  entityType: TreeTableKind
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
      entityId: node.entry.id,
      entityType: 'world',
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

export function TreeTable({
  onNavigate,
}: {
  /** 点一行 → 打开对应编辑器（由工作区编排层提供） */
  onNavigate?: (id: number, type: TreeTableKind) => void
}) {
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
        entityId: item.id,
        entityType: 'country' as const,
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
        entityId: item.id,
        entityType: 'character' as const,
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
      entityId: item.id,
      entityType: 'event' as const,
      name: item.title,
      depth: 0,
      hasChildren: false,
      category: item.time || '—',
      tags: item.tags?.length ? String(item.tags.length) : '—',
      updatedAt: item.updatedAt ?? 0,
    }))
  }, [tab, entryRows, countryList.countries, characterList.characters, eventList.events])

  const keyword = search.trim().toLowerCase()
  const filtered = useMemo(
    () => (keyword ? rows.filter((row) => row.name.toLowerCase().includes(keyword)) : rows),
    [rows, keyword],
  )

  const handleCreate = async () => {
    await createEntry({ title: '新词条', content: '', parentId: null, order: 0, isConcept: false, tags: [] })
    notifyDataUpdated()
    entryList.refresh()
  }

  const handleRefresh = () => {
    entryList.refresh()
    characterList.refresh()
    countryList.refresh()
    eventList.refresh()
  }

  const toggleRow = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="md:hidden h-[calc(60px+var(--safe-top))]" aria-hidden />

      <PageToolbar
        title="树形表格"
        className="md:px-6"
        actions={
          <>
            <div className="relative">
              <Search size={14} strokeWidth={2} className={SEARCH_ICON} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索当前视图…"
                className={SEARCH_INPUT}
              />
            </div>
            <span className="ml-1 hidden text-xs tabular-nums text-ink-faint sm:inline">
              {filtered.length} / {rows.length}
            </span>
            <button type="button" onClick={handleRefresh} className={`${ICON_BTN} ml-1`} title="刷新" aria-label="刷新">
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
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="shrink-0 gap-0">
        <TabsList className="grid grid-cols-4 px-4 md:px-6">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="w-full">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
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
                <td colSpan={4} className="py-12">
                  {keyword ? (
                    <ListEmptyState
                      message="没有匹配的条目"
                      action={{ label: '清除搜索', onClick: () => setSearch('') }}
                    />
                  ) : (
                    <ListEmptyState message="还没有内容" />
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const open = expanded.has(row.entityId)
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    onClick={() => onNavigate?.(row.entityId, row.entityType)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onNavigate?.(row.entityId, row.entityType)
                      }
                    }}
                    className="row-rule cursor-pointer transition-colors hover:bg-[var(--oc-hover)] focus:outline-none focus-visible:bg-[var(--oc-hover)]"
                  >
                    <td className="py-1.5 pl-6">
                      <span className="flex items-center gap-1" style={{ paddingLeft: row.depth * 18 }}>
                        {row.hasChildren ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleRow(row.entityId)
                            }}
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
