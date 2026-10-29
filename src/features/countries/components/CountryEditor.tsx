'use client'

import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import type { Country } from '@/types'
import { EntityDocumentBody } from '@/components/editor/EntityDocumentBody'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'
import { EditorSplitPane } from '@/components/editor/EditorSplitPane'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import { EntityHistoryButton } from '@/features/vault'
import { useEditorLayout } from '@/lib/use-editor-layout'
import { useDevice } from '@/lib/use-device'
import type { CountryFormData } from '../types'
import { useCountry, useUpdateCountry } from '../hooks/useCountries'
import { useCountryForm, mergeCountrySections } from '../hooks/useCountryForm'
import { CountryEditorList } from './CountryEditorList'
import { CountryFrontmatter } from './CountryFrontmatter'
import { BTN_PRIMARY, BTN_QUIET, CENTER_STATE } from '@/lib/ui-tokens'

interface CountryEditorProps {
  editCountryId: number
  onBack: () => void
  onCreate?: () => void
  onNavigateToCountry?: (id: number) => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

export function CountryEditor({
  editCountryId,
  onBack,
  onCreate,
  onNavigateToCountry,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: CountryEditorProps) {
  const { country, loading, error } = useCountry(editCountryId)
  const { updateCountry } = useUpdateCountry()

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

  if (!country) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-ink-muted">国家不存在</span>
        <button onClick={onBack} className={BTN_QUIET}>返回</button>
      </div>
    )
  }

  return (
    <CountryEditorInner
      country={country}
      onBack={onBack}
      onCreate={onCreate}
      onSave={async (id, data) => {
        await updateCountry(id, data)
      }}
      onNavigateToCountry={onNavigateToCountry}
      onNavigateToCharacter={onNavigateToCharacter}
      onNavigateToEvent={onNavigateToEvent}
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
    />
  )
}

function CountryEditorInner({
  country,
  onBack,
  onCreate,
  onSave,
  onNavigateToCountry,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: {
  country: Country
  onBack: () => void
  onCreate?: () => void
  onSave: (id: number, data: Partial<CountryFormData>) => Promise<void>
  onNavigateToCountry?: (id: number) => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}) {
  const form = useCountryForm(country, onSave)
  const { isMobile } = useDevice()
  const [listOpen, setListOpen] = useState(!isMobile)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const desiredLayout = useEditorLayout()
  const [layout, setLayout] = useState<'multi' | 'full'>(desiredLayout)

  useEffect(() => {
    if (desiredLayout === layout) return
    if (form.docDirty) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(desiredLayout)
  }, [desiredLayout, layout, form.docDirty])

  const headerActions = (
    <>
      <EntityHistoryButton table="countries" id={country.id} name={form.name} />
      <button
        onClick={form.handleSave}
        disabled={form.saving || !form.name.trim()}
        data-save-button
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
      entityId={country.id}
      entityType="country"
      fallbackContent={mergeCountrySections(country.system, country.geography, country.culture)}
      onReady={handleBodyReady}
      placeholder="政治制度、地理、文化..."
      onMentionClick={onMentionClick}
      onCharacterCount={onCharacterCount}
      onWikiLinkClick={onWikiLinkClick}
      onDocChange={form.handleDocChange}
    />
  )

  return (
    <EntityEditorShell
      title="编辑国家"
      onBack={onBack}
      listOpen={listOpen}
      onToggleList={() => setListOpen((open) => !open)}
      list={
        <CountryEditorList
          currentId={country.id}
          onSelect={onNavigateToCountry}
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
            <CountryFrontmatter
              form={form}
              compact
              onNavigateToCharacter={onNavigateToCharacter}
              onNavigateToEvent={onNavigateToEvent}
            />
          }
        >
          <EditorBodyPane editor={bodyEditor} showToolbar={false}>
            <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">{body}</div>
          </EditorBodyPane>
        </EditorSplitPane>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
            <CountryFrontmatter
              form={form}
              compact={false}
              onNavigateToCharacter={onNavigateToCharacter}
              onNavigateToEvent={onNavigateToEvent}
            />
            <div className="mt-8 border-t border-line" />
            <div className="mt-8">{body}</div>
          </div>
        </div>
      )}
    </EntityEditorShell>
  )
}
