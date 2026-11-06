'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { RelationsSection } from '@/components/shared/relations/RelationsSection'
import { useRelationsBlock } from '@/components/shared/relations/use-relations-block'
import { AvatarBlock, GalleryBlock, SummaryBlock } from '@/components/shared/template-blocks'
import { TagsSection } from '@/components/shared/TagsSection'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { useTemplates } from '@/lib/templates/store'
import { componentParam } from '@/lib/templates/params'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { CountryForm } from '../hooks/useCountryForm'

interface CountryFrontmatterProps {
  form: CountryForm
  compact: boolean
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  /** 正文编辑器节点（全宽布局把它放进模板顺序；分栏布局固定在右栏，不传） */
  body?: React.ReactNode
}

/**
 * 国家 frontmatter：**由模板决定区块顺序与开关**（阶段一，数据仍写原列）。
 *
 * 映射：`cover` → 旗帜/封面；`info` → 名称；`relations` → 关系（居民 / 相关事件，
 * 名单是实体侧的查询）；`tags` → 标签（独立成块）。
 */
export function CountryFrontmatter({
  form,
  compact,
  onNavigateToCharacter,
  onNavigateToEvent,
  body,
}: CountryFrontmatterProps) {
  const { templates } = useTemplates()
  const template = templates.find((doc) => doc.id === 'country')
  const relationsBlock = useRelationsBlock(template)
  const componentOf = (id: 'summary' | 'gallery') =>
    template?.components.find((component) => component.id === id)
  const summaryTitle = componentParam(componentOf('summary'), 'title', true) !== false
  const galleryTitle = componentParam(componentOf('gallery'), 'title', true) !== false
  const galleryMode = componentParam(componentOf('gallery'), 'mode', 'grid') === 'slider' ? 'slider' : 'grid'
  const galleryColumns = Math.min(
    6,
    Math.max(1, Number(componentParam(componentOf('gallery'), 'columns', 4)) || 4),
  )

  const summarySection = (
    <SummaryBlock value={form.description} showTitle={summaryTitle} onChange={form.setDescription} />
  )

  const gallerySection = (
    <GalleryBlock
      images={form.gallery.map((image) => image.url)}
      showTitle={galleryTitle}
      title="画廊"
      mode={galleryMode}
      columns={galleryColumns}
      onAdd={(url) => form.setGallery((prev) => [...prev, { url, caption: '' }])}
      onReplace={(index, url) =>
        form.setGallery((prev) => prev.map((image, at) => (at === index ? { ...image, url } : image)))
      }
      onRemove={(index) => form.setGallery((prev) => prev.filter((_, at) => at !== index))}
    />
  )

  const relationSection = (
    <RelationsSection
      rows={form.relationRows}
      candidates={form.relationCandidates}
      presentation={relationsBlock.presentation}
      showTitle={relationsBlock.showTitle}
      onPresentationChange={relationsBlock.canSwitch ? relationsBlock.setPresentation : undefined}
      onAdd={form.addRelation}
      onRemove={form.removeRelation}
      onNavigate={(kind, id) => {
        if (kind === 'character') onNavigateToCharacter?.(id)
        else if (kind === 'event') onNavigateToEvent?.(id)
      }}
      selfName={form.name}
    />
  )

  const tagsSection = <TagsSection selectedIds={form.tags} onChange={form.setTags} />

  if (!template) {
    return (
      <div className={compact ? 'flex flex-col gap-6 p-4' : 'flex flex-col gap-8'}>
        <ProfileBannerEditor
          headerUrl={form.headerUrl}
          avatarUrl={form.flagUrl}
          onHeaderChange={form.setHeaderUrl}
          onAvatarChange={form.setFlagUrl}
          onHeaderRemove={() => form.setHeaderUrl('')}
          onAvatarRemove={() => form.setFlagUrl('')}
          avatarType="flag"
        />
        <input
          type="text"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder="国家/地区名称"
          className={TITLE_INPUT}
        />
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
                avatarUrl={form.flagUrl}
                onHeaderChange={form.setHeaderUrl}
                onAvatarChange={form.setFlagUrl}
                onHeaderRemove={() => form.setHeaderUrl('')}
                onAvatarRemove={() => form.setFlagUrl('')}
                avatarType="flag"
              />
            )
          case 'avatar':
            return (
              <AvatarBlock
                value={form.flagUrl}
                avatarType="flag"
                onChange={form.setFlagUrl}
                onRemove={() => form.setFlagUrl('')}
              />
            )
          case 'info':
            return (
              <input
                type="text"
                value={form.name}
                onChange={(e) => form.setName(e.target.value)}
                placeholder="国家/地区名称"
                className={TITLE_INPUT}
              />
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
