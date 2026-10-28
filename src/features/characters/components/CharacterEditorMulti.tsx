'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { ImageGallery } from '@/components/shared/image-gallery/ImageGallery'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { SECTION_TITLE, TITLE_INPUT } from '@/lib/ui-tokens'
import type { Character } from '@/types'
import type { CharacterForm } from '../hooks/useCharacterForm'
import { CharacterEditorList } from './CharacterEditorList'
import { CharacterInfoSection } from './CharacterInfoSection'
import { CharacterRelationSection } from './CharacterRelationSection'

interface CharacterEditorMultiProps {
  character: Character
  form: CharacterForm
  fallbackContent?: string
  railOpen: boolean
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

/**
 * 三栏角色编辑器（多栏模式）。
 *
 * 左：搜索 + 国家分组的角色列表；中：全部 frontmatter + 上传物；右：只有正文。
 * 右栏的工具条由这里渲染在滚动容器之外，正文再单独限宽 —— 工具条能占满右栏，
 * 正文保持可读行长。
 */
export function CharacterEditorMulti({
  character,
  form,
  fallbackContent,
  railOpen,
  onNavigateToCharacter,
  onNavigateToCountry,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: CharacterEditorMultiProps) {
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)

  return (
    <div className="flex min-h-0 flex-1">
      {railOpen ? (
        <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-line">
          <CharacterEditorList currentId={character.id} onSelect={onNavigateToCharacter} />
        </aside>
      ) : null}

      <section className="w-[340px] shrink-0 overflow-y-auto border-r border-line">
        <div className="flex flex-col gap-6 p-4">
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

          <CharacterInfoSection form={form} onNavigateToCountry={onNavigateToCountry} compact />

          <div className="border-t border-line" />
          <section>
            <h3 className={SECTION_TITLE}>立绘</h3>
            <ImageGallery
              mode="grid"
              columns={3}
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
              columns={3}
              images={form.galleryUrls}
              onAdd={(path) => form.setGalleryUrls((prev) => [...prev, path])}
              onRemove={(index) => form.setGalleryUrls((prev) => prev.filter((_, i) => i !== index))}
            />
          </section>
        </div>
      </section>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {bodyEditor ? <EditorToolbar editor={bodyEditor} sticky={false} /> : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
            <DocumentEditor
              entityId={character.id}
              entityType="character"
              fallbackContent={fallbackContent}
              onReady={(editor) => {
                setBodyEditor(editor)
                form.handleDocReady(editor)
              }}
              placeholder="编写角色简介..."
              onMentionClick={onMentionClick}
              onCharacterCount={onCharacterCount}
              onWikiLinkClick={onWikiLinkClick}
              onDocChange={form.handleDocChange}
              showToolbar={false}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
