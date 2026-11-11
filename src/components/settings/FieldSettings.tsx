'use client'

import { useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import {
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
import { defaultFields, missingBuiltinFields } from '@/lib/fields/defaults'
import { ROUND_ITEM, SETTINGS_EMPTY } from '@/lib/ui-tokens'
import { SortableList, moveId } from '@/components/shared/list-dnd'
import { SettingsFieldRow } from './FieldRow'
import { isImeComposing } from '@/lib/ime'

/** 行实现统一在 `FieldRow.tsx`（列型 / 组件型共用一套语法） */

function FieldGroup({ kind, showTitle = true }: { kind: FieldKind; showTitle?: boolean }) {
  const fields = useFieldConfig()[kind]
  const [draftName, setDraftName] = useState('')
  /** 数据里还在、表里已经没有的键：删了行不等于删了值，得留一条找回的路 */
  const { keys: orphanKeys } = useOrphanFieldKeys(kind, fields)

  /** 删掉的内置字段：给一条找回的路（自建字段不会被加回，它们是用户自己加的） */
  const missing = missingBuiltinFields(kind, fields)

  /**
   * 保存字段表（改名 / 增删 / 排序 / 恢复默认全走这里）。
   *
   * 以前是裸 `void replaceFields(...)`：写盘失败（或读失败被拒绝写回）只留一条
   * unhandled rejection，界面照旧显示新字段表 —— 用户以为改好了，刷新就回去了。
   */
  const commit = (next: FieldDef[]) => {
    void replaceFields(kind, next).catch((error: unknown) => {
      toast.error('字段表保存失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    })
  }

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
              title={missing.map((field) => field.label).join('、')}
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
          title={missing.map((field) => field.label).join('、')}
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
      {fields.length === 0 ? <p className={SETTINGS_EMPTY}>这一类还没有字段</p> : null}

      <div className="flex items-center gap-2">
        {FIELD_KIND_SUPPORTS_CUSTOM[kind] ? (
          <>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (isImeComposing(e)) return; if (e.key === 'Enter') addCustom() }}
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
 * 单类实体的字段表 —— 「基本信息」面板点进去的那一屏（见 `BasicInfoPanel`）。
 *
 * 与 `FieldSettings` 的区别只是不再自带宽标题：进去时标题已经在页头上，
 * 里面再写一遍「角色基本信息」就是同义反复。
 */
export function FieldKindSettings({ kind }: { kind: FieldKind }) {
  const config = useFieldConfig()
  const [confirmReset, setConfirmReset] = useState(false)
  /** 内置部分（顺序 / 显示名 / 有没有少）与出厂不一致才给「恢复默认」 */
  const builtinShape = (fields: readonly FieldDef[]): string =>
    JSON.stringify(fields.filter((field) => !isCustomField(field)).map((field) => [field.id, field.label]))
  const resetAvailable = builtinShape(config[kind]) !== builtinShape(defaultFields(kind))

  return (
    <div className="flex flex-col gap-1">
      <FieldGroup kind={kind} showTitle={false} />
      {resetAvailable ? (
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
              void replaceFields(kind, [...defaultFields(kind), ...kept]).catch((error: unknown) => {
                toast.error('恢复默认字段失败', {
                  description: error instanceof Error ? error.message : String(error),
                })
              })
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
