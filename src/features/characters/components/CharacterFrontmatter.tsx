'use client'

import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { RelationsSection } from '@/components/shared/relations/RelationsSection'
import { useRelationsBlock } from '@/components/shared/relations/use-relations-block'
import {
  AnimationBlock,
  AvatarBlock,
  GalleryBlock,
  SummaryBlock,
} from '@/components/shared/template-blocks'
import { TagsSection } from '@/components/shared/TagsSection'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { useTemplates } from '@/lib/templates/store'
import { componentLabel, componentParam } from '@/lib/templates/params'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { CharacterForm } from '../hooks/useCharacterForm'
import { CharacterInfoSection } from './CharacterInfoSection'

interface CharacterFrontmatterProps {
  form: CharacterForm
  compact: boolean
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  /** 关系里的「相关笔记」 */
  onNavigateToWorld?: (id: number) => void
  /** 正文编辑器节点（全宽布局把它放进模板顺序；分栏布局固定在右栏，不传） */
  body?: React.ReactNode
}

/**
 * 角色 frontmatter：**由模板决定区块顺序与开关**（阶段一，数据仍写原列）。
 *
 * 映射（进度见 `src/lib/templates/support.ts`）：
 * - `cover`     → 头图（头像在 `avatar` 组件里）
 * - `info`      → 名称 / 一句话 / 字段表
 * - `portrait`  → 立绘（`avatars`，9:16 图集，角色专属）
 * - `animation` → OC 动画（`animation`，视频槽，角色专属）
 * - `relations` → 关系（共用 `components/shared/relations`）
 * - `tags`      → 标签（独立成块，不再占基本信息的一行）
 * - `gallery`   → 相册
 *
 * 正文节点由编辑器壳传进来（`body`），模板里的 `body` 就把它放回编排顺序里。
 */
export function CharacterFrontmatter({
  form,
  compact,
  onNavigateToCharacter,
  onNavigateToCountry,
  onNavigateToWorld,
  body,
}: CharacterFrontmatterProps) {
  const { templates } = useTemplates()
  const template = templates.find((doc) => doc.id === 'character')

  // 相册列数：模板参数 `columns` 优先，缺省按布局 3 / 4
  const galleryComponent = template?.components.find((component) => component.id === 'gallery')
  const summaryComponent = template?.components.find((component) => component.id === 'summary')
  const templateColumns = Number(componentParam(galleryComponent, 'columns', compact ? 3 : 4))
  const columns = templateColumns > 0 ? Math.min(6, Math.max(1, templateColumns)) : compact ? 3 : 4
  const galleryMode = componentParam(galleryComponent, 'mode', 'grid') === 'slider' ? 'slider' : 'grid'
  const galleryTitle = componentParam(galleryComponent, 'title', true) !== false
  const summaryTitle = componentParam(summaryComponent, 'title', true) !== false
  const galleryLabel = componentLabel(galleryComponent)
  const summaryLabel = componentLabel(summaryComponent)
  const relationsBlock = useRelationsBlock(template)
  const portraitComponent = template?.components.find((component) => component.id === 'portrait')
  const animationComponent = template?.components.find((component) => component.id === 'animation')
  const portraitLabel = componentLabel(portraitComponent)
  const animationLabel = componentLabel(animationComponent)
  // 头像是独立组件：模板启用了 `avatar`，封面就不再画一次（老模板兜底仍走封面）
  const avatarEnabled = template?.components.some(
    (component) => component.id === 'avatar' && component.enabled,
  ) ?? false

  const portraitSection = (
    <GalleryBlock
      images={form.avatarUrls}
      showTitle
      title={portraitLabel || '立绘'}
      mode="grid"
      columns={compact ? 3 : 4}
      gridAspect="portrait"
      enableCrop
      cropAspect={9 / 16}
      onAdd={(path) => form.setAvatarUrls((prev) => [...prev, path])}
      onReplace={(index, path) =>
        form.setAvatarUrls((prev) => prev.map((url, i) => (i === index ? path : url)))}
      onRemove={(index) => form.setAvatarUrls((prev) => prev.filter((_, i) => i !== index))}
    />
  )

  const animationSection = (
    <AnimationBlock
      value={form.animationUrl}
      onChange={form.setAnimationUrl}
      onRemove={() => form.setAnimationUrl('')}
      title={animationLabel || '动画'}
    />
  )

  const photoSection = (
    <GalleryBlock
      images={form.galleryUrls}
      showTitle={galleryTitle}
      title={galleryLabel || '相册'}
      mode={galleryMode}
      columns={columns}
      onAdd={(path) => form.setGalleryUrls((prev) => [...prev, path])}
      onReplace={(index, path) =>
        form.setGalleryUrls((prev) => prev.map((url, i) => (i === index ? path : url)))}
      onRemove={(index) => form.setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
    />
  )

  const summarySection = (
    <SummaryBlock
      value={form.bio}
      showTitle={summaryTitle}
      title={summaryLabel || '简介'}
      onChange={form.setBio}
    />
  )

  const relationSection = (
    <RelationsSection
      rows={form.relationRows}
      inbound={form.inboundRelationRows}
      candidates={form.relationCandidates}
      presentation={relationsBlock.presentation}
      showTitle={relationsBlock.showTitle}
      title={relationsBlock.title}
      onPresentationChange={relationsBlock.canSwitch ? relationsBlock.setPresentation : undefined}
      onAdd={form.addRelation}
      onRemove={form.removeRelation}
      onRename={form.renameRelation}
      onArrowChange={form.setRelationArrow}
      onNavigate={(kind, id) => {
        if (kind === 'character') onNavigateToCharacter?.(id)
        else if (kind === 'world') onNavigateToWorld?.(id)
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
          avatarUrl={form.avatarUrl}
          onHeaderChange={form.setHeaderUrl}
          onAvatarChange={form.setAvatarUrl}
          onHeaderRemove={() => form.setHeaderUrl('')}
          onAvatarRemove={() => form.setAvatarUrl('')}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <input
            type="text"
            value={form.name}
            onChange={(event) => form.setName(event.target.value)}
            placeholder="角色名称"
            className={TITLE_INPUT}
          />
          {form.summaryLine ? <p className="text-sm text-ink-muted">{form.summaryLine}</p> : null}
        </div>
        <CharacterInfoSection form={form} onNavigateToCountry={onNavigateToCountry} compact={compact} />
        <div className="border-t border-line" />
        {portraitSection}
        <div className="border-t border-line" />
        {animationSection}
        <div className="border-t border-line" />
        {relationSection}
        <div className="border-t border-line" />
        {tagsSection}
        <div className="border-t border-line" />
        {photoSection}
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
                avatarUrl={avatarEnabled ? undefined : form.avatarUrl}
                onHeaderChange={form.setHeaderUrl}
                onAvatarChange={avatarEnabled ? undefined : form.setAvatarUrl}
                onHeaderRemove={() => form.setHeaderUrl('')}
                onAvatarRemove={() => form.setAvatarUrl('')}
              />
            )
          case 'avatar':
            return (
              <AvatarBlock
                value={form.avatarUrl}
                onChange={form.setAvatarUrl}
                onRemove={() => form.setAvatarUrl('')}
              />
            )
          case 'info':
            return (
              <div className="flex min-w-0 flex-col gap-8">
                <div className="flex min-w-0 flex-col gap-1">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => form.setName(event.target.value)}
                    placeholder="角色名称"
                    className={TITLE_INPUT}
                  />
                  {form.summaryLine ? <p className="text-sm text-ink-muted">{form.summaryLine}</p> : null}
                </div>
                <CharacterInfoSection form={form} onNavigateToCountry={onNavigateToCountry} compact={compact} />
              </div>
            )
          case 'portrait':
            return portraitSection
          case 'animation':
            return animationSection
          case 'relations':
            return relationSection
          case 'summary':
            return summarySection
          case 'tags':
            return tagsSection
          case 'gallery':
            return photoSection
          case 'body':
            return body ?? null
          default:
            return null
        }
      }}
    />
  )
}
