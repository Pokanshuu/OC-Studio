'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDevice } from '@/lib/use-device'
import type { WorldEntry } from '@/types'
import type { Editor } from '@tiptap/core'
import { EntityHistoryButton } from '@/features/vault'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import { useEntryList, useEntry, useCreateEntry, useDeleteEntry } from '../hooks/useWorldEntries'
import { renameEntry, reorderEntries, updateEntry } from '../services'
import { useFields } from '@/lib/fields'
import type { WorldFormData } from '../types'
import { useWorldEntryDraft } from '../hooks/useWorldEntryDraft'
import { WorldFrontmatter } from './WorldFrontmatter'
import { WorldTreePanel } from './WorldTreePanel'
import { WorldEntryBody } from './WorldEntryBody'
import { docHasRef, filterEntriesWithAncestors } from './world-content-utils'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'

interface WorldLayoutProps {
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  selectedEntryId?: number | null
  onWikiLinkClick?: (id: string) => void
}

export function WorldLayout({ onMentionClick, onCharacterCount, selectedEntryId, onWikiLinkClick }: WorldLayoutProps) {
  const { entries, loading, error, refresh } = useEntryList()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [showMobileTree, setShowMobileTree] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [treeQuery, setTreeQuery] = useState('')
  const [tags, setTags] = useState<number[]>([])
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const worldFields = useFields('worldEntry')
  const showTags = worldFields.some((field) => field.id === 'tags')
  const { createEntry } = useCreateEntry()
  const { deleteEntry } = useDeleteEntry()
  const { isMobile } = useDevice()
  const { setConfig } = useMobilePageHeader()
  const { section } = useMobileNavigation()

  // Set page title — only when this section is active
  useEffect(() => {
    if (isMobile && section === 'wiki') setConfig('世界观')
    else setConfig(null)
  }, [isMobile, section, setConfig])

  // Listen for mobile top bar toggle event
  useEffect(() => {
    const handler = () => setShowMobileTree(true)
    window.addEventListener('worldToggle', handler)
    return () => window.removeEventListener('worldToggle', handler)
  }, [])

  const { entry: currentEntry } = useEntry(selectedId)

  const {
    handleContentChange,
    handleTitleChange,
    handleEditorReady,
    flushSave,
    selectedIdRef,
  } = useWorldEntryDraft({ selectedId, currentEntry, refresh, title, setTitle })

  // 被引用：哪些词条在正文里 [[链接]] 或 @ 引用了当前词条
  const backlinks = useMemo(() => {
    if (selectedId == null) return [] as { id: number; title: string }[]
    const idStr = String(selectedId)
    const found: { id: number; title: string }[] = []
    for (const e of entries) {
      if (e.id == null || e.id === selectedId) continue
      if (typeof e.content !== 'string' || !e.content.includes(idStr)) continue
      try {
        if (docHasRef(JSON.parse(e.content), idStr)) found.push({ id: e.id, title: e.title })
      } catch {
        // 旧数据可能不是 JSON，忽略
      }
    }
    return found
  }, [entries, selectedId])

  const visibleEntries = useMemo(
    () => filterEntriesWithAncestors(entries, treeQuery),
    [entries, treeQuery],
  )

  const handleTagsChange = useCallback((ids: number[]) => {
    setTags(ids)
    if (selectedIdRef.current == null) return
    void updateEntry(selectedIdRef.current, { tags: ids }).catch(() => {})
  }, [selectedIdRef])

  const handleSelect = useCallback(async (id: number, entry: WorldEntry) => {
    if (selectedIdRef.current === id) return
    await flushSave()
    setSelectedId(id)
    setTitle(entry.title)
    setTags(entry.tags ?? [])
    setShowMobileTree(false)
  }, [flushSave, selectedIdRef])

  const handleCreate = useCallback(async (parentId: number | null, entryTitle: string) => {
    await flushSave()
    const data: WorldFormData = {
      title: entryTitle,
      content: '',
      parentId,
      order: 0,
      isConcept: false,
      tags: [],
    }
    const newId = await createEntry(data)
    setSelectedId(newId)
    setTitle(entryTitle)
    setTags([])
    refresh()
  }, [flushSave, createEntry, refresh])

  const handleDelete = useCallback((id: number) => {
    deleteEntry(id).then(() => {
      if (selectedId === id) setSelectedId(null)
      refresh()
    }).catch(() => {})
  }, [deleteEntry, refresh, selectedId])

  const handleRename = useCallback((id: number, newTitle: string) => {
    renameEntry(id, newTitle).then(() => { refresh() }).catch(() => {})
  }, [refresh])

  const handleReorder = useCallback((updates: { id: number; parentId: number | null; order: number }[]) => {
    reorderEntries(updates).then(() => { refresh() }).catch(() => {})
  }, [refresh])

  useEffect(() => {
    if (selectedEntryId == null || selectedEntryId === selectedIdRef.current) return
    const entry = entries.find((e) => e.id === selectedEntryId)
    if (!entry) return
    void flushSave().then(() => {
      setSelectedId(selectedEntryId)
      setTitle(entry.title)
      setTags(entry.tags ?? [])
    })
  }, [selectedEntryId, entries, flushSave, selectedIdRef])

  const handleBodyReady = (editor: Editor) => {
    setBodyEditor(editor)
    handleEditorReady(editor)
  }

  const handleToggleList = () => {
    if (isMobile) {
      setShowMobileTree((open) => !open)
      return
    }
    setTreeCollapsed((collapsed) => !collapsed)
  }

  const treePanel = (
    <WorldTreePanel
      entries={visibleEntries}
      selectedId={selectedId}
      onSelect={handleSelect}
      onCreate={handleCreate}
      onDelete={handleDelete}
      onRename={handleRename}
      onReorder={handleReorder}
      treeQuery={treeQuery}
      onTreeQueryChange={setTreeQuery}
      treeCollapsed={treeCollapsed}
      onToggleTreeCollapsed={() => setTreeCollapsed((collapsed) => !collapsed)}
      isMobile={isMobile}
      onCloseMobileTree={() => setShowMobileTree(false)}
    />
  )

  return (
    <>
      {isMobile ? (
        <div className={`fixed inset-0 z-50 transition-all duration-200 ${showMobileTree ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${showMobileTree ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowMobileTree(false)} />
          <div className={`absolute top-0 bottom-0 left-0 w-[280px] transition-transform duration-200 ease-out ${showMobileTree ? 'translate-x-0' : '-translate-x-full'}`}>
            {treePanel}
          </div>
        </div>
      ) : null}

      <EntityEditorShell
        title="编辑词条"
        listOpen={!isMobile && !treeCollapsed}
        onToggleList={handleToggleList}
        list={treePanel}
        editor={bodyEditor}
        headerRight={
          currentEntry ? (
            <EntityHistoryButton table="worldEntries" id={currentEntry.id} name={title} />
          ) : null
        }
      >
        {selectedId !== null && currentEntry ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="h-12 shrink-0" aria-hidden />
            <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
              <WorldFrontmatter
                title={title}
                onTitleChange={handleTitleChange}
                tags={tags}
                onTagsChange={handleTagsChange}
                showTags={showTags}
                backlinks={backlinks}
                onSelectBacklink={(id) => {
                  const target = entries.find((e) => e.id === id)
                  if (target) void handleSelect(id, target)
                }}
                compact={false}
              />
              <div className="mt-8 border-t border-line" />
              <div className="mt-8">
                <WorldEntryBody
                  selectedId={selectedId}
                  pane={false}
                  onReady={handleBodyReady}
                  onContentChange={handleContentChange}
                  onMentionClick={onMentionClick}
                  onCharacterCount={onCharacterCount}
                  onWikiLinkClick={onWikiLinkClick}
                />
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-[13px] text-ink-faint">加载中…</span>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-error">{error}</span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-ink-muted">
              {entries.length === 0 ? '暂无词条，从左侧创建' : '选择一个词条或新建词条'}
            </p>
          </div>
        )}
      </EntityEditorShell>
    </>
  )
}
