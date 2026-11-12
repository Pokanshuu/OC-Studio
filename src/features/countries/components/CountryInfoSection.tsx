'use client'

/**
 * 国家的基本信息字段（2026-11-09 起）。
 *
 * 国家的「体制 / 地理 / 文化」仍然写在正文里；这里只渲染**自建字段**——
 * 字段表在 `lib/fields`（设置 › 组件 › 国家），值落 `Country.custom`。
 * 建立 / 结束时间在字段表里是 `type: 'time'`，用与事件相同的年 / 月 / 日三段控件，
 * 值仍是 `YYYY-MM-DD` 字符串（时间线会读它，见 `features/timeline/services`）。
 * 与角色 / 事件的基本信息同一套行语法（标题行 + 悬停设置键 + 两列网格）。
 */
import { ComponentEditButton } from '@/components/shared/ComponentEdit'
import { TimeTrio } from '@/components/shared/TimeTrio'
import { useFieldConfig } from '@/lib/fields'
import { assembleTime, parseTime } from '@/lib/time-field'
import { FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'

export function CountryInfoSection({
  values,
  onChange,
}: {
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  const fields = useFieldConfig().country.filter((field) => field.key !== undefined)

  return (
    <section className="group">
      <div className="flex items-center justify-between gap-3">
        <h3 className={SECTION_TITLE}>基本信息</h3>
        <ComponentEditButton componentId="info" />
      </div>
      {fields.length === 0 ? (
        <p className="text-[12px] text-ink-faint">字段表里还没有字段。</p>
      ) : null}
      <div className={`grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${FIELD_GRID}`}>
        {fields.map((field) => {
          const key = field.key as string
          if (field.type === 'time') {
            const parsed = parseTime(values[key] ?? '')
            return (
              <div key={field.id} className={FIELD_ROW}>
                <span className={FIELD_LABEL}>{field.label}</span>
                <TimeTrio
                  values={parsed}
                  onChange={(part, value) => {
                    const next = { ...parsed, [part]: value }
                    onChange(key, assembleTime(next.year, next.month, next.day))
                  }}
                />
              </div>
            )
          }
          return (
            <div key={field.id} className={FIELD_ROW}>
              <span className={FIELD_LABEL}>{field.label}</span>
              <input
                type="text"
                value={values[key] ?? ''}
                onChange={(event) => onChange(key, event.target.value)}
                className={FIELD_INPUT}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
