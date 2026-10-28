'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'
import { MultiColumnEditor } from '@/components/shared/MultiColumnEditor'
import { ProfileBannerEditor } from '@/components/shared/ProfileBannerEditor'
import { TITLE_INPUT } from '@/lib/ui-tokens'
import type { Country } from '@/types'
import type { CountryForm } from '../hooks/useCountryForm'
import { CountryEditorList } from './CountryEditorList'
import { CountryRelationSection } from './CountryRelationSection'

interface CountryEditorMultiProps {
  country: Country
  form: CountryForm
  fallbackContent?: string
  railOpen: boolean
  onNavigateToCountry?: (id: number) => void
  onNavigateToCharacter?: (id: number) => void
  onNavigateToEvent?: (id: number) => void
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  onWikiLinkClick?: (id: string) => void
}

/** 三栏国家编辑器：左列表 / 中旗帜+名称+关联 / 右正文。 */
export function CountryEditorMulti({
  country,
  form,
  fallbackContent,
  railOpen,
  onNavigateToCountry,
  onNavigateToCharacter,
  onNavigateToEvent,
  onMentionClick,
  onCharacterCount,
  onWikiLinkClick,
}: CountryEditorMultiProps) {
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)

  return (
    <MultiColumnEditor
      railOpen={railOpen}
      rail={<CountryEditorList currentId={country.id} onSelect={onNavigateToCountry} />}
      meta={
        <div className="flex flex-col gap-6 p-4">
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
          <CountryRelationSection
            form={form}
            onNavigateToCharacter={onNavigateToCharacter}
            onNavigateToEvent={onNavigateToEvent}
          />
        </div>
      }
    >
      <EditorBodyPane editor={bodyEditor}>
        <DocumentEditor
          entityId={country.id}
          entityType="country"
          fallbackContent={fallbackContent}
          onReady={(editor) => {
            setBodyEditor(editor)
            form.handleDocReady(editor)
          }}
          placeholder="政治制度、地理、文化..."
          onMentionClick={onMentionClick}
          onCharacterCount={onCharacterCount}
          onWikiLinkClick={onWikiLinkClick}
          onDocChange={form.handleDocChange}
          showToolbar={false}
        />
      </EditorBodyPane>
    </MultiColumnEditor>
  )
}
