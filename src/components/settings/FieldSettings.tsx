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
  type FieldDef,
  type FieldKind,
} from '@/lib/fields'
import { defaultFields } from '@/lib/fields/defaults'
import { ICON_BTN, ROUND_ITEM } from '@/lib/ui-tokens'
import { DragHandle, SortableList, moveId, useSortableItem } from '@/components/shared/list-dnd'

/** 一行：拖左侧手柄排序、显示名可直接改（Enter / 失焦生效）、删除 */
function FieldRow({
  field,
  onRename,
  onRemove,
}: {
  field: FieldDef
  onRename: (label: string) => void
  onRemove: () => void
}) {
  const [label, setLabel] = useState(field.label)
  const { setNodeRef, style, attributes, listeners } = useSortableItem(field.id, false)

  const commit = () => {
    const next = label.trim()
    if (next === '' || next === field.label) {
      setLabel(field.label)
      return
    }
    onRename(next)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 border-b border-line py-1 last:border-b-0"
    >
      <DragHandle handleProps={{ attributes, listeners }} />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setLabel(field.label)
        }}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-ink focus:outline-none"
      />
      {isCustomField(field) ? (
        <span className="shrink-0 text-[11px] text-ink-faint">自建</span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`删除字段「${field.label}」`}
        className={`${ICON_BTN} hover:text-error`}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

function FieldGroup({ kind }: { kind: FieldKind }) {
  const fields = useFieldConfig()[kind]
  const [draftName, setDraftName] = useState('')

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

      <SortableList
        ids={fields.map((field) => field.id)}
        onReorder={reorder}
        layout="list"
      >
        <div className="flex flex-col">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
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
  const config = useFieldConfig()
  const [confirmReset, setConfirmReset] = useState<FieldKind | null>(null)

  return (
    <div className="flex flex-col gap-4">
      {FIELD_KINDS.map((kind) => (
        <div key={kind} className="flex flex-col gap-1">
          <FieldGroup kind={kind} />
          {config[kind].length !== defaultFields(kind).length ? (
            <button
              type="button"
              onClick={() => setConfirmReset(kind)}
              className="self-start text-[11px] text-ink-faint transition-colors hover:text-ink"
            >
              恢复默认字段
            </button>
          ) : null}
        </div>
      ))}

      {confirmReset !== null ? (
        <div className={`flex items-center gap-2 border border-line px-2 py-1.5 text-[12px] text-ink-muted ${ROUND_ITEM}`}>
          <span>恢复「{FIELD_KIND_LABELS[confirmReset]}」默认字段？自建字段会保留。</span>
          <button
            type="button"
            onClick={() => {
              const kept = config[confirmReset].filter(isCustomField)
              void replaceFields(confirmReset, [...defaultFields(confirmReset), ...kept])
              setConfirmReset(null)
            }}
            className="text-ink transition-colors hover:text-error"
          >
            恢复
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(null)}
            className="text-ink-faint transition-colors hover:text-ink"
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  )
}
