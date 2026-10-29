'use client'

import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { EntityDocumentBody } from '@/components/editor/EntityDocumentBody'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'
import { EditorSplitPane } from '@/components/editor/EditorSplitPane'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import type { Character } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { useEditorLayout } from '@/lib/use-editor-layout'
import { useDevice } from '@/lib/use-device'
import type { CharacterFormData } from '../types'
import { useCharacter, useUpdateCharacter } from '../hooks/useCharacters'
import { useCharacterForm } from '../hooks/useCharacterForm'
import { CharacterEditorList } from './CharacterEditorList'
import { CharacterFrontmatter } from './CharacterFrontmatter'
import { BTN_PRIMARY, BTN_QUIET, CENTER_STATE } from '@/lib/ui-tokens'

interface CharacterEditorProps {
  editCharacterId: number
  onBack: () => void
  onCreate?: () => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function CharacterEditor({ editCharacterId, onBack, onCreate, onNavigateToCharacter, onNavigateToCountry, onMentionClick, onCharacterCount, onWikiLinkClick }: CharacterEditorProps) {
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
        <button onClick={onBack} className={BTN_QUIET}>返回</button>
      </div>
    )
  }

  if (!character) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-ink-muted">角色不存在</span>
        <button onClick={onBack} className={BTN_QUIET}>返回</button>
      </div>
    )
  }

  return (
    <CharacterEditorInner
      key={character.id}
      character={character}
      onBack={onBack}
      onCreate={onCreate}
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
  onCreate,
  onSave,
  onNavigateToCharacter,
  onNavigateToCountry,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  character: Character
  onBack: () => void
  onCreate?: () => void
  onSave: (id: number, data: Partial<CharacterFormData>) => Promise<void>
  onNavigateToCharacter?: (id: number) => void
  onNavigateToCountry?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const form = useCharacterForm(character, onSave)
  const { handleSave, docDirty } = form
  const { isMobile } = useDevice()
  const [listOpen, setListOpen] = useState(!isMobile)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const desiredLayout = useEditorLayout()
  const [layout, setLayout] = useState<'multi' | 'full'>(desiredLayout)

  // 保存函数身份会随表单变化；用 ref 拿最新值，避免 auto-save effect 被反复触发。
  const saveRef = useRef(handleSave)
  useEffect(() => {
    saveRef.current = handleSave
  }, [handleSave])

  // 布局实时跟随设置/窗口；正文有未保存改动时先自动保存，再切布局（切布局会重挂 TipTap）。
  useEffect(() => {
    if (desiredLayout === layout) return
    if (!docDirty) {
      // 布局是设置/窗口的派生状态。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLayout(desiredLayout)
      return
    }
    let cancelled = false
    void saveRef.current().then(() => {
      if (!cancelled) setLayout(desiredLayout)
    })
    return () => {
      cancelled = true
    }
  }, [desiredLayout, layout, docDirty])

  const headerActions = (
    <>
      <EntityHistoryButton table="characters" id={character.id} name={form.name} />
      <button
        onClick={form.handleSave}
        disabled={form.saving || !form.name.trim()}
        data-save-button
        aria-label={form.saving ? '保存中' : '保存'}
        title={form.saving ? '保存中' : '保存'}
        className={BTN_PRIMARY}
      >
        <Save size={14} strokeWidth={2} />
        <span>{form.saving ? '保存中...' : '保存'}</span>
      </button>
    </>
  )

  const handleBodyReady = (editor: Editor) => {
    setBodyEditor(editor)
    form.handleDocReady(editor)
  }

  const body = (
    <EntityDocumentBody
      entityId={character.id}
      entityType="character"
      fallbackContent={mergeBioLifeStory(character.bio, character.lifeStory)}
      onReady={handleBodyReady}
      placeholder="编写角色简介..."
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
      onDocChange={form.handleDocChange}
    />
  )

  return (
    <EntityEditorShell
      title="编辑角色"
      onBack={onBack}
      listOpen={listOpen}
      onToggleList={() => setListOpen((open) => !open)}
      list={
        <CharacterEditorList
          currentId={character.id}
          onSelect={onNavigateToCharacter}
          onCollapse={() => setListOpen(false)}
          onCreate={onCreate}
        />
      }
      editor={bodyEditor}
      headerRight={headerActions}
    >
      {layout === 'multi' ? (
        <EditorSplitPane
          meta={
            <CharacterFrontmatter
              form={form}
              compact
              onNavigateToCharacter={onNavigateToCharacter}
              onNavigateToCountry={onNavigateToCountry}
            />
          }
        >
          <EditorBodyPane editor={bodyEditor} showToolbar={false}>
            {body}
          </EditorBodyPane>
        </EditorSplitPane>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="h-12 shrink-0" aria-hidden />
          <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
            <CharacterFrontmatter
              form={form}
              compact={false}
              onNavigateToCharacter={onNavigateToCharacter}
              onNavigateToCountry={onNavigateToCountry}
            />
            <div className="mt-8 border-t border-line" />
            <div className="mt-8">{body}</div>
          </div>
        </div>
      )}
    </EntityEditorShell>
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
