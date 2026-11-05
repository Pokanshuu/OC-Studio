'use client'

/**
 * 树形表格的一行（按页签决定列）。
 *
 * - 名称列：缩进 + 展开箭头 + 类型图标 + **就地编辑**（见 `EditableCell`）
 * - 名称列右侧：悬停出现「新增子项 / 删除」。放在行内而不是工具栏，是因为
 *   整行点击已经用来打开编辑器了 —— 再引入一套「选中行 → 工具栏操作」会和它打架
 * - 标签列：真标签名 + 颜色（`TagBadge`），不再是「3」这种计数
 */
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, Flag, Plus, Users } from 'lucide-react'
import type { Tag } from '@/types'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { FilterSelect, type FilterOption } from '@/components/shared/FilterSelect'
import { ICON_BTN, MENU, ROUND_ITEM } from '@/lib/ui-tokens'
import { TagBadge } from '@/features/tags/components/TagBadge'
import { EditableCell } from './EditableCell'
import { cellText, type RowKind, type TreeRow } from '../tree-table-rows'
import type { TreeTableTab } from '../tree-table-tabs'

/** 能就地改的字段；其余（体制 / 分类 / 时间）可能是富文本，改回各自编辑器 */
export type EditableField = 'title' | 'name' | 'race' | 'occupation'

export interface TreeTableRowHandlers {
  /** 点整行：实体 → 打开编辑器；国家分组 → 展开 / 收起 */
  onOpen: (row: TreeRow) => void
  onToggle: (key: string) => void
  onAddChild: (row: TreeRow) => void
  onDelete: (row: TreeRow) => void
  onEdit: (row: TreeRow, field: EditableField, value: string) => Promise<void>
  onSetCountry: (row: TreeRow, countryId: number | null) => Promise<void>
}

interface TreeTableRowProps {
  row: TreeRow
  tab: TreeTableTab
  tagsById: Map<number, Tag>
  countryOptions: FilterOption<number | 'none'>[]
  busy: boolean
  handlers: TreeTableRowHandlers
}

function KindIcon({ kind }: { kind: RowKind }) {
  const className = 'h-3 w-3 shrink-0 text-ink-faint'
  if (kind === 'entry') return <BookOpen size={12} strokeWidth={2} className={className} aria-hidden />
  if (kind === 'country' || kind === 'group') {
    return <Flag size={12} strokeWidth={2} className={className} aria-hidden />
  }
  if (kind === 'character') return <Users size={12} strokeWidth={2} className={className} aria-hidden />
  return <CalendarDays size={12} strokeWidth={2} className={className} aria-hidden />
}

function formatDate(value: number | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function tagsOf(row: TreeRow): number[] {
  return row.entry?.tags ?? row.country?.tags ?? row.character?.tags ?? row.event?.tags ?? []
}

function updatedAtOf(row: TreeRow): number | undefined {
  return (
    row.entry?.updatedAt ??
    row.country?.updatedAt ??
    row.character?.updatedAt ??
    row.event?.updatedAt
  )
}

function labelOf(row: TreeRow): string {
  return row.entry?.title ?? row.country?.name ?? row.character?.name ?? row.event?.title ?? row.label
}

function TagCell({ ids, tagsById }: { ids: number[]; tagsById: Map<number, Tag> }) {
  const resolved = ids
    .map((id) => tagsById.get(id))
    .filter((tag): tag is Tag => tag !== undefined)
  if (resolved.length === 0) return <span className="text-ink-faint">—</span>
  const shown = resolved.slice(0, 3)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <TagBadge key={tag.id} tag={tag} />
      ))}
      {resolved.length > shown.length ? (
        <span className="text-[11px] tabular-nums text-ink-faint">+{resolved.length - shown.length}</span>
      ) : null}
    </span>
  )
}

export function TreeTableRow({
  row,
  tab,
  tagsById,
  countryOptions,
  busy,
  handlers,
}: TreeTableRowProps) {
  const canAddChild = row.kind !== 'event' && !(row.kind === 'group' && row.countryId == null)
  const canDelete = row.kind !== 'group'

  return (
    <tr
      tabIndex={0}
      onClick={() => handlers.onOpen(row)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handlers.onOpen(row)
        }
      }}
      className="group row-rule cursor-pointer transition-colors hover:bg-[var(--oc-hover)] focus:outline-none focus-visible:bg-[var(--oc-hover)]"
    >
      <td className="py-1.5 pl-6">
        <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: row.depth * 18 }}>
          {row.hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                handlers.onToggle(row.key)
              }}
              className={`flex h-5 w-5 shrink-0 items-center justify-center text-ink-faint hover:text-ink ${ROUND_ITEM}`}
              aria-label={row.expanded ? '折叠' : '展开'}
              aria-expanded={row.expanded}
            >
              {row.expanded ? (
                <ChevronDown size={13} strokeWidth={2} />
              ) : (
                <ChevronRight size={13} strokeWidth={2} />
              )}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden />
          )}

          <KindIcon kind={row.kind} />

          {row.kind === 'group' ? (
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
              {row.label}
              <span className="ml-1.5 text-[11px] tabular-nums text-ink-faint">{row.childCount}</span>
            </span>
          ) : (
            <EditableCell
              value={labelOf(row)}
              label={
                row.kind === 'entry'
                  ? '词条标题'
                  : row.kind === 'country'
                    ? '国家名'
                    : row.kind === 'character'
                      ? '角色名'
                      : '事件标题'
              }
              className="min-w-0 flex-1"
              onCommit={(value) =>
                handlers.onEdit(row, row.kind === 'entry' || row.kind === 'event' ? 'title' : 'name', value)
              }
            />
          )}

          <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            {canAddChild ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  handlers.onAddChild(row)
                }}
                disabled={busy}
                className={`${ICON_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
                title="新增子项"
                aria-label="新增子项"
              >
                <Plus size={13} strokeWidth={2} />
              </button>
            ) : null}
            {canDelete ? <DeleteButton onDelete={() => handlers.onDelete(row)} /> : null}
          </div>
        </div>
      </td>

      {tab === 'entry' ? (
        <td className="py-1.5 pr-4 text-ink-muted">{cellText(row.entry?.category) || '—'}</td>
      ) : null}

      {tab === 'country' ? (
        <td className="py-1.5 pr-4 text-ink-muted">{cellText(row.country?.system) || '—'}</td>
      ) : null}

      {tab === 'event' ? (
        <td className="py-1.5 pr-4 text-ink-muted">{cellText(row.event?.time) || '—'}</td>
      ) : null}

      {tab === 'character' ? (
        <>
          <td className="py-1.5 pr-3">
            {row.character ? (
              <EditableCell
                value={cellText(row.character.race)}
                label="种族"
                className="w-full"
                onCommit={(value) => handlers.onEdit(row, 'race', value)}
              />
            ) : null}
          </td>
          <td className="py-1.5 pr-3">
            {row.character ? (
              <EditableCell
                value={cellText(row.character.occupation)}
                label="职业"
                className="w-full"
                onCommit={(value) => handlers.onEdit(row, 'occupation', value)}
              />
            ) : null}
          </td>
          <td className="py-1.5 pr-4" onClick={(event) => event.stopPropagation()}>
            {row.character ? (
              <FilterSelect<number | 'none'>
                value={row.character.countryId ?? 'none'}
                onChange={(value) => {
                  void handlers.onSetCountry(row, value === 'none' ? null : value)
                }}
                options={countryOptions}
                fallbackLabel="未归属"
                triggerClassName={`flex h-7 w-full min-w-0 items-center gap-1 px-1 text-left text-[13px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM}`}
                labelClassName="min-w-0 flex-1 truncate"
                chevronSize={12}
                panelClassName={`fixed z-30 mt-1 flex flex-col overflow-auto ${MENU} w-48 pointer-events-auto`}
              />
            ) : null}
          </td>
        </>
      ) : null}

      <td className="py-1.5 pr-4">
        <TagCell ids={tagsOf(row)} tagsById={tagsById} />
      </td>
      <td className="py-1.5 pr-6 text-ink-faint tabular-nums">{formatDate(updatedAtOf(row))}</td>
    </tr>
  )
}
