'use client'

/**
 * 笔记宿主的模板渲染 —— **世界观编辑器与分类条目编辑器的唯一实现**。
 *
 * 两边以前各写一份 `switch (component.id)`，词汇表还不同（分类条目没有 relations /
 * gallery）。现在所有词条组件都实装了，两份 switch 又永远是同一份，
 * 于是收在这里：宿主只准备数据（标题状态、标签、被引用、正文编辑器）与两个导航回调。
 *
 * 实体侧没有走这里：它们的「基本信息」是强类型列（角色字段 / 事件时间…），
 * 数据源不同，强行合并只会让组件里长出一堆 `if (kind === 'character')`。
 * 共用的是更下一层的 `components/shared/template-blocks`。
 */
import type { ReactNode } from 'react'
import type { WorldEntry } from '@/types'
import type { InfoFieldType } from '@/lib/templates/info-groups'
import type { TemplateDoc } from '@/lib/templates/types'
import type { RelationTargetKind } from '@/components/shared/relations/types'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { WorldCoverField } from '@/features/world/components/WorldCoverField'
import { WorldCustomFields } from '@/features/world/components/WorldCustomFields'
import { WorldTitleField } from '@/features/world/components/WorldFrontmatter'
import { TagsSection } from '@/components/shared/TagsSection'
import { FIELD_LABEL, FIELD_ROW_TOP } from '@/lib/ui-tokens'
import {
  NoteAvatarBlock,
  NoteGalleryBlock,
  NoteImageBlock,
  NoteRelationsBlock,
  NoteSummaryBlock,
} from '@/features/world/components/note/NoteBlocks'

export interface NoteTemplateContentProps {
  entry: WorldEntry
  template: TemplateDoc
  title: string
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  titlePlaceholder?: string
  tags: number[]
  onTagsChange: (ids: number[]) => void
  backlinks: { id: number; title: string }[]
  /** 点关系 / 被引用里的另一篇笔记 */
  onNavigateNote: (id: number) => void
  /** 关系里出现非笔记目标（如角色的「相关笔记」反查）时的跳转 */
  onNavigateEntity?: (kind: RelationTargetKind, id: number) => void
  /** 正文编辑器节点：由宿主提供（它持有 Tiptap 实例） */
  body: ReactNode
  /** 已加载的词条列表（世界观编辑器有；分类编辑器没有，关系块自己读库） */
  linkRows?: WorldEntry[]
  fieldKeys?: string[]
  fieldTypes?: Record<string, InfoFieldType>
  fieldLabels?: Record<string, string>
}

export function NoteTemplateContent({
  entry,
  template,
  title,
  onTitleChange,
  titlePlaceholder = '名称',
  tags,
  onTagsChange,
  backlinks,
  onNavigateNote,
  onNavigateEntity,
  body,
  linkRows,
  fieldKeys,
  fieldTypes,
  fieldLabels,
}: NoteTemplateContentProps) {
  // 关系区块已经列出「被引用」；标签块只在模板没有关系区块时兜底显示，避免同一行出现两次
  const relationsEnabled = template.components.some(
    (component) => component.id === 'relations' && component.enabled,
  )
  const backlinksForTags = relationsEnabled ? [] : backlinks
  // 标题挂在「基本信息」块里；模板没有这一块（内置词条默认只有标签 + 正文）时
  // 单独在上面补一行 —— 标题不是组件，不能因为没放基本信息就改不了名字
  const infoEnabled = template.components.some(
    (component) => component.id === 'info' && component.enabled,
  )
  // 封面永远贴顶（§6.1）：没有基本信息时，标题要排在封面**后面**，不能跑到封面上方
  const firstEnabled = template.components.find((component) => component.enabled)?.id
  const titleAfterCover = !infoEnabled && firstEnabled === 'cover'
  const titleBlock = (
    <WorldTitleField title={title} onTitleChange={onTitleChange} placeholder={titlePlaceholder} />
  )

  return (
    <>
      {infoEnabled || titleAfterCover ? null : <div className="mb-8">{titleBlock}</div>}
      <TemplateRenderer
        template={template}
        render={(component) => {
          switch (component.id) {
            case 'cover':
              return (
                <>
                  <WorldCoverField key={entry.id} entry={entry} />
                  {titleAfterCover ? <div className="mt-8">{titleBlock}</div> : null}
                </>
              )
            case 'avatar':
              return <NoteAvatarBlock key={entry.id} entry={entry} />
            case 'info':
              return (
                <div className="flex min-w-0 flex-col gap-8">
                  <WorldTitleField
                    title={title}
                    onTitleChange={onTitleChange}
                    placeholder={titlePlaceholder}
                  />
                  <WorldCustomFields
                    key={entry.id}
                    entry={entry}
                    fieldKeys={fieldKeys}
                    fieldTypes={fieldTypes}
                    fieldLabels={fieldLabels}
                  />
                </div>
              )
            case 'relations':
              return (
                <NoteRelationsBlock
                  key={entry.id}
                  entry={entry}
                  template={template}
                  onNavigate={(kind, id) => {
                    if (onNavigateEntity) onNavigateEntity(kind, id)
                    else if (kind === 'world') onNavigateNote(id)
                  }}
                  linkRows={linkRows}
                />
              )
            case 'tags':
              // 组件开着就一定有标签（没标签也留输入口）；「被引用」只在没有关系块时兜底。
              // 标题由 `TagsSection` 自己画 —— 与角色 / 事件 / 国家同一套（以前笔记这里是
              // 一行 `标签 xxx` 的字段行，四类宿主的标签长得不一样，`docs/现状问题.md` #2）
              return (
                <div className="flex flex-col gap-4">
                  <TagsSection selectedIds={tags} onChange={onTagsChange} />
                  {backlinksForTags.length > 0 ? (
                    <div className={`${FIELD_ROW_TOP} last:border-b-0`}>
                      <span className={FIELD_LABEL}>被引用</span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
                        {backlinksForTags.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => onNavigateNote(item.id)}
                            className="text-[13px] text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            case 'image':
              return <NoteImageBlock key={entry.id} entry={entry} component={component} />
            case 'gallery':
              return <NoteGalleryBlock key={entry.id} entry={entry} component={component} />
            case 'summary':
              return <NoteSummaryBlock key={entry.id} entry={entry} component={component} />
            case 'body':
              return body
            default:
              return null
          }
        }}
      />
    </>
  )
}
