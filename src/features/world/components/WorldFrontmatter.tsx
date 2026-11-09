'use client'

import { TagPicker } from '@/features/tags'
import { FIELD_LABEL, FIELD_ROW_TOP, LIST_END, TITLE_INPUT } from '@/lib/ui-tokens'

interface WorldTitleFieldProps {
  title: string
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  /** 占位文案：词条默认「词条标题」，分类条目可改成「名称」 */
  placeholder?: string
}

/** 词条标题（模板里的「基本信息」区块） */
export function WorldTitleField({ title, onTitleChange, placeholder = '词条标题' }: WorldTitleFieldProps) {
  return (
    <input
      type="text"
      value={title}
      onChange={onTitleChange}
      placeholder={placeholder}
      className={`h-8 ${TITLE_INPUT}`}
    />
  )
}

interface WorldMetaFieldsProps {
  tags: number[]
  onTagsChange: (ids: number[]) => void
  backlinks: { id: number; title: string }[]
  onSelectBacklink: (id: number) => void
}

/**
 * 标签 / 被引用（模板里的「标签」区块）。
 *
 * 标签是独立 block（`docs/模板.md §6.4`）——**在不在，由模板的组件开关决定**，
 * 不再看字段表里有没有 `tags` 这一行（2026-11-09 起字段表不再有它）。
 */
export function WorldMetaFields({
  tags,
  onTagsChange,
  backlinks,
  onSelectBacklink,
}: WorldMetaFieldsProps) {
  return (
    <div className={`flex flex-col ${LIST_END}`}>
      <div className={`${FIELD_ROW_TOP} last:border-b-0`}>
        <span className={FIELD_LABEL}>标签</span>
        <div className="min-w-0 flex-1">
          <TagPicker selectedIds={tags} onChange={onTagsChange} />
        </div>
      </div>

      {backlinks.length > 0 ? (
        <div className={`${FIELD_ROW_TOP} last:border-b-0`}>
          <span className={FIELD_LABEL}>被引用</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
            {backlinks.map((b) => (
              <button
                key={b.id}
                onClick={() => onSelectBacklink(b.id)}
                className="text-[13px] text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface WorldFrontmatterProps extends WorldTitleFieldProps, WorldMetaFieldsProps {
  compact: boolean
}

/**
 * 词条 frontmatter（标题 + 标签 + 被引用），按「一整块」使用时的组合形态。
 * 编辑器走模板渲染循环时各区块分开调，见 `WorldTitleField` / `WorldMetaFields`。
 */
export function WorldFrontmatter({ title, onTitleChange, compact, ...meta }: WorldFrontmatterProps) {
  return (
    <div className={compact ? 'flex flex-col gap-4 p-4' : 'flex flex-col gap-8'}>
      <WorldTitleField title={title} onTitleChange={onTitleChange} />
      <WorldMetaFields {...meta} />
    </div>
  )
}
