/**
 * 标签组件 —— 独立成块（`docs/模板.md §6.4` / §10）。
 *
 * 以前事件 / 国家的标签挂在「关联」下面、角色的是基本信息里的一行；
 * 现在三处共用这一块：标题 + chip 流，打标签本身仍由 `TagPicker` 负责。
 */
import { TagPicker } from '@/features/tags'
import { SECTION_TITLE_BARE } from '@/lib/ui-tokens'

export function TagsSection({
  selectedIds,
  onChange,
}: {
  selectedIds: number[]
  onChange: (ids: number[]) => void
}) {
  return (
    <section>
      <h3 className={`${SECTION_TITLE_BARE} mb-3`}>标签</h3>
      <TagPicker selectedIds={selectedIds} onChange={onChange} />
    </section>
  )
}
