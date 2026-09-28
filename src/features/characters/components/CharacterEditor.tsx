'use client'

import { useEffect } from 'react'
import { Save, ArrowLeft } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Character } from '@/types'
import type { CharacterFormData } from '../types'
import { useCharacter, useUpdateCharacter } from '../hooks/useCharacters'
import { useCharacterForm } from '../hooks/useCharacterForm'
import { ImageGallery } from '@/components/shared/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { CharacterInfoSection } from './CharacterInfoSection'
import { CharacterRelationSection } from './CharacterRelationSection'
import { PAGE_TITLE, SECTION_TITLE } from '@/lib/ui-tokens'

interface CharacterEditorProps {
  editCharacterId: number
  onBack: () => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function CharacterEditor({ editCharacterId, onBack, onNavigateToCharacter, onNavigateToCountry, onMentionClick, onCharacterCount, onWikiLinkClick }: CharacterEditorProps) {
  const { character, loading, error, refresh } = useCharacter(editCharacterId)
  const { updateCharacter } = useUpdateCharacter()

  useEffect(() => {
    refresh()
  }, [editCharacterId, refresh])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onBack}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          返回
        </button>
      </div>
    )
  }

  if (!character) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-ink-muted">角色不存在</span>
        <button
          onClick={onBack}
          className="flex h-9 items-center rounded border border-line px-3 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          返回
        </button>
      </div>
    )
  }

  return (
    <CharacterEditorInner
      key={character.id}
      character={character}
      onBack={onBack}
      onNavigateToCharacter={onNavigateToCharacter}
      onNavigateToCountry={onNavigateToCountry}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
      onSave={async (id, data) => {
        await updateCharacter(id, data)
      }}
    />
  )
}

function CharacterEditorInner({
  character,
  onBack,
  onSave,
  onNavigateToCharacter,
  onNavigateToCountry,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  character: Character
  onBack: () => void
  onSave: (id: number, data: Partial<CharacterFormData>) => Promise<void>
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const form = useCharacterForm(character, onSave)

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex items-center justify-between max-md:fixed max-md:top-0 max-md:left-0 max-md:right-0 md:sticky md:top-0 z-10 border-b border-line px-4 max-md:h-[calc(60px+var(--safe-top))] md:h-12 max-md:pt-[var(--safe-top)] bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
        <div className="flex items-center gap-3">
          <button
            data-mobile-back
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>编辑角色</h2>
        </div>
        <button
          onClick={form.handleSave}
          disabled={form.saving || !form.name.trim()}
          data-save-button
          className="touch-feedback flex h-8 items-center gap-1.5 bg-ink px-3 text-[13px] text-paper transition-opacity hover:bg-ink hover:opacity-85 disabled:opacity-40"
        >
          <Save size={14} strokeWidth={2} />
          <span>{form.saving ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 max-md:pt-[calc(60px+var(--safe-top))]">
        <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={form.headerUrl}
              avatarUrl={form.avatarUrl}
              onHeaderChange={(path) => { form.setHeaderUrl(path); form.markDirty() }}
              onAvatarChange={(path) => { form.setAvatarUrl(path); form.markDirty() }}
              onHeaderRemove={() => { form.setHeaderUrl(''); form.markDirty() }}
              onAvatarRemove={() => { form.setAvatarUrl(''); form.markDirty() }}
            />
          </section>

          {/* ── 内容 ── */}
          <div className="mt-8">
            <div className="flex flex-col gap-8">
              {/* 身份区：名字 / 摘要（头像在头图上） */}
              <div className="flex min-w-0 flex-col gap-1">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => { form.setName(e.target.value); form.markDirty() }}
                  placeholder="角色名称"
                  className="w-full bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
                />
                {form.summaryLine ? (
                  <p className="text-sm text-ink-muted">{form.summaryLine}</p>
                ) : null}
              </div>

              <CharacterInfoSection form={form} onNavigateToCountry={onNavigateToCountry} />

              <div className="border-t border-line" />

              {/* 立绘 */}
              <section>
                <h3 className={SECTION_TITLE}>立绘</h3>
                <ImageGallery
                  mode="grid"
                  gridAspect="portrait"
                  addTile
                  images={form.avatarUrls}
                  enableCrop
                  cropAspect={9 / 16}
                  onAdd={(path) => { form.setAvatarUrls((prev) => [...prev, path]); form.markDirty() }}
                  onRemove={(index) => { form.setAvatarUrls((prev) => prev.filter((_, i) => i !== index)); form.markDirty() }}
                />
              </section>

              <div className="border-t border-line" />

              {/* Bio + LifeStory (merged into one document) */}
              <section>
                <h3 className={SECTION_TITLE}>人物详情</h3>
                <DocumentEditor
                  entityId={character.id}
                  entityType="character"
                  fallbackContent={mergeBioLifeStory(character.bio, character.lifeStory)}
                  onReady={form.handleDocReady}
                  placeholder="编写角色简介..."
                  onMentionClick={onMentionClick}
                  onCharacterCount={onCharacterCount}
                  onWikiLinkClick={onWikiLinkClick}
                  onDocChange={form.markDirty}
                />
              </section>

              <div className="border-t border-line" />

              <CharacterRelationSection form={form} onNavigateToCharacter={onNavigateToCharacter} />

              <div className="border-t border-line" />

              {/* Gallery */}
              <section>
                <h3 className={SECTION_TITLE}>相册</h3>
                <ImageGallery
                  mode="grid"
                  images={form.galleryUrls}
                  onAdd={(path) => { form.setGalleryUrls((prev) => [...prev, path]); form.markDirty() }}
                  onRemove={(index) => { form.setGalleryUrls((prev) => prev.filter((_, i) => i !== index)); form.markDirty() }}
                />
              </section>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

function mergeBioLifeStory(bio: string, lifeStory: string): string | undefined {
  if (!bio && !lifeStory) return undefined
  const parts: string[] = []
  if (bio) parts.push(bio)
  if (lifeStory) {
    parts.push('<h2>人物生平</h2>')
    parts.push(lifeStory)
  }
  return parts.join('\n')
}
