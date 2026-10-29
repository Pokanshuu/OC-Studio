'use client'

import { ImageGallery } from '@/components/shared/image-gallery/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { SECTION_TITLE, TITLE_INPUT } from '@/lib/ui-tokens'
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
 * 角色 frontmatter：封面/头像、名字、字段、立绘、关系、相册。
 * 分栏时放中栏（compact），全屏时按整列展开；正文由 EntityDocumentBody 单独复用。
 */
export function CharacterFrontmatter({
  form,
  compact,
  onNavigateToCharacter,
  onNavigateToCountry,
}: CharacterFrontmatterProps) {
  const columns = compact ? 3 : 4

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
      <section>
        <h3 className={SECTION_TITLE}>立绘</h3>
        <ImageGallery
          mode="grid"
          columns={columns}
          gridAspect="portrait"
          addTile
          images={form.avatarUrls}
          enableCrop
          cropAspect={9 / 16}
          onAdd={(path) => form.setAvatarUrls((prev) => [...prev, path])}
          onRemove={(index) => form.setAvatarUrls((prev) => prev.filter((_, i) => i !== index))}
        />
      </section>

      <div className="border-t border-line" />
      <CharacterRelationSection form={form} onNavigateToCharacter={onNavigateToCharacter} />

      <div className="border-t border-line" />
      <section>
        <h3 className={SECTION_TITLE}>相册</h3>
        <ImageGallery
          mode="grid"
          columns={columns}
          images={form.galleryUrls}
          onAdd={(path) => form.setGalleryUrls((prev) => [...prev, path])}
          onRemove={(index) => form.setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
        />
      </section>
    </div>
  )
}
