'use client'

import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { TagPicker } from '@/features/tags'
import { Checkbox } from '@/components/ui/checkbox'
import { FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, SECTION_TITLE } from '@/lib/ui-tokens'
import type { CharacterForm } from '../hooks/useCharacterForm'

/** 可编辑的文本信息字段（顺序即展示顺序） */
const INFO_FIELDS = [
  { label: '别名', key: 'aliasesStr', placeholder: '多个用、分隔' },
  { label: '种族', key: 'race', placeholder: '' },
  { label: '元素', key: 'element', placeholder: '' },
  { label: '职业', key: 'occupation', placeholder: '' },
  { label: '阵营', key: 'faction', placeholder: '如：皇室 / 革新派' },
  { label: '身高', key: 'height', placeholder: '170 cm' },
  { label: '生日', key: 'birthday', placeholder: '1998-03-12' },
] as const

export function CharacterInfoSection({
  form,
  onNavigateToCountry,
}: {
  form: CharacterForm
  onNavigateToCountry?: (id: number) => void
}) {
  const values: Record<(typeof INFO_FIELDS)[number]['key'], string> = {
    aliasesStr: form.aliasesStr,
    race: form.race,
    element: form.element,
    occupation: form.occupation,
    faction: form.faction,
    height: form.height,
    birthday: form.birthday,
  }
  const setters: Record<(typeof INFO_FIELDS)[number]['key'], (v: string) => void> = {
    aliasesStr: form.setAliasesStr,
    race: form.setRace,
    element: form.setElement,
    occupation: form.setOccupation,
    faction: form.setFaction,
    height: form.setHeight,
    birthday: form.setBirthday,
  }

  return (
    <section>
      <h3 className={SECTION_TITLE}>基本信息</h3>
      <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {INFO_FIELDS.map(({ label, key, placeholder }) => (
          <div key={label} className={FIELD_ROW}>
            <span className={FIELD_LABEL}>{label}</span>
            <input
              type="text"
              value={values[key]}
              onChange={(e) => { setters[key](e.target.value); form.markDirty() }}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        ))}

        {/* Nationality */}
        <div className={FIELD_ROW}>
          <span className={FIELD_LABEL}>国籍</span>
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
                onChange={(e) => { form.setNationalityLegacy(e.target.value); form.markDirty() }}
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
            )}
          </div>
        </div>

        {/* Major */}
        <label className={`${FIELD_ROW} cursor-pointer`}>
          <span className={FIELD_LABEL}>主要角色</span>
          <Checkbox
            checked={form.isMajor}
            onCheckedChange={(checked) => { form.setIsMajor(checked === true); form.markDirty() }}
          />
        </label>

        {/* Tags — 占满整行，避免长标签把网格挤歪 */}
        <div className={`${FIELD_ROW_TOP} sm:col-span-2`}>
          <span className={FIELD_LABEL}>标签</span>
          <div className="min-w-0 flex-1">
            <TagPicker selectedIds={form.tags} onChange={(ids) => { form.setTags(ids); form.markDirty() }} />
          </div>
        </div>
      </div>
    </section>
  )
}
