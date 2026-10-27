'use client'

import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { TagPicker } from '@/features/tags'
import { FIELD_LABEL, LIST_END, FIELD_ROW_TOP, SECTION_TITLE } from '@/lib/ui-tokens'
import type { CountryForm } from '../hooks/useCountryForm'

/** 关联：相关角色 / 相关事件 / 标签（与事件编辑器同一套字段行） */
export function CountryRelationSection({
  form,
  onNavigateToCharacter,
  onNavigateToEvent,
}: {
  form: CountryForm
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
}) {
  return (
    <section>
      <h3 className={SECTION_TITLE}>关联</h3>
      <div className={`flex flex-col ${LIST_END}`}>
        <div className={FIELD_ROW_TOP}>
          <span className={FIELD_LABEL}>相关角色</span>
          <div className="min-w-0 flex-1">
            <RelatedItemsSelector
              items={form.relatedCharacterItems}
              selectedIds={form.relatedCharacterIds}
              onChange={form.setEditableCharIds}
              placeholder="搜索相关角色..."
              onNavigateItem={onNavigateToCharacter}
            />
          </div>
        </div>

        <div className={FIELD_ROW_TOP}>
          <span className={FIELD_LABEL}>相关事件</span>
          <div className="min-w-0 flex-1">
            <RelatedItemsSelector
              items={form.relatedEventItems}
              selectedIds={form.relatedEventIds}
              onChange={form.setEditableEventIds}
              placeholder="搜索相关事件..."
              onNavigateItem={onNavigateToEvent}
            />
          </div>
        </div>

        <div className={FIELD_ROW_TOP}>
          <span className={FIELD_LABEL}>标签</span>
          <div className="min-w-0 flex-1">
            <TagPicker selectedIds={form.tags} onChange={form.setTags} />
          </div>
        </div>
      </div>
    </section>
  )
}
