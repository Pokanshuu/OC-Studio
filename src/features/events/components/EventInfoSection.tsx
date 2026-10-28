'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { DATE_INPUT, FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'
import { BUILTIN_FIELDS, replaceFields, useFields, type FieldDef } from '@/lib/fields'
import { defaultFields } from '@/lib/fields/defaults'
import type { EventForm } from '../hooks/useEventForm'

/**
 * 基本信息 —— 按字段表渲染（`设置 › 世界 › 事件信息`）。
 * 开始 / 结束各占一格（三个输入），地点 / 重大各占一格，自定义字段各占一格。
 * 标签那一行归「关联」区，这里跳过。
 */
export function EventInfoSection({ form }: { form: EventForm }) {
  const fields = useFields('event')
  const hiddenBuiltins = BUILTIN_FIELDS.event.filter(
    (builtin) => !fields.some((field) => field.id === builtin.id),
  )

  const renderRow = (field: FieldDef) => {
    if (field.id === 'time' || field.id === 'endTime') {
      const isEnd = field.id === 'endTime'
      const year = isEnd ? form.endYear : form.year
      const month = isEnd ? form.endMonth : form.month
      const day = isEnd ? form.endDay : form.day
      const setYear = isEnd ? form.setEndYear : form.setYear
      const setMonth = isEnd ? form.setEndMonth : form.setMonth
      const setDay = isEnd ? form.setEndDay : form.setDay
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="年" className={DATE_INPUT} />
            <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="月" className={DATE_INPUT} />
            <input value={day} onChange={(e) => setDay(e.target.value)} placeholder="日" className={DATE_INPUT} />
          </div>
        </div>
      )
    }

    if (field.id === 'isMajor') {
      return (
        <label key={field.id} className={`${FIELD_ROW} cursor-pointer`}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <Checkbox
            checked={form.isMajor}
            onCheckedChange={(checked) => form.setIsMajor(checked === true)}
          />
        </label>
      )
    }

    if (field.id === 'location') {
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <input
            type="text"
            value={form.location}
            onChange={(e) => form.setLocation(e.target.value)}
            placeholder="地点"
            className={FIELD_INPUT}
          />
        </div>
      )
    }

    // 标签归「关联」区渲染
    if (field.id === 'tags') return null

    const key = field.key ?? field.id
    return (
      <div key={field.id} className={FIELD_ROW}>
        <span className={FIELD_LABEL}>{field.label}</span>
        <input
          type="text"
          value={form.custom[key] ?? ''}
          onChange={(e) => form.setCustomValue(key, e.target.value)}
          className={FIELD_INPUT}
        />
      </div>
    )
  }

  const restoreHidden = () => {
    const custom = fields.filter((field) => !BUILTIN_FIELDS.event.some((b) => b.id === field.id))
    void replaceFields('event', [...defaultFields('event'), ...custom])
  }

  return (
    <section>
      <h3 className={SECTION_TITLE}>基本信息</h3>
      <div className={`grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`}>
        {fields.map(renderRow)}
      </div>
      {hiddenBuiltins.length > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[12px] text-ink-faint">
          <span>已隐藏：{hiddenBuiltins.map((field) => field.label).join('、')}</span>
          <button
            type="button"
            onClick={restoreHidden}
            className="text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            全部显示
          </button>
        </p>
      ) : null}
    </section>
  )
}
