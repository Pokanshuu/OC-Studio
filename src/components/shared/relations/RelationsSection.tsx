'use client'

/**
 * 关系组件 —— 三个编辑器共用的**唯一实现**（`docs/模板.md §6.3`）。
 *
 * 同一份 `RelationRow[]` 有三种排法：
 * - 表格：对象 · 类型 · 关系 · ×（默认，宽栏）
 * - 紧凑：chip 流（窄栏 / 三栏中栏）
 * - 图：只读缩略（不是关系图页，见 `RelationGraphPreview`）
 *
 * 容器窄于 480px 时强制紧凑，切换按钮也收起来 —— 在一条 300px 的中栏里
 * 塞三列表格只会把关系名挤没。
 *
 * 空态只留标题行（§5.2）：内容高度 0，分隔线仍由外壳给。
 */
import { useEffect, useRef, useState } from 'react'
import { List, Network, Table2, X } from 'lucide-react'
import { RELATION_ARROWS, normalizeRelationArrow, type RelationArrow } from '@/lib/relation-colors'
import { MENU_ITEM_BASE, CHIP, ROUND_CONTROL, SECTION_TITLE_BARE } from '@/lib/ui-tokens'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import { RelationGraphPreview } from './RelationGraphPreview'
import { RelationPicker } from './RelationPicker'
import {
  RELATION_KIND_LABEL,
  type RelationCandidate,
  type RelationPresentation,
  type RelationRow,
  type RelationTargetKind,
} from './types'

interface RelationsSectionProps {
  rows: RelationRow[]
  /** 反查出来的关系（只读）：另起一组「来自」，不提供移除 */
  inbound?: RelationRow[]
  /** 候选由各编辑器给；笔记宿主的层级关系没有候选，也就不渲染「添加」 */
  candidates?: RelationCandidate[]
  presentation?: RelationPresentation
  showTitle?: boolean
  /** 模板参数 `relations.presentation` 的写回入口；不传 = 不显示切换 */
  onPresentationChange?: (next: RelationPresentation) => void
  onAdd?: (kind: RelationTargetKind, targetId: number) => void
  onRemove?: (row: RelationRow) => void
  onRename?: (row: RelationRow, value: string) => void
  /** 命名边的箭头：无 / 正向 / 反向 / 双向，写回同一条边的 `arrow` */
  onArrowChange?: (row: RelationRow, arrow: RelationArrow) => void
  onNavigate?: (kind: RelationTargetKind, targetId: number) => void
  /** 图呈现的中心节点名字 */
  selfName: string
}

/** 窄于这个宽度就只留紧凑态（三栏中栏 / 手机） */
const COMPACT_MAX_WIDTH = 480

const TABLE_HEAD =
  'pb-2 pr-4 text-left text-[11px] font-normal tracking-[0.14em] text-ink-faint'

const VIEW_BTN = `flex h-6 w-6 shrink-0 items-center justify-center transition-colors hover:bg-[var(--oc-hover)] ${ROUND_CONTROL}`

const VIEW_OPTIONS: { id: RelationPresentation; label: string; icon: typeof Table2 }[] = [
  { id: 'table', label: '表格', icon: Table2 },
  { id: 'compact', label: '紧凑', icon: List },
  { id: 'graph', label: '图', icon: Network },
]

/**
 * 命名边的方向钮：字形就是箭头本身，点开选四档。
 *
 * 角色↔角色默认双向、事件↔事件默认无箭头；成员 / 参与这类事实边不渲染它。
 * 反查行（「来自」）只显示字形，改的是另一侧的边。
 */
function RelationArrowControl({
  row,
  editable,
  onChange,
}: {
  row: RelationRow
  editable: boolean
  onChange?: (arrow: RelationArrow) => void
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const value = normalizeRelationArrow(row.arrow, row.defaultArrow ?? 'none')
  const current = RELATION_ARROWS.find((option) => option.value === value) ?? RELATION_ARROWS[0]
  const label = `箭头：${current.label}`

  if (!editable || onChange === undefined) {
    return (
      <span
        title={label}
        aria-label={label}
        className="w-5 shrink-0 text-center text-[12px] leading-none text-ink-faint"
      >
        {current.glyph}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={at !== null}
        title={label}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAt({ x: rect.left, y: rect.bottom + 4 })
        }}
        className={`w-5 shrink-0 text-center text-[12px] leading-none text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink active:bg-[var(--oc-hover)] ${ROUND_CONTROL}`}
      >
        {current.glyph}
      </button>
      {at !== null ? (
        <MenuSurface at={at} onClose={() => setAt(null)} width={132} role="dialog" ariaLabel="箭头方向">
          {RELATION_ARROWS.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onChange(option.value)
                  setAt(null)
                }}
                className={`${MENU_ITEM_BASE} justify-between ${
                  selected
                    ? 'bg-[var(--oc-hover)] text-ink'
                    : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                }`}
              >
                <span>{option.label}</span>
                <span className="tabular-nums text-ink-faint">{option.glyph}</span>
              </button>
            )
          })}
        </MenuSurface>
      ) : null}
    </>
  )
}

function RelationName({
  row,
  onNavigate,
}: {
  row: RelationRow
  onNavigate?: (kind: RelationTargetKind, targetId: number) => void
}) {
  const text = row.name || '未命名'
  if (row.targetId === undefined || onNavigate === undefined) {
    return <span className="block truncate font-serif text-[13px] text-ink">{text}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(row.kind, row.targetId as number)}
      className="block max-w-full truncate font-serif text-[13px] text-ink transition-colors hover:text-ink-muted"
    >
      {text}
    </button>
  )
}

function RelationTable({
  rows,
  withHeader,
  withRemove,
  onRemove,
  onRename,
  onArrowChange,
  onNavigate,
}: {
  rows: RelationRow[]
  withHeader: boolean
  withRemove: boolean
  onRemove?: (row: RelationRow) => void
  onRename?: (row: RelationRow, value: string) => void
  onArrowChange?: (row: RelationRow, arrow: RelationArrow) => void
  onNavigate?: (kind: RelationTargetKind, targetId: number) => void
}) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col />
        <col className="w-20" />
        <col className="w-40" />
      </colgroup>
      {withHeader ? (
        <thead>
          <tr>
            <th className={TABLE_HEAD}>对象</th>
            <th className={TABLE_HEAD}>类型</th>
            <th className={`${TABLE_HEAD} pr-0 text-right`}>关系</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-line">
            <td className="py-2 pr-4">
              <RelationName row={row} onNavigate={onNavigate} />
            </td>
            <td className="py-2 pr-4 text-[13px] text-ink-muted">
              {row.kindLabel ?? RELATION_KIND_LABEL[row.kind]}
            </td>
            <td className="py-2">
              <div className="flex items-center justify-end gap-2">
                {row.directional ? (
                  <RelationArrowControl
                    row={row}
                    editable={!row.readonly && onArrowChange !== undefined}
                    onChange={onArrowChange === undefined ? undefined : (arrow) => onArrowChange(row, arrow)}
                  />
                ) : null}
                {row.relationEditable && onRename !== undefined ? (
                  <input
                    type="text"
                    value={row.relation}
                    onChange={(event) => onRename(row, event.target.value)}
                    placeholder="关系"
                    aria-label={`${row.name}的关系`}
                    className={`${row.directional ? 'w-24' : 'w-32'} bg-transparent text-right text-[13px] text-ink placeholder:text-ink-faint focus:outline-none`}
                  />
                ) : (
                  <span className="text-[13px] text-ink-muted">{row.relation}</span>
                )}
                {withRemove && !row.readonly && onRemove !== undefined ? (
                  <button
                    type="button"
                    onClick={() => onRemove(row)}
                    aria-label={`移除 ${row.name}`}
                    title="移除"
                    className="shrink-0 text-ink-faint transition-colors hover:text-error"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RelationChips({
  rows,
  withRemove,
  onRemove,
  onRename,
  onArrowChange,
  onNavigate,
}: {
  rows: RelationRow[]
  withRemove: boolean
  onRemove?: (row: RelationRow) => void
  onRename?: (row: RelationRow, value: string) => void
  onArrowChange?: (row: RelationRow, arrow: RelationArrow) => void
  onNavigate?: (kind: RelationTargetKind, targetId: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((row) => (
        <span key={row.key} className={`${CHIP} text-ink`}>
          {row.targetId !== undefined && onNavigate !== undefined ? (
            <button
              type="button"
              onClick={() => onNavigate(row.kind, row.targetId as number)}
              title={row.name}
              className="max-w-[10rem] truncate transition-colors hover:text-ink"
            >
              {row.name}
            </button>
          ) : (
            <span className="max-w-[10rem] truncate">{row.name}</span>
          )}
          {row.directional ? (
            <RelationArrowControl
              row={row}
              editable={!row.readonly && onArrowChange !== undefined}
              onChange={onArrowChange === undefined ? undefined : (arrow) => onArrowChange(row, arrow)}
            />
          ) : null}
          {row.relationEditable && onRename !== undefined ? (
            <input
              type="text"
              value={row.relation}
              onChange={(event) => onRename(row, event.target.value)}
              placeholder="关系"
              aria-label={`${row.name}的关系`}
              className="w-16 bg-transparent text-[12px] text-ink-muted placeholder:text-ink-faint focus:outline-none"
            />
          ) : row.relation ? (
            <span className="text-[11px] text-ink-faint">{row.relation}</span>
          ) : null}
          {withRemove && !row.readonly && onRemove !== undefined ? (
            <button
              type="button"
              onClick={() => onRemove(row)}
              aria-label={`移除 ${row.name}`}
              className="ml-0.5 shrink-0 text-ink-faint transition-colors hover:text-error"
            >
              <X size={11} strokeWidth={2} />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  )
}

export function RelationsSection({
  rows,
  inbound = [],
  candidates = [],
  presentation = 'table',
  showTitle = true,
  onPresentationChange,
  onAdd,
  onRemove,
  onRename,
  onArrowChange,
  onNavigate,
  selfName,
}: RelationsSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)

  // 窄栏强制紧凑：宽度来自实际容器，不靠 viewport 断点（三栏中栏与整宽编辑器同屏）
  useEffect(() => {
    const element = sectionRef.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0
      setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const forcedCompact = width > 0 && width < COMPACT_MAX_WIDTH
  const active = forcedCompact ? 'compact' : presentation
  const hasContent = rows.length > 0 || inbound.length > 0
  const canSwitch = onPresentationChange !== undefined && !forcedCompact

  return (
    <section ref={sectionRef} className="group/relations">
      <div
        className={`flex items-center gap-4 ${hasContent ? 'mb-3' : ''} ${
          showTitle ? 'justify-between' : 'justify-end'
        }`}
      >
        {showTitle ? <h3 className={SECTION_TITLE_BARE}>关系</h3> : null}
        <div className="flex shrink-0 items-center gap-2">
          {canSwitch ? (
            <div className="pointer-events-none flex items-center gap-0.5 opacity-0 transition-opacity group-hover/relations:pointer-events-auto group-hover/relations:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
              {VIEW_OPTIONS.map((option) => {
                const Icon = option.icon
                const selected = active === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onPresentationChange(option.id)}
                    aria-label={option.label}
                    aria-pressed={selected}
                    title={option.label}
                    className={`${VIEW_BTN} ${selected ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
                  >
                    <Icon size={13} strokeWidth={2} />
                  </button>
                )
              })}
            </div>
          ) : null}
          {onAdd && candidates.length > 0 ? (
            <RelationPicker
              candidates={candidates}
              onPick={(candidate) => onAdd(candidate.kind, candidate.targetId)}
            />
          ) : null}
        </div>
      </div>

      {hasContent ? (
        active === 'graph' ? (
          <RelationGraphPreview
            rows={rows}
            inbound={inbound}
            selfName={selfName}
            onNavigate={onNavigate}
          />
        ) : active === 'compact' ? (
          <div className="flex flex-col gap-3">
            {rows.length > 0 ? (
              <RelationChips
                rows={rows}
                withRemove
                onRemove={onRemove}
                onRename={onRename}
                onArrowChange={onArrowChange}
                onNavigate={onNavigate}
              />
            ) : null}
            {inbound.length > 0 ? (
              <div>
                <h4 className="mb-2 text-[11px] tracking-[0.08em] text-ink-faint">来自</h4>
                <RelationChips
                  rows={inbound}
                  withRemove={false}
                  onArrowChange={onArrowChange}
                  onNavigate={onNavigate}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            {rows.length > 0 ? (
              <RelationTable
                rows={rows}
                withHeader
                withRemove
                onRemove={onRemove}
                onRename={onRename}
                onArrowChange={onArrowChange}
                onNavigate={onNavigate}
              />
            ) : null}
            {inbound.length > 0 ? (
              <div className={rows.length > 0 ? 'mt-4' : ''}>
                <h4 className="mb-2 text-[11px] tracking-[0.08em] text-ink-faint">来自</h4>
                <RelationTable
                  rows={inbound}
                  withHeader={rows.length === 0}
                  withRemove={false}
                  onArrowChange={onArrowChange}
                  onNavigate={onNavigate}
                />
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  )
}
