'use client'

import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { ImageGallery, type ImageGalleryHandle } from '@/components/shared/image-gallery/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TemplateRenderer } from '@/components/shared/TemplateRenderer'
import { useTemplates } from '@/lib/templates/store'
import { componentParam } from '@/lib/templates/params'
import { ADD_ACTION, SECTION_TITLE_BARE, TITLE_INPUT } from '@/lib/ui-tokens'
import type { CharacterForm } from '../hooks/useCharacterForm'
import { CharacterInfoSection } from './CharacterInfoSection'
import { CharacterRelationSection } from './CharacterRelationSection'

interface CharacterFrontmatterProps {
  form: CharacterForm
  compact: boolean
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
}

/**
 * 角色 frontmatter：**由模板决定区块顺序与开关**（阶段一，数据仍写原列）。
 *
 * 映射（进度见 `src/lib/templates/support.ts`）：
 * - `cover`     → 头图 + 头像
 * - `info`      → 名称 / 一句话 / 字段表 / **立绘**（立绘是基本信息组里的 atom，见 `模板.md §6.2`）
 * - `relations` → 关系
 * - `gallery`   → 相册
 *
 * 正文由 `EntityDocumentBody` 在编辑器壳里单独渲染，所以模板里的 `body` 这里返回 `null`。
 */
export function CharacterFrontmatter({
  form,
  compact,
  onNavigateToCharacter,
  onNavigateToCountry,
}: CharacterFrontmatterProps) {
  const portraitGallery = useRef<ImageGalleryHandle>(null)
  const photoGallery = useRef<ImageGalleryHandle>(null)
  const { templates } = useTemplates()
  const template = templates.find((doc) => doc.id === 'character')

  // 相册列数：模板参数 `columns` 优先，缺省按布局 3 / 4
  const galleryComponent = template?.components.find((component) => component.id === 'gallery')
  const templateColumns = Number(componentParam(galleryComponent, 'columns', compact ? 3 : 4))
  const columns = templateColumns > 0 ? Math.min(6, Math.max(1, templateColumns)) : compact ? 3 : 4
  const galleryMode = componentParam(galleryComponent, 'mode', 'grid') === 'slider' ? 'slider' : 'grid'
  const galleryTitle = componentParam(galleryComponent, 'title', true) !== false
  const relationComponent = template?.components.find((component) => component.id === 'relations')
  const relationPresentation =
    componentParam(relationComponent, 'presentation', 'table') === 'compact' ? 'compact' : 'table'
  const relationTitle = componentParam(relationComponent, 'title', true) !== false

  const portraitSection = (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className={SECTION_TITLE_BARE}>立绘</h3>
        <button type="button" onClick={() => portraitGallery.current?.add()} className={ADD_ACTION}>
          <Plus size={12} strokeWidth={2} />
          <span>添加</span>
        </button>
      </div>
      <ImageGallery
        ref={portraitGallery}
        mode="grid"
        columns={columns}
        gridAspect="portrait"
        externalAdd
        images={form.avatarUrls}
        enableCrop
        cropAspect={9 / 16}
        onAdd={(path) => form.setAvatarUrls((prev) => [...prev, path])}
        onRemove={(index) => form.setAvatarUrls((prev) => prev.filter((_, i) => i !== index))}
      />
    </section>
  )

  const photoSection = (
    <section>
      {galleryTitle ? (
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className={SECTION_TITLE_BARE}>相册</h3>
          <button type="button" onClick={() => photoGallery.current?.add()} className={ADD_ACTION}>
            <Plus size={12} strokeWidth={2} />
            <span>添加</span>
          </button>
        </div>
      ) : (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => photoGallery.current?.add()} className={ADD_ACTION}>
            <Plus size={12} strokeWidth={2} />
            <span>添加</span>
          </button>
        </div>
      )}
      <ImageGallery
        ref={photoGallery}
        mode={galleryMode}
        columns={columns}
        externalAdd
        images={form.galleryUrls}
        onAdd={(path) => form.setGalleryUrls((prev) => [...prev, path])}
        onRemove={(index) => form.setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
      />
    </section>
  )

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
        <CharacterRelationSection form={form} onNavigateToCharacter={onNavigateToCharacter} />
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
                avatarUrl={form.avatarUrl}
                onHeaderChange={form.setHeaderUrl}
                onAvatarChange={form.setAvatarUrl}
                onHeaderRemove={() => form.setHeaderUrl('')}
                onAvatarRemove={() => form.setAvatarUrl('')}
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
                {portraitSection}
              </div>
            )
          case 'relations':
            return (
              <CharacterRelationSection
                form={form}
                onNavigateToCharacter={onNavigateToCharacter}
                presentation={relationPresentation}
                showTitle={relationTitle}
              />
            )
          case 'gallery':
            return photoSection
          default:
            return null
        }
      }}
    />
  )
}
