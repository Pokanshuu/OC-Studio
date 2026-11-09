'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'
import { ComponentEditButton } from '@/components/shared/ComponentEdit'
import { TimeTrio, type TimePart } from '@/components/shared/TimeTrio'
import { useFields, type FieldDef } from '@/lib/fields'
import type { EventForm } from '../hooks/useEventForm'

/**
 * 基本信息 —— 只渲染**归它自己**的字段（字段表见 `设置 › 组件 › 事件`）。
 *
 * 时间 / 结束时间 / 地点是这里的三个**特殊行**（2026-11-10 收回）：控件是年 / 月 / 日
 * 三段与单行，值仍写 `Event.time` / `endTime` / `location` —— 时间线、列表、导出读的
 * 还是同一列。它们不再是独立组件，因此既不能单独排序到别的块后面，也不会随模板开关
 * 出现第二个入口（`docs/模板.md §6.7`）。标签归「标签」组件，不在这里。
 */
export function EventInfoSection({
  form,
  compact = false,
}: {
  form: EventForm
  /** 三栏中栏的窄容器：字段单列（不依赖 viewport 的 sm 断点） */
  compact?: boolean
}) {
  const fields = useFields('event')

  const setTimePart = (which: 'start' | 'end', part: TimePart, value: string): void => {
    if (which === 'start') {
      if (part === 'year') form.setYear(value)
      else if (part === 'month') form.setMonth(value)
      else form.setDay(value)
      return
    }
    if (part === 'year') form.setEndYear(value)
    else if (part === 'month') form.setEndMonth(value)
    else form.setEndDay(value)
  }

  const renderRow = (field: FieldDef) => {
    if (field.type === 'bool' && field.id === 'isMajor') {
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

    // 时间 / 结束时间：与角色生日同一套三段输入（`TimeTrio`），整组共用一条底线
    if (field.id === 'time' || field.id === 'endTime') {
      const start = field.id === 'time'
      const values = start
        ? { year: form.year, month: form.month, day: form.day }
        : { year: form.endYear, month: form.endMonth, day: form.endDay }
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <TimeTrio
            values={values}
            onChange={(part, value) => setTimePart(start ? 'start' : 'end', part, value)}
          />
        </div>
      )
    }

    // 地点：一行自由文本；未来接地图时在这里加右侧入口，现在不画占位
    if (field.id === 'location') {
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <input
            type="text"
            value={form.location}
            onChange={(e) => form.setLocation(e.target.value)}
            placeholder="例：灰烬平原"
            className={FIELD_INPUT}
          />
        </div>
      )
    }

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

  return (
    <section className="group">
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_TITLE}>基本信息</h3>
        <ComponentEditButton componentId="info" />
      </div>
      {fields.length === 0 ? (
        <p className="text-[12px] text-ink-faint">字段表里还没有字段。</p>
      ) : null}
      <div
        className={
          compact
            ? 'grid grid-cols-1 [&>*:last-child]:border-b-0'
            : `grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`
        }
      >
        {fields.map(renderRow)}
      </div>
    </section>
  )
}
