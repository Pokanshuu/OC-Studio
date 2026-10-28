'use client'

import { useEffect, useState } from 'react'
import { Save, ArrowLeft, ChevronLeft, Menu } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import type { Character } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { useInitialEditorLayout } from '@/lib/use-initial-editor-layout'
import type { CharacterFormData } from '../types'
import { useCharacter, useUpdateCharacter } from '../hooks/useCharacters'
import { useCharacterForm } from '../hooks/useCharacterForm'
import { ImageGallery } from '@/components/shared/image-gallery/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { CharacterInfoSection } from './CharacterInfoSection'
import { CharacterRelationSection } from './CharacterRelationSection'
import { CharacterEditorMulti } from './CharacterEditorMulti'
import { BTN_PRIMARY, BTN_QUIET, CENTER_STATE, EDITOR_BODY, EDITOR_HEADER, ICON_BTN_MD, PAGE_TITLE, SECTION_TITLE, TITLE_INPUT } from '@/lib/ui-tokens'

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
      <div className={CENTER_STATE}>
        <span className="text-sm text-error">{error}</span>
        <button
          onClick={onBack}
          className={BTN_QUIET}
        >
          返回
        </button>
      </div>
    )
  }

  if (!character) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-ink-muted">角色不存在</span>
        <button
          onClick={onBack}
          className={BTN_QUIET}
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
  const [railOpen, setRailOpen] = useState(true)
  // 布局在「这篇角色」挂载时定一次：inner 以角色 id 为 key，换人会重新挂载；
  // 同一篇内改设置不立即换布局（切换会重挂 TipTap，未保存正文会丢）。
  const layout = useInitialEditorLayout()

  return (
    <div className={layout === 'multi' ? 'flex h-full min-h-0 flex-col' : 'flex min-h-full flex-col'}>
      <div className={EDITOR_HEADER}>
        <div className="flex items-center gap-3">
          {layout === 'multi' ? (
            <button
              type="button"
              onClick={() => setRailOpen((open) => !open)}
              className={ICON_BTN_MD}
              title={railOpen ? '收起列表' : '展开列表'}
              aria-label={railOpen ? '收起列表' : '展开列表'}
            >
              {railOpen ? <ChevronLeft size={16} strokeWidth={2} /> : <Menu size={16} strokeWidth={2} />}
            </button>
          ) : null}
          <button
            data-mobile-back
            onClick={onBack}
            className={ICON_BTN_MD}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <h2 className={PAGE_TITLE}>编辑角色</h2>
        </div>
        <div className="flex items-center gap-1">
          <EntityHistoryButton table="characters" id={character.id} name={form.name} />
          <button
            onClick={form.handleSave}
            disabled={form.saving || !form.name.trim()}
            data-save-button
            className={BTN_PRIMARY}
          >
            <Save size={14} strokeWidth={2} />
            <span>{form.saving ? '保存中...' : '保存'}</span>
          </button>
        </div>
      </div>

      {layout === 'multi' ? (
        <CharacterEditorMulti
          character={character}
          form={form}
          fallbackContent={mergeBioLifeStory(character.bio, character.lifeStory)}
          railOpen={railOpen}
          onNavigateToCharacter={onNavigateToCharacter}
          onNavigateToCountry={onNavigateToCountry}
          onMentionClick={onMentionClick}
          onCharacterCount={onCharacterCount}
          onWikiLinkClick={onWikiLinkClick}
        />
      ) : (
        <div className={EDITOR_BODY}>
        <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
          {/* Profile header */}
          <section>
            <ProfileBannerEditor
              headerUrl={form.headerUrl}
              avatarUrl={form.avatarUrl}
              onHeaderChange={form.setHeaderUrl}
              onAvatarChange={form.setAvatarUrl}
              onHeaderRemove={() => form.setHeaderUrl('')}
              onAvatarRemove={() => form.setAvatarUrl('')}
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
                  onChange={(e) => form.setName(e.target.value)}
                  placeholder="角色名称"
                  className={TITLE_INPUT}
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
                  onAdd={(path) => form.setAvatarUrls((prev) => [...prev, path])}
                  onRemove={(index) => form.setAvatarUrls((prev) => prev.filter((_, i) => i !== index))}
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
                  onDocChange={form.handleDocChange}
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
                  onAdd={(path) => form.setGalleryUrls((prev) => [...prev, path])}
                  onRemove={(index) => form.setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
                />
              </section>
            </div>
          </div>
        </div>
        </div>
      )}

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

