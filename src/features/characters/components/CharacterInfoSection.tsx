'use client'

import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { TagPicker } from '@/features/tags'
import { Checkbox } from '@/components/ui/checkbox'
import { DATE_INPUT, FIELD_GRID, FIELD_INPUT, FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, SECTION_TITLE } from '@/lib/ui-tokens'
import { BUILTIN_FIELDS, replaceFields, useFieldConfig, type FieldDef } from '@/lib/fields'
import { defaultFields } from '@/lib/fields/defaults'
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
}: {
  form: CharacterForm
  onNavigateToCountry?: (id: number) => void
}) {
  const fields = useFieldConfig().character
  const hiddenBuiltins = BUILTIN_FIELDS.character.filter(
    (builtin) => !fields.some((field) => field.id === builtin.id),
  )

  const textValues: Record<string, { value: string; set: (v: string) => void }> = {
    aliases: { value: form.aliasesStr, set: form.setAliasesStr },
    race: { value: form.race, set: form.setRace },
    element: { value: form.element, set: form.setElement },
    occupation: { value: form.occupation, set: form.setOccupation },
    faction: { value: form.faction, set: form.setFaction },
    height: { value: form.height, set: form.setHeight },
  }

  const renderRow = (field: FieldDef) => {
    const wide = field.type === 'tags'
    const rowClass = wide ? `${FIELD_ROW_TOP} sm:col-span-2` : FIELD_ROW

    if (field.type === 'bool') {
      return (
        <label key={field.id} className={`${rowClass} cursor-pointer`}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <Checkbox
            checked={form.isMajor}
            onCheckedChange={(checked) => form.setIsMajor(checked === true)}
          />
        </label>
      )
    }

    if (field.type === 'tags') {
      return (
        <div key={field.id} className={rowClass}>
          <span className={FIELD_LABEL}>{field.label}</span>
          <div className="min-w-0 flex-1">
            <TagPicker selectedIds={form.tags} onChange={form.setTags} />
          </div>
        </div>
      )
    }

    if (field.type === 'country') {
      return (
        <div key={field.id} className={rowClass}>
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
        <div key={field.id} className={rowClass}>
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
        <div key={field.id} className={rowClass}>
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
      <div key={field.id} className={rowClass}>
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

  const restoreHidden = () => {
    const custom = fields.filter((field) => !BUILTIN_FIELDS.character.some((b) => b.id === field.id))
    void replaceFields('character', [...defaultFields('character'), ...custom])
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
