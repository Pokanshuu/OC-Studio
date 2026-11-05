'use client'

/**
 * 树形表格（W5）：角色 / 事件 / 国家 / 词条 的同源表格视图。
 *
 * 口径（`docs/todo.md` §1、`docs/模板.md` §1.4）：
 * - 词条 / 国家 / 角色的**层级与分组只由 `parentId` / `countryId` 决定**，
 *   行模型全在 `tree-table-rows.ts`，这里不另排一套；
 * - 一行 = 一个实体：整行点击进入对应编辑器，展开箭头只负责展开 / 收起；
 * - 名称列与角色的种族 / 职业 / 所属国家**就地编辑**（只收纯文本字段，见 `EditableCell`）；
 * - 名称列悬停出「新增子项 / 删除」：子项在删除时提升到被删节点的父级，不会跟着消失；
 * - 标签列给**标签名**（`TagBadge`），不是计数。
 *
 * 页签**可拖拽调序**（顺序存 localStorage，见 `tree-table-tabs.ts`）。页头动作区
 * 四个页签**位置一致**（搜索 / 计数 / 刷新 / 新增 一直在），「展开全部 / 折叠全部」
 * 只在这一页真有层级时出现。
 */
import { useMemo, useState } from 'react'
import { Plus, RotateCw, Search, SearchX, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Tag } from '@/types'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { useCharacterList } from '@/features/characters/hooks/useCharacters'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { useEventList } from '@/features/events/hooks/useEvents'
import { useTags } from '@/features/tags/hooks/useTags'
import { createEntry, deleteEntry, renameEntry, updateEntry } from '@/features/world/services'
import { createCountry, deleteCountry, updateCountry } from '@/features/countries/services'
import {
  assignCharacterCountry,
  createCharacter,
  deleteCharacter,
  updateCharacter,
} from '@/features/characters/services'
import { createEvent, deleteEvent, updateEvent } from '@/features/events/services'
import {
  newCharacterData,
  newCountryData,
  newEventData,
  newWorldEntryData,
} from '@/lib/entity-defaults'
import { buildEntryTree } from '@/lib/world-tree'
import { notifyDataUpdated } from '@/lib/data-events'
import { BTN_QUIET, CENTER_STATE, ICON_BTN, LOADING_TEXT, SEARCH_ICON, SEARCH_INPUT } from '@/lib/ui-tokens'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import type { FilterOption } from '@/components/shared/FilterSelect'
import { TreeTableTabs } from './TreeTableTabs'
import { readTabOrder, type TreeTableTab } from './tree-table-tabs'
import {
  buildCountryTree,
  flattenCharacterRows,
  flattenCountryRows,
  flattenEntryRows,
  flattenEventRows,
  type RowOptions,
  type TreeRow,
} from './tree-table-rows'
import { TreeTableRow, type EditableField } from './components/TreeTableRow'

export type TreeTableKind = 'world' | 'country' | 'character' | 'event'

const EMPTY_EXPANDED: Set<string> = new Set()

const ENTITY_LABEL: Record<TreeTableTab, string> = {
  character: '角色',
  event: '事件',
  country: '国家',
  entry: '词条',
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  /**
   * 展开状态 = **默认 + 用户偏离**：根节点默认展开（角色页不展开就只剩国家名），
   * 用户点过的行记在 `pinnedOpen` / `pinnedClosed` 里。这样「数据到了再展开根节点」
   * 不需要在 effect 里补一次 setState —— 默认值由 `everyRow` 推出来。
   */
  const [pinnedOpen, setPinnedOpen] = useState<Set<string>>(() => new Set())
  const [pinnedClosed, setPinnedClosed] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const entryList = useEntryList()
  const characterList = useCharacterList()
  const countryList = useCountryList()
  const eventList = useEventList()
  const { tags, refresh: refreshTags } = useTags()

  const entries = entryList.entries
  const countries = countryList.countries
  const characters = characterList.characters
  const events = eventList.events

  const tagsById = useMemo(() => new Map<number, Tag>(tags.map((tag) => [tag.id, tag])), [tags])
  const tagName = useMemo(() => {
    const names = new Map(tags.map((tag) => [tag.id, tag.name]))
    return (ids: number[]): string =>
      ids
        .map((id) => names.get(id) ?? '')
        .filter(Boolean)
        .join(' ')
  }, [tags])

  const tree = useMemo(() => buildEntryTree(entries), [entries])
  const countryTree = useMemo(() => buildCountryTree(countries), [countries])

  const query = search.trim().toLowerCase()

  /** 不受折叠与搜索影响的全量行：默认展开哪些根、页头计数、「展开全部」 */
  const everyRow = useMemo(() => {
    const opts: RowOptions = { expanded: EMPTY_EXPANDED, query: '', tagName, all: true }
    if (tab === 'entry') return flattenEntryRows(tree, opts)
    if (tab === 'country') return flattenCountryRows(countryTree, opts)
    if (tab === 'character') return flattenCharacterRows(countryTree, characters, opts)
    return flattenEventRows(events, opts)
  }, [tab, tree, countryTree, characters, events, tagName])

  const defaultOpenKeys = useMemo(
    () => new Set(everyRow.filter((row) => row.depth === 0 && row.hasChildren).map((row) => row.key)),
    [everyRow],
  )

  const expanded = useMemo(() => {
    const keys = new Set(defaultOpenKeys)
    for (const key of pinnedOpen) keys.add(key)
    for (const key of pinnedClosed) keys.delete(key)
    return keys
  }, [defaultOpenKeys, pinnedOpen, pinnedClosed])

  const options = useMemo<RowOptions>(
    () => ({ expanded, query, tagName }),
    [expanded, query, tagName],
  )

  const rows = useMemo(() => {
    if (tab === 'entry') return flattenEntryRows(tree, options)
    if (tab === 'country') return flattenCountryRows(countryTree, options)
    if (tab === 'character') return flattenCharacterRows(countryTree, characters, options)
    return flattenEventRows(events, options)
  }, [tab, tree, countryTree, characters, events, options])

  const hasNested = everyRow.some((row) => row.hasChildren)
  const entityCount =
    tab === 'entry'
      ? entries.length
      : tab === 'country'
        ? countries.length
        : tab === 'character'
          ? characters.length
          : events.length

  const countryOptions = useMemo<FilterOption<number | 'none'>[]>(() => {
    const list = [...countries].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
    return [
      { value: 'none', label: '未归属' },
      ...list.map((country) => ({ value: country.id, label: country.name })),
    ]
  }, [countries])

  const loading =
    tab === 'entry'
      ? entryList.loading
      : tab === 'country'
        ? countryList.loading
        : tab === 'character'
          ? countryList.loading || characterList.loading
          : eventList.loading

  const toggle = (key: string) => {
    const open = expanded.has(key)
    setPinnedOpen((prev) => {
      const next = new Set(prev)
      if (open) next.delete(key)
      else next.add(key)
      return next
    })
    setPinnedClosed((prev) => {
      const next = new Set(prev)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const expand = (key: string) => {
    setPinnedOpen((prev) => new Set(prev).add(key))
    setPinnedClosed((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const expandAll = () => {
    setPinnedOpen(new Set(everyRow.filter((row) => row.hasChildren).map((row) => row.key)))
    setPinnedClosed(new Set())
  }

  const collapseAll = () => {
    setPinnedOpen(new Set())
    setPinnedClosed(new Set(everyRow.filter((row) => row.hasChildren).map((row) => row.key)))
  }

  const handleRefresh = () => {
    entryList.refresh()
    characterList.refresh()
    countryList.refresh()
    eventList.refresh()
    refreshTags()
  }

  const handleOpen = (row: TreeRow) => {
    if (row.kind === 'group') {
      toggle(row.key)
      return
    }
    const type: TreeTableKind =
      row.kind === 'entry'
        ? 'world'
        : row.kind === 'country'
          ? 'country'
          : row.kind === 'character'
            ? 'character'
            : 'event'
    onNavigate?.(row.entityId, type)
  }

  /** 新增的是**当前页签**那一类实体，建完留在表里（不跳走） */
  const handleCreate = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (tab === 'character') await createCharacter(newCharacterData())
      else if (tab === 'event') await createEvent(newEventData())
      else if (tab === 'country') await createCountry(newCountryData())
      else await createEntry(newWorldEntryData())
      // 四张表的列表 hook 都监听这个事件，不用挨个 refresh
      notifyDataUpdated()
    } catch (error) {
      toast.error('新建失败', { description: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  /** 行内「新增子项」：词条 → 子词条，国家 → 下级国家，国家分组 → 该国角色，角色 → 同国角色 */
  const handleAddChild = async (row: TreeRow) => {
    if (busy) return
    setBusy(true)
    try {
      if (row.kind === 'entry') {
        const order = entries.filter((item) => item.parentId === row.entityId).length
        await createEntry({
          ...newWorldEntryData(),
          title: '新子词条',
          parentId: row.entityId,
          order,
        })
        expand(row.key)
      } else if (row.kind === 'country') {
        await createCountry({ ...newCountryData(), name: '新子国家', parentId: row.entityId })
        expand(row.key)
      } else if (row.kind === 'group' && row.countryId != null) {
        await createCharacter({ ...newCharacterData(), countryId: row.countryId })
        expand(row.key)
      } else if (row.kind === 'character') {
        const countryId = row.character?.countryId ?? undefined
        await createCharacter({ ...newCharacterData(), countryId })
        expand(countryId == null ? 'group:unassigned' : `group:${countryId}`)
      }
      notifyDataUpdated()
    } catch (error) {
      toast.error('新建失败', { description: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  /** 删除：词条 / 国家的子项先提到被删节点的父级，再软删除自己 */
  const handleDelete = async (row: TreeRow) => {
    if (busy || row.kind === 'group') return
    setBusy(true)
    try {
      if (row.kind === 'entry') {
        for (const child of entries.filter((item) => item.parentId === row.entityId)) {
          await updateEntry(child.id, { parentId: row.parentId ?? null })
        }
        await deleteEntry(row.entityId)
      } else if (row.kind === 'country') {
        for (const child of countries.filter((item) => item.parentId === row.entityId)) {
          await updateCountry(child.id, { parentId: row.parentId ?? null })
        }
        await deleteCountry(row.entityId)
      } else if (row.kind === 'character') {
        await deleteCharacter(row.entityId)
      } else {
        await deleteEvent(row.entityId)
      }
      notifyDataUpdated()
    } catch (error) {
      toast.error('删除失败', { description: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  const handleEdit = async (row: TreeRow, field: EditableField, value: string): Promise<void> => {
    try {
      if (row.kind === 'character') {
        if (field === 'race') await updateCharacter(row.entityId, { race: value })
        else if (field === 'occupation') await updateCharacter(row.entityId, { occupation: value })
        else await updateCharacter(row.entityId, { name: value })
      } else if (row.kind === 'entry' && field === 'title') {
        await renameEntry(row.entityId, value)
      } else if (row.kind === 'country' && field === 'name') {
        await updateCountry(row.entityId, { name: value })
      } else if (row.kind === 'event' && field === 'title') {
        await updateEvent(row.entityId, { title: value })
      }
      notifyDataUpdated()
    } catch (error) {
      toast.error('保存失败', { description: errorText(error) })
      throw error
    }
  }

  const handleSetCountry = async (row: TreeRow, countryId: number | null): Promise<void> => {
    if (row.kind !== 'character') return
    try {
      await assignCharacterCountry(row.entityId, countryId)
      if (countryId != null) expand(`group:${countryId}`)
      notifyDataUpdated()
    } catch (error) {
      toast.error('保存失败', { description: errorText(error) })
    }
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
              {entityCount} {ENTITY_LABEL[tab]} · {rows.length} 行
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              className={`${ICON_BTN} ml-1`}
              title="刷新"
              aria-label="刷新"
            >
              <RotateCw size={14} strokeWidth={2} />
            </button>
            {hasNested ? (
              <>
                <button
                  type="button"
                  onClick={expandAll}
                  className={`${BTN_QUIET} max-sm:hidden`}
                >
                  展开全部
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className={`${BTN_QUIET} max-sm:hidden`}
                  disabled={expanded.size === 0}
                >
                  折叠全部
                </button>
              </>
            ) : null}
            <button type="button" onClick={() => void handleCreate()} className={BTN_QUIET} disabled={busy}>
              <Plus size={14} strokeWidth={2} />
              新增
            </button>
          </>
        }
      />

      <TreeTableTabs tab={tab} onTabChange={setTab} />

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {loading && rows.length === 0 ? (
          <div className={CENTER_STATE}>
            <p className={LOADING_TEXT}>加载中…</p>
          </div>
        ) : rows.length === 0 ? (
          query ? (
            <ListEmptyState
              icon={SearchX}
              message="没有匹配的条目"
              action={{ label: '清除搜索', onClick: () => setSearch('') }}
            />
          ) : (
            <ListEmptyState
              icon={Table2}
              message={`还没有${ENTITY_LABEL[tab]}`}
              action={{ label: '新增', onClick: () => void handleCreate() }}
            />
          )
        ) : (
          <table
            className={`w-full border-collapse text-left text-[13px] ${
              tab === 'character' ? 'min-w-[880px]' : 'min-w-[680px]'
            }`}
          >
            <thead className="sticky top-0 z-10 bg-paper">
              <tr className="border-b border-line text-xs text-ink-faint">
                <th className="py-2 pl-6 font-normal">{tab === 'character' ? '角色 / 国家' : '名称'}</th>
                {tab === 'entry' ? <th className="w-48 py-2 pr-4 font-normal">分类</th> : null}
                {tab === 'country' ? <th className="w-48 py-2 pr-4 font-normal">体制</th> : null}
                {tab === 'event' ? <th className="w-44 py-2 pr-4 font-normal">时间</th> : null}
                {tab === 'character' ? (
                  <>
                    <th className="w-28 py-2 pr-3 font-normal">种族</th>
                    <th className="w-36 py-2 pr-3 font-normal">职业</th>
                    <th className="w-36 py-2 pr-4 font-normal">所属国家</th>
                  </>
                ) : null}
                <th className="w-44 py-2 pr-4 font-normal">标签</th>
                <th className="w-28 py-2 pr-6 font-normal">更新</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TreeTableRow
                  key={row.key}
                  row={row}
                  tab={tab}
                  tagsById={tagsById}
                  countryOptions={countryOptions}
                  busy={busy}
                  handlers={{
                    onOpen: handleOpen,
                    onToggle: toggle,
                    onAddChild: (target) => void handleAddChild(target),
                    onDelete: (target) => void handleDelete(target),
                    onEdit: handleEdit,
                    onSetCountry: handleSetCountry,
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
