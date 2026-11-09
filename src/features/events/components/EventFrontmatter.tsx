'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { RelationsSection } from '@/components/shared/relations/RelationsSection'
import { useRelationsBlock } from '@/components/shared/relations/use-relations-block'
import { GalleryBlock, SummaryBlock } from '@/components/shared/template-blocks'
import { TagsSection } from '@/components/shared/TagsSection'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { useTemplates } from '@/lib/templates/store'
import { componentLabel, componentParam } from '@/lib/templates/params'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { EventForm } from '../hooks/useEventForm'
import { EventInfoSection } from './EventInfoSection'

interface EventFrontmatterProps {
  form: EventForm
  compact: boolean
  onNavigateItem?: (id: number, type?: string) => void
  /** 正文编辑器节点（全宽布局把它放进模板顺序；分栏布局固定在右栏，不传） */
  body?: React.ReactNode
}

/**
 * 事件 frontmatter：**由模板决定区块顺序与开关**（阶段一，数据仍写原列）。
 *
 * 映射（`src/lib/templates/support.ts` 是唯一进度表）：
 * - `cover`     → 头图
 * - `info`      → 标题 + 基本信息（时间 / 结束时间 / 地点是这里的字段行，见 `EventInfoSection`）
 * - `summary`   → 简介
 * - `gallery`   → 图片（`events.images`）
 * - `relations` → 关系（参与者与相关事件是同一块，`docs/模板.md §6.3`）
 * - `tags`      → 标签（独立成块）
 */
export function EventFrontmatter({ form, compact, onNavigateItem, body }: EventFrontmatterProps) {
  const { templates } = useTemplates()
  const template = templates.find((doc) => doc.id === 'event')
  const relationsBlock = useRelationsBlock(template)

  const componentOf = (id: 'summary' | 'gallery') =>
    template?.components.find((component) => component.id === id)
  const summaryComponent = componentOf('summary')
  const galleryComponent = componentOf('gallery')
  const summaryTitle = componentParam(summaryComponent, 'title', true) !== false
  const galleryTitle = componentParam(galleryComponent, 'title', true) !== false
  const summaryLabel = componentLabel(summaryComponent)
  const galleryLabel = componentLabel(galleryComponent)
  const galleryMode = componentParam(galleryComponent, 'mode', 'grid') === 'slider' ? 'slider' : 'grid'
  const galleryColumns = Math.min(
    6,
    Math.max(1, Number(componentParam(galleryComponent, 'columns', 4)) || 4),
  )

  /**
   * 简介：一句话概括，列表卡的摘要与导出副标题都读它。
   *
   * 这一段以前**没有输入口** —— `events.summary` 有列、会保存、列表也在读，
   * 但编辑器里谁也改不到它。模板里给它一个位置，正好把入口补上。
   */
  const summarySection = (
    <SummaryBlock
      value={form.summary}
      showTitle={summaryTitle}
      title={summaryLabel || '简介'}
      onChange={form.setSummary}
    />
  )

  /**
   * 图片（画廊）：`events.images` 一直有列、盘上也能读回，但编辑器里没有入口。
   * 模板的「画廊」组件把它接到写作面上；上传 / 更换 / 移除仍走 `ImageGallery`。
   */
  const gallerySection = (
    <GalleryBlock
      images={form.images.map((image) => image.url)}
      showTitle={galleryTitle}
      title={galleryLabel || '图片'}
      mode={galleryMode}
      columns={galleryColumns}
      onAdd={(url) => form.setImages((prev) => [...prev, { url, caption: '' }])}
      onReplace={(index, url) =>
        form.setImages((prev) =>
          prev.map((image, at) => (at === index ? { ...image, url } : image)),
        )
      }
      onRemove={(index) => form.setImages((prev) => prev.filter((_, at) => at !== index))}
    />
  )

  const relationSection = (
    <RelationsSection
      rows={form.relationRows}
      candidates={form.relationCandidates}
      presentation={relationsBlock.presentation}
      showTitle={relationsBlock.showTitle}
      title={relationsBlock.title}
      onPresentationChange={relationsBlock.canSwitch ? relationsBlock.setPresentation : undefined}
      onAdd={form.addRelation}
      onRemove={form.removeRelation}
      onRename={form.renameRelation}
      onArrowChange={form.setRelationArrow}
      onNavigate={(kind, id) => onNavigateItem?.(id, kind)}
      selfName={form.title}
    />
  )

  const tagsSection = <TagsSection selectedIds={form.tags} onChange={form.setTags} />

  if (!template) {
    return (
      <div className={compact ? 'flex flex-col gap-6 p-4' : 'flex flex-col gap-8'}>
        <ProfileBannerEditor
          headerUrl={form.headerUrl}
          onHeaderChange={form.setHeaderUrl}
          onHeaderRemove={() => form.setHeaderUrl('')}
        />
        <input
          type="text"
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
          placeholder="事件标题"
          className={TITLE_INPUT}
        />
        <EventInfoSection form={form} compact={compact} />
        <div className="border-t border-line" />
        {relationSection}
        <div className="border-t border-line" />
        {tagsSection}
      </div>
    )
  }

  return (
    <TemplateRenderer
      template={template}
      className={compact ? 'flex flex-col gap-6 p-4' : 'flex flex-col gap-8'}
      render={(component) => {
        switch (component.id) {
          case 'cover':
            return (
              <ProfileBannerEditor
                headerUrl={form.headerUrl}
                onHeaderChange={form.setHeaderUrl}
                onHeaderRemove={() => form.setHeaderUrl('')}
              />
            )
          case 'info':
            return (
              <div className="flex min-w-0 flex-col gap-8">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => form.setTitle(e.target.value)}
                  placeholder="事件标题"
                  className={TITLE_INPUT}
                />
                <EventInfoSection form={form} compact={compact} />
              </div>
            )
          case 'summary':
            return summarySection
          case 'gallery':
            return gallerySection
          case 'relations':
            return relationSection
          case 'tags':
            return tagsSection
          case 'body':
            return body ?? null
          default:
            return null
        }
      }}
    />
  )
}
