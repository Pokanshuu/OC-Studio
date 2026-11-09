'use client'

import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { Checkbox } from '@/components/ui/checkbox'
import { DATE_INPUT, FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, SECTION_TITLE } from '@/lib/ui-tokens'
import { ComponentEditButton } from '@/components/shared/ComponentEdit'
import { useFieldConfig, type FieldDef } from '@/lib/fields'
import type { CharacterForm } from '../hooks/useCharacterForm'

const TEXT_PLACEHOLDERS: Record<string, string> = {
  aliases: '多个用、分隔',
}

/**
 * 基本信息 —— **按字段表渲染**。
 *
 * 行从哪来：`lib/fields` 的配置（设置 › 世界 › 角色基本信息 里增删改序）。
 * 值从哪来：内置字段读 `form` 里对应的列，自定义字段读 `form.custom[key]`。
 * 隐藏一行**不动数据** —— 表单 state 仍然全量加载、全量保存。
 */
export function CharacterInfoSection({
  form,
  onNavigateToCountry,
  compact = false,
}: {
  form: CharacterForm
  onNavigateToCountry?: (id: number) => void
  /** 三栏中栏的窄容器：字段单列（不依赖 viewport 的 sm 断点） */
  compact?: boolean
}) {
  const fields = useFieldConfig().character

  const textValues: Record<string, { value: string; set: (v: string) => void }> = {
    aliases: { value: form.aliasesStr, set: form.setAliasesStr },
    race: { value: form.race, set: form.setRace },
    element: { value: form.element, set: form.setElement },
    occupation: { value: form.occupation, set: form.setOccupation },
    faction: { value: form.faction, set: form.setFaction },
    height: { value: form.height, set: form.setHeight },
  }

  const renderRow = (field: FieldDef) => {
    if (field.type === 'bool') {
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

    if (field.type === 'country') {
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="min-w-0 flex-1">
            {form.countries.length > 0 ? (
              <RelatedItemsSelector
                items={form.countryItems}
                selectedIds={form.selectedCountryIds}
                onChange={form.handleCountryChange}
                placeholder="搜索国家..."
                maxItems={1}
                onNavigateItem={onNavigateToCountry}
              />
            ) : (
              <input
                type="text"
                value={form.nationalityLegacy}
                onChange={(e) => form.setNationalityLegacy(e.target.value)}
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            )}
          </div>
        </div>
      )
    }

    // 生日与事件时间同一套：年 / 月 / 日 三段，整组共用一条底线。
    // 年份填了才会出现在时间线上（`出生` 节点）。
    if (field.id === 'birthday') {
      return (
        <div key={field.id} className={FIELD_ROW}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input value={form.birthdayYear} onChange={(e) => form.setBirthdayYear(e.target.value)} placeholder="年" className={DATE_INPUT} />
            <input value={form.birthdayMonth} onChange={(e) => form.setBirthdayMonth(e.target.value)} placeholder="月" className={DATE_INPUT} />
            <input value={form.birthdayDay} onChange={(e) => form.setBirthdayDay(e.target.value)} placeholder="日" className={DATE_INPUT} />
          </div>
        </div>
      )
    }

    const builtinInput = textValues[field.id]
    if (builtinInput === undefined) {
      // 自定义字段
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
      <div key={field.id} className={FIELD_ROW}>
        <span className={FIELD_LABEL}>{field.label}</span>
        <input
          type="text"
          value={builtinInput.value}
          onChange={(e) => builtinInput.set(e.target.value)}
          placeholder={TEXT_PLACEHOLDERS[field.id] ?? ''}
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
        {/* 类别已进字段表（`kind`），不再在这里硬编码 */}
        {fields.map(renderRow)}

      </div>

    </section>
  )
}
