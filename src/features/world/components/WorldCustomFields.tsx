'use client'

/**
 * 词条的自定义字段（「基本信息」小节）。
 *
 * 字段表在 设置 › 世界 › 基本信息组件 里维护；这里只渲染
 * `WorldEntry.custom` 对应的那几行。分类条目（宠物 / 武器）也用它补字段，
 * 因此编辑器和分类编辑器共用同一份实现，不各写一套。
 *
 * 版式跟实体编辑器（角色基本信息）一字不差：`SECTION_TITLE` + 宽栏两列
 * （`FIELD_GRID` + `gap-x-10`），窄屏回落单列。
 *
 * **只有单行控件**：长文本归正文组件。这里若开多行框，等于在正文旁边再造
 * 一份长篇正文 —— 两边各写各的，写的人自己都不知道该写哪边。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { useFields, type FieldDef } from '@/lib/fields'
import type { InfoFieldType } from '@/lib/templates/info-groups'
import { Checkbox } from '@/components/ui/checkbox'
import { updateEntry } from '@/features/world/services'
import { FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'
import { ComponentEditButton } from '@/components/shared/ComponentEdit'

/**
 * 一个字段的控件。类型来自模板选中的基本信息组件（`InfoGroup.types`）：
 * 单行 / 数字 / 日期 / 开关 —— 只这四种，别在这里悄悄长出第五种。
 *
 * 值一律存字符串（`WorldEntry.custom` 是 `Record<string,string>`）：
 * 开关存 `'true' | 'false'`，日期存 `YYYY-MM-DD`，数字存原始文本（不做运算，只做录入）。
 */
function FieldControl({
  type,
  value,
  onChange,
}: {
  type: InfoFieldType
  value: string
  onChange: (next: string) => void
}) {
  if (type === 'boolean') {
    return (
      <Checkbox checked={value === 'true'} onCheckedChange={(checked) => onChange(checked === true ? 'true' : 'false')} />
    )
  }
  return (
    <input
      type="text"
      value={value}
      inputMode={type === 'number' ? 'decimal' : undefined}
      placeholder={type === 'date' ? 'YYYY-MM-DD' : undefined}
      onChange={(event) => onChange(event.target.value)}
      className={FIELD_INPUT}
    />
  )
}

export function WorldCustomFields({
  entry,
  fieldKeys,
  fieldTypes,
  fieldLabels,
}: {
  entry: WorldEntry
  fieldKeys?: string[]
  /** 模板里选的字段类型（笔记型组件才有）；缺省一律单行 */
  fieldTypes?: Record<string, InfoFieldType>
  /** 模板里设的显示名（键 → 名字）；缺省用字段键 */
  fieldLabels?: Record<string, string>
}) {
  const configured = useFields('worldEntry').filter((field) => field.key !== undefined)
  /** 模板声明了字段就只显示那几行；没声明时回落到字段表里的全部自定义字段 */
  const fields = useMemo<FieldDef[]>(() => {
    if (fieldKeys === undefined) return configured
    const byKey = new Map(configured.map((field) => [field.key as string, field]))
    return fieldKeys.map(
      (key): FieldDef => byKey.get(key) ?? { id: `template-${key}`, label: key, type: 'text', key },
    )
  }, [configured, fieldKeys])
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(entry.custom ?? {}) }))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef(values)
  const savedRef = useRef<Record<string, string>>({ ...(entry.custom ?? {}) })

  const flush = useCallback(async (next: Record<string, string>) => {
    if (JSON.stringify(next) === JSON.stringify(savedRef.current)) return
    try {
      await updateEntry(entry.id, { custom: next })
      savedRef.current = next
    } catch (err) {
      toast.error('字段保存失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }, [entry.id])

  const handleChange = (key: string, value: string): void => {
    const next = { ...latestRef.current, [key]: value }
    latestRef.current = next
    setValues(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void flush(latestRef.current)
    }, 700)
  }

  // 切条目 / 卸载时把防抖中的值补上
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      void flush(latestRef.current)
    }
  }, [flush])

  if (fields.length === 0) return null

  const rows = fields.flatMap((field) => {
    const key = field.key
    if (key === undefined) return []
    return [{ field, key, type: fieldTypes?.[key] ?? ('text' as InfoFieldType) }]
  })

  return (
    <section className="group">
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_TITLE}>基本信息</h3>
        <ComponentEditButton componentId="info" />
      </div>
      <div className={`grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`}>
        {rows.map((row) => (
          <div key={row.field.id} className={FIELD_ROW}>
            <span className={FIELD_LABEL}>{fieldLabels?.[row.key] ?? row.field.label}</span>
            <FieldControl
              type={row.type}
              value={values[row.key] ?? ''}
              onChange={(next) => handleChange(row.key, next)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
