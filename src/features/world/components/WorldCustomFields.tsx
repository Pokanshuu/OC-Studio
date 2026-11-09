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
 *
 * 特殊字段（时间 / 结束时间 / 地点）是例外的一小撮：控件是年 / 月 / 日三段与单行，
 * 但值**不落 `custom`**，直接写词条的 `time` / `endTime` / `location` 列 ——
 * 「基本信息里的一行」和「时间线读的那份数据」因此仍是同一个东西。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { useFields, type FieldDef } from '@/lib/fields'
import {
  INFO_FIELD_TYPE_LABELS,
  infoFieldColumnOf,
  type InfoFieldType,
} from '@/lib/templates/info-groups'
import { assembleTime, parseTime, type ParsedTime } from '@/lib/time-field'
import { Checkbox } from '@/components/ui/checkbox'
import { TimeTrio, type TimePart } from '@/components/shared/TimeTrio'
import { updateEntry } from '@/features/world/services'
import type { WorldFormData } from '@/features/world/types'
import { FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'
import { ComponentEditButton } from '@/components/shared/ComponentEdit'

/**
 * 通用字段的控件。类型来自模板选中的基本信息组件（`InfoGroup.types`）：
 * 单行 / 数字 / 日期 / 开关 —— 只这四种。
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

  const [custom, setCustom] = useState<Record<string, string>>(() => ({ ...(entry.custom ?? {}) }))
  const [start, setStart] = useState<ParsedTime>(() => parseTime(entry.time ?? ''))
  const [end, setEnd] = useState<ParsedTime>(() => parseTime(entry.endTime ?? ''))
  const [place, setPlace] = useState(entry.location ?? '')
  const customRef = useRef<Record<string, string>>(custom)

  /**
   * 防抖写库：同一批字段合并成一次 update；切条目 / 卸载时补最后一笔。
   * 自定义字段与特殊字段走同一个补丁对象 —— 它们最终都是 `updateEntry` 的一次 patch。
   */
  const pending = useRef<Partial<WorldFormData>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length === 0) return
    try {
      await updateEntry(entry.id, patch)
    } catch (err) {
      toast.error('字段保存失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }, [entry.id])

  const schedule = useCallback((patch: Partial<WorldFormData>) => {
    pending.current = { ...pending.current, ...patch }
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void flush()
    }, 700)
  }, [flush])

  // 切条目 / 卸载时把防抖中的值补上
  useEffect(() => {
    return () => {
      void flush()
    }
  }, [flush])

  const changeCustom = (key: string, value: string): void => {
    const next = { ...customRef.current, [key]: value }
    customRef.current = next
    setCustom(next)
    schedule({ custom: next })
  }

  const changeTime = (which: 'start' | 'end', part: TimePart, value: string): void => {
    if (which === 'start') {
      const next = { ...start, [part]: value }
      setStart(next)
      schedule({ time: assembleTime(next.year, next.month, next.day) })
      return
    }
    const next = { ...end, [part]: value }
    setEnd(next)
    schedule({ endTime: assembleTime(next.year, next.month, next.day) })
  }

  // 模板声明了一份**空组件**（选了个还没加字段的基本信息组件）时仍要画：
  // 不画的话，写作面上连「这里该有字段」都看不出来，也没有跳去加字段的设置键。
  // 真正该藏的是「没有组件、也没有旧字段」的旧模板（`fieldKeys === undefined`）。
  const declaredEmpty = fieldKeys !== undefined && fieldKeys.length === 0
  if (fields.length === 0 && !declaredEmpty) return null

  const rows = fields.flatMap((field) => {
    const key = field.key
    if (key === undefined) return []
    const type = fieldTypes?.[key] ?? 'text'
    return [{ field, key, type }]
  })

  const labelOf = (row: { key: string; type: InfoFieldType; field: FieldDef }): string => {
    const custom = fieldLabels?.[row.key]
    if (custom !== undefined) return custom
    // 特殊字段的键只是行身份（`time` / `endTime` / `location`），给人看的是类型名
    return infoFieldColumnOf(row.type) === undefined ? row.field.label : INFO_FIELD_TYPE_LABELS[row.type]
  }

  return (
    <section className="group">
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_TITLE}>基本信息</h3>
        <ComponentEditButton componentId="info" />
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-ink-faint">这个基本信息组件还没有字段。</p>
      ) : null}
      <div className={`grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`}>
        {rows.map((row) => {
          const label = labelOf(row)
          if (row.type === 'time' || row.type === 'timeEnd') {
            return (
              <div key={row.field.id} className={FIELD_ROW}>
                <span className={FIELD_LABEL}>{label}</span>
                <TimeTrio
                  values={row.type === 'time' ? start : end}
                  onChange={(part, value) => changeTime(row.type === 'time' ? 'start' : 'end', part, value)}
                />
              </div>
            )
          }
          if (row.type === 'place') {
            return (
              <div key={row.field.id} className={FIELD_ROW}>
                <span className={FIELD_LABEL}>{label}</span>
                <input
                  type="text"
                  value={place}
                  onChange={(event) => {
                    setPlace(event.target.value)
                    schedule({ location: event.target.value })
                  }}
                  className={FIELD_INPUT}
                />
              </div>
            )
          }
          return (
            <div key={row.field.id} className={FIELD_ROW}>
              <span className={FIELD_LABEL}>{label}</span>
              <FieldControl
                type={row.type}
                value={custom[row.key] ?? ''}
                onChange={(next) => changeCustom(row.key, next)}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
