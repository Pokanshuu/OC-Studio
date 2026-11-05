'use client'

/**
 * 笔记宿主的模板渲染 —— **世界观编辑器与分类条目编辑器的唯一实现**。
 *
 * 两边以前各写一份 `switch (component.id)`，词汇表还不同（分类条目没有 relations /
 * time / place / gallery）。现在所有词条组件都实装了，两份 switch 又永远是同一份，
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
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { WorldCoverField } from '@/features/world/components/WorldCoverField'
import { WorldCustomFields } from '@/features/world/components/WorldCustomFields'
import { WorldMetaFields, WorldTitleField } from '@/features/world/components/WorldFrontmatter'
import {
  NoteAvatarBlock,
  NoteGalleryBlock,
  NoteImageBlock,
  NotePlaceBlock,
  NoteRelationsBlock,
  NoteSummaryBlock,
  NoteTimeBlock,
} from '@/features/world/components/note/NoteBlocks'

export interface NoteTemplateContentProps {
  entry: WorldEntry
  template: TemplateDoc
  title: string
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  titlePlaceholder?: string
  tags: number[]
  onTagsChange: (ids: number[]) => void
  showTags: boolean
  backlinks: { id: number; title: string }[]
  /** 点关系 / 被引用里的另一篇笔记 */
  onNavigateNote: (id: number) => void
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
  showTags,
  backlinks,
  onNavigateNote,
  body,
  linkRows,
  fieldKeys,
  fieldTypes,
  fieldLabels,
}: NoteTemplateContentProps) {
  return (
    <TemplateRenderer
      template={template}
      render={(component) => {
        switch (component.id) {
          case 'cover':
            return <WorldCoverField key={entry.id} entry={entry} />
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
                entry={entry}
                template={template}
                onNavigate={onNavigateNote}
                linkRows={linkRows}
              />
            )
          case 'tags':
            if (!showTags && backlinks.length === 0) return null
            return (
              <WorldMetaFields
                tags={tags}
                onTagsChange={onTagsChange}
                showTags={showTags}
                backlinks={backlinks}
                onSelectBacklink={onNavigateNote}
              />
            )
          case 'image':
            return <NoteImageBlock key={entry.id} entry={entry} component={component} />
          case 'gallery':
            return <NoteGalleryBlock key={entry.id} entry={entry} component={component} />
          case 'time':
            return <NoteTimeBlock key={entry.id} entry={entry} component={component} />
          case 'place':
            return <NotePlaceBlock key={entry.id} entry={entry} component={component} />
          case 'summary':
            return <NoteSummaryBlock key={entry.id} entry={entry} component={component} />
          case 'body':
            return body
          default:
            return null
        }
      }}
    />
  )
}
