'use client'

import { useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import {
  BUILTIN_FIELDS,
  FIELD_KINDS,
  FIELD_KIND_LABELS,
  FIELD_KIND_SUPPORTS_CUSTOM,
  isCustomField,
  newCustomFieldId,
  replaceFields,
  useFieldConfig,
  useOrphanFieldKeys,
  type FieldDef,
  type FieldKind,
} from '@/lib/fields'
import { defaultFields } from '@/lib/fields/defaults'
import { ICON_BTN, ROUND_ITEM } from '@/lib/ui-tokens'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { SettingsFieldRow } from './FieldRow'

/** 行实现统一在 `FieldRow.tsx`（列型 / 组件型共用一套语法） */
const FieldRow = SettingsFieldRow

function FieldGroup({ kind, showTitle = true }: { kind: FieldKind; showTitle?: boolean }) {
  const fields = useFieldConfig()[kind]
  const [draftName, setDraftName] = useState('')
  /** 数据里还在、表里已经没有的键：删了行不等于删了值，得留一条找回的路 */
  const { keys: orphanKeys } = useOrphanFieldKeys(kind, fields)

  const missing = BUILTIN_FIELDS[kind].filter(
    (builtin) => !fields.some((field) => field.id === builtin.id),
  )

  const commit = (next: FieldDef[]) => { void replaceFields(kind, next) }

  // 拖拽排序：只换位置，不碰字段定义
  const reorder = (activeId: number | string, overId: number | string) => {
    const nextIds = moveId(fields.map((field) => field.id), String(activeId), String(overId))
    const byId = new Map(fields.map((field) => [field.id, field]))
    commit(nextIds.map((id) => byId.get(id)).filter((field): field is FieldDef => field !== undefined))
  }

  const rename = (index: number, label: string) => {
    commit(fields.map((field, i) => (i === index ? { ...field, label } : field)))
  }

  const remove = (index: number) => {
    commit(fields.filter((_, i) => i !== index))
  }

  const addCustom = () => {
    const name = draftName.trim()
    if (name === '') return
    // 键就用这个名字：仓库里 frontmatter 直接能读，不用猜
    commit([...fields, { id: newCustomFieldId(), label: name, type: 'text', key: name }])
    setDraftName('')
  }

  return (
    <section className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
      {showTitle ? (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">{FIELD_KIND_LABELS[kind]}</h3>
          {missing.length > 0 ? (
            <button
              type="button"
              onClick={() => commit([...fields, ...missing])}
              className="flex items-center gap-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
            >
              <RotateCcw size={12} strokeWidth={2} />
              <span>加回 {missing.length} 项</span>
            </button>
          ) : null}
        </div>
      ) : missing.length > 0 ? (
        <button
          type="button"
          onClick={() => commit([...fields, ...missing])}
          className="flex items-center gap-1 self-start text-[11px] text-ink-muted transition-colors hover:text-ink"
        >
          <RotateCcw size={12} strokeWidth={2} />
          <span>加回 {missing.length} 项</span>
        </button>
      ) : null}

      {orphanKeys.length > 0 ? (
        <button
          type="button"
          onClick={() =>
            commit([
              ...fields,
              ...orphanKeys.map((key) => ({ id: newCustomFieldId(), label: key, type: 'text' as const, key })),
            ])
          }
          className="flex items-center gap-1 self-start text-[11px] text-ink-muted transition-colors hover:text-ink"
        >
          <Plus size={12} strokeWidth={2} />
          <span>找回 {orphanKeys.length} 个有数据的字段</span>
        </button>
      ) : null}

      <SortableList
        ids={fields.map((field) => field.id)}
        onReorder={reorder}
        layout="list"
      >
        <div className="flex flex-col">
          {fields.map((field, index) => (
            <SettingsFieldRow
              key={field.id}
              id={field.id}
              value={field.label}
              badge={isCustomField(field) ? '自建' : undefined}
              onRename={(label) => rename(index, label)}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      </SortableList>
      {fields.length === 0 ? (
        <p className="py-2 text-[12px] text-ink-faint">这一类还没有字段</p>
      ) : null}

      <div className="flex items-center gap-2">
        {FIELD_KIND_SUPPORTS_CUSTOM[kind] ? (
          <>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCustom() }}
              placeholder="新字段名"
              className="h-7 min-w-0 flex-1 border-b border-line bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:border-line-hover focus:outline-none"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={draftName.trim() === ''}
              className={`flex h-7 shrink-0 items-center gap-1 px-2 text-[12px] text-ink-muted transition-colors hover:text-ink disabled:opacity-40 ${ROUND_ITEM}`}
            >
              <Plus size={13} strokeWidth={2} />
              <span>添加</span>
            </button>
          </>
        ) : (
          <span className="text-[11px] text-ink-faint">这一类暂时只能增删内置字段</span>
        )}
      </div>
    </section>
  )
}

/**
 * 字段管理（设置 › 世界）。
 *
 * 改的是**这张表本身**：删一行表单一整行消失、加一行表单多一个输入框，
 * 对该类实体的所有条目立刻生效。删内置字段只删「行」，不值清数据。
 */
export function FieldSettings() {
  return (
    <div className="flex flex-col gap-4">
      {FIELD_KINDS.map((kind) => (
        <FieldKindSettings key={kind} kind={kind} />
      ))}
    </div>
  )
}

/**
 * 单类实体的字段表 —— 「基本信息」面板点进去的那一屏（见 `BasicInfoPanel`）。
 *
 * 与 `FieldSettings` 的区别只是不再自带宽标题：进去时标题已经在页头上，
 * 里面再写一遍「角色基本信息」就是同义反复。
 */
export function FieldKindSettings({ kind }: { kind: FieldKind }) {
  const config = useFieldConfig()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <FieldGroup kind={kind} showTitle={false} />
      {config[kind].length !== defaultFields(kind).length ? (
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          className="self-start text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          恢复默认字段
        </button>
      ) : null}

      {confirmReset ? (
        <div className={`flex items-center gap-2 border border-line px-2 py-1.5 text-[12px] text-ink-muted ${ROUND_ITEM}`}>
          <span>恢复默认字段？自建字段会保留。</span>
          <button
            type="button"
            onClick={() => {
              const kept = config[kind].filter(isCustomField)
              void replaceFields(kind, [...defaultFields(kind), ...kept])
              setConfirmReset(false)
            }}
            className="text-ink transition-colors hover:text-error"
          >
            恢复
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(false)}
            className="text-ink-faint transition-colors hover:text-ink"
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  )
}
