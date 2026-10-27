'use client'

import { RelatedItemsSelector } from '@/components/shared/RelatedItemsSelector'
import { TagPicker } from '@/features/tags'
import { FIELD_LABEL, LIST_END, FIELD_ROW_TOP, SECTION_TITLE } from '@/lib/ui-tokens'
import type { EventForm } from '../hooks/useEventForm'

/** 关联：相关角色 / 相关国家 / 标签 */
export function EventRelationSection({
  form,
  onNavigateItem,
}: {
  form: EventForm
  onNavigateItem?: (id: number, type?: string) => void
}) {
  return (
    <section>
      <h3 className={SECTION_TITLE}>关联</h3>
      <div className={`flex flex-col ${LIST_END}`}>
        <div className={FIELD_ROW_TOP}>
          <span className={FIELD_LABEL}>相关角色</span>
          <div className="min-w-0 flex-1">
            <RelatedItemsSelector
              items={form.characterItems}
              selectedIds={form.selectedCharacterIds}
              onChange={form.setSelectedCharacterIds}
              placeholder="添加相关角色..."
              onNavigateItem={(id) => onNavigateItem?.(id, 'character')}
            />
          </div>
        </div>

        <div className={FIELD_ROW_TOP}>
          <span className={FIELD_LABEL}>相关国家</span>
          <div className="min-w-0 flex-1">
            <RelatedItemsSelector
              items={form.countryItems}
              selectedIds={form.selectedCountryIds}
              onChange={form.setSelectedCountryIds}
              placeholder="添加相关国家..."
              onNavigateItem={(id) => onNavigateItem?.(id, 'country')}
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
