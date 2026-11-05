'use client'

/**
 * 树形表格（W5）：角色 / 事件 / 国家 / 词条 的同源表格视图。
 *
 * 口径（`docs/todo.md` §1、`docs/模板.md` §1.4）：
 * **只做渲染层** —— 词条的层级一律由 `lib/world-tree.ts#buildEntryTree` 决定，
 * 这里不再写第二套排序；其它三类是平表（它们没有层级）。
 *
 * 一行 = 一个实体：整行可点（进入对应编辑器），展开箭头只负责展开/收起。
 *
 * 页签**可拖拽调序**（顺序存 localStorage，见 `tree-table-tabs.ts`）。页头动作区
 * 四个页签**位置一致**（搜索 / 计数 / 刷新 / 新增 一直在），只有「展开全部 / 折叠全部」
 * 出现在**词条**页签 —— 层级只有它才有，平表页签上放两个点不动的按钮只是噪声。
 * 「新增」建的是**当前页签**那一类实体，建完留在表里。
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, RotateCw, Search, SearchX, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import { createEntry } from '@/features/world/services'
import { createCharacter } from '@/features/characters/services'
import { createCountry } from '@/features/countries/services'
import { createEvent } from '@/features/events/services'
import {
  newCharacterData,
  newCountryData,
  newEventData,
  newWorldEntryData,
} from '@/lib/entity-defaults'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { plainTextOf } from '@/lib/export/site/render'
import { notifyDataUpdated } from '@/lib/data-events'
import { BTN_QUIET, ICON_BTN, ROUND_ITEM, SEARCH_ICON, SEARCH_INPUT } from '@/lib/ui-tokens'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { TreeTableTabs } from './TreeTableTabs'
import { readTabOrder, type TreeTableTab } from './tree-table-tabs'
import type { WorldEntry } from '@/types'

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

/**
 * 表格单元格只放**纯文本**。
 *
 * 老库的 `制度` / `职业` 这些字段里存的是 HTML 富文本（fork 时期直接存了编辑器
 * 序列化的结果），原样渲染会把 `<p>` 当字显示出来。剥标签不另写一套：导出站的
 * `plainTextOf` 已经同时认 HTML、Tiptap JSON 字符串与文档对象，能力层也在用它。
 */
function cellText(value: unknown): string {
  return plainTextOf(value).replace(/\s+/g, ' ').trim()
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
      category: cellText(node.entry.category) || '—',
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
  // 首次打开选「排在最前」的那个页签；顺序本身由 TreeTableTabs 持有 ——
  // 拖动时只重渲染那一条页签栏，不带着整张表一起重画
  const [tab, setTab] = useState<TreeTableTab>(() => readTabOrder()[0])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [creating, setCreating] = useState(false)

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
        category: cellText(item.system) || '—',
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
        category: cellText(item.occupation || item.race) || '—',
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
      category: cellText(item.time) || '—',
      tags: item.tags?.length ? String(item.tags.length) : '—',
      updatedAt: item.updatedAt ?? 0,
    }))
  }, [tab, entryRows, countryList.countries, characterList.characters, eventList.events])

  const keyword = search.trim().toLowerCase()
  const filtered = useMemo(
    () => (keyword ? rows.filter((row) => row.name.toLowerCase().includes(keyword)) : rows),
    [rows, keyword],
  )

  /** 只有词条有层级：展开 / 折叠只在词条页签出现，别的页签没有树可展开 */
  const hasNested = tree.some((node) => node.children.length > 0)

  /** 新增的是**当前页签**那一类实体，建完留在表里（不跳走） */
  const handleCreate = () => {
    if (creating) return
    setCreating(true)
    const run = async () => {
      try {
        if (tab === 'character') await createCharacter(newCharacterData())
        else if (tab === 'event') await createEvent(newEventData())
        else if (tab === 'country') await createCountry(newCountryData())
        else await createEntry(newWorldEntryData())
        // 四张表的列表 hook 都监听这个事件，不用挨个 refresh
        notifyDataUpdated()
      } catch (error) {
        toast.error('新建失败', {
          description: error instanceof Error ? error.message : String(error),
        })
      } finally {
        setCreating(false)
      }
    }
    void run()
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
                  className={`${BTN_QUIET} max-sm:hidden`}
                  disabled={!hasNested}
                >
                  展开全部
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(new Set())}
                  className={`${BTN_QUIET} max-sm:hidden`}
                  disabled={expanded.size === 0}
                >
                  折叠全部
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={handleCreate}
              className={BTN_QUIET}
              disabled={creating}
            >
              <Plus size={14} strokeWidth={2} />
              新增
            </button>
          </>
        }
      />

      <TreeTableTabs tab={tab} onTabChange={setTab} />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {filtered.length === 0 ? (
          keyword ? (
            <ListEmptyState
              icon={SearchX}
              message="没有匹配的条目"
              action={{ label: '清除搜索', onClick: () => setSearch('') }}
            />
          ) : (
            <ListEmptyState
              icon={Table2}
              message="还没有内容"
              action={{ label: '新增', onClick: handleCreate }}
            />
          )
        ) : (
        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-line text-ink-faint">
              <th className="py-2 pl-6 font-normal">名称</th>
              <th className="w-40 py-2 font-normal">
                {tab === 'entry'
                  ? '分类'
                  : tab === 'character'
                    ? '职业 / 种族'
                    : tab === 'event'
                      ? '时间'
                      : '体制'}
              </th>
              <th className="w-24 py-2 font-normal">标签</th>
              <th className="w-32 py-2 pr-6 font-normal">更新</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
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
            }
          </tbody>
        </table>
        )}
      </div>
    </div>
  )
}
