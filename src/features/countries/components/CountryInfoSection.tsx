'use client'

/**
 * 国家的基本信息字段（2026-11-09 起）。
 *
 * 国家的「体制 / 地理 / 文化」仍然写在正文里；这里只渲染**自建字段**——
 * 字段表在 `lib/fields`（设置 › 组件 › 国家），值落 `Country.custom`。
 * 与角色 / 事件的基本信息同一套行语法（标题行 + 悬停设置键 + 两列网格）。
 */
import { ComponentEditButton } from '@/components/shared/ComponentEdit'
import { useFieldConfig } from '@/lib/fields'
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
