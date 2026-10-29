'use client'

import { TagPicker } from '@/features/tags'
import { FIELD_LABEL, FIELD_ROW_TOP, LIST_END } from '@/lib/ui-tokens'

interface WorldFrontmatterProps {
  title: string
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  tags: number[]
  onTagsChange: (ids: number[]) => void
  showTags: boolean
  backlinks: { id: number; title: string }[]
  onSelectBacklink: (id: number) => void
  compact: boolean
}

/** 词条 frontmatter：标题、标签、被引用；正文由 WorldEntryBody 单独复用。 */
export function WorldFrontmatter({
  title,
  onTitleChange,
  tags,
  onTagsChange,
  showTags,
  backlinks,
  onSelectBacklink,
  compact,
}: WorldFrontmatterProps) {
  return (
    <div className={compact ? 'flex flex-col gap-4 p-4' : 'flex flex-col gap-8'}>
      <input
        type="text"
        value={title}
        onChange={onTitleChange}
        placeholder="词条标题"
        className="h-8 min-w-0 w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
      />

      <div className={`flex flex-col ${LIST_END}`}>
        {showTags ? (
          <div className={FIELD_ROW_TOP}>
            <span className={FIELD_LABEL}>标签</span>
            <div className="min-w-0 flex-1">
              <TagPicker selectedIds={tags} onChange={onTagsChange} />
            </div>
          </div>
        ) : null}

        {backlinks.length > 0 ? (
          <div className={FIELD_ROW_TOP}>
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
    </div>
  )
}
