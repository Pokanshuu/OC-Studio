'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { useDevice } from '@/lib/use-device'
import { useInitialEditorLayout } from '@/lib/use-initial-editor-layout'
import type { WorldEntry } from '@/types'
import { EntityHistoryButton } from '@/features/vault'
import { useEntryList, useEntry, useCreateEntry, useDeleteEntry } from '../hooks/useWorldEntries'
import { renameEntry, reorderEntries, updateEntry } from '../services'
import { TagPicker } from '@/features/tags'
import { FIELD_LABEL, FIELD_ROW_TOP, ICON_BTN_MD, LIST_END, SECTION_TITLE } from '@/lib/ui-tokens'
import { useFields } from '@/lib/fields'
import type { WorldFormData } from '../types'
import { useWorldEntryDraft } from '../hooks/useWorldEntryDraft'
import { WorldTreePanel } from './WorldTreePanel'
import { WorldEntryBody } from './WorldEntryBody'
import { docHasRef, filterEntriesWithAncestors } from './world-content-utils'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'

interface WorldLayoutProps {  onMentionClick?: (id: string, entityType?: string) => void
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
  // 词条的两行也受字段表管：删掉就不渲染（数据留在条目上）
  const worldFields = useFields('worldEntry')
  const showTags = worldFields.some((field) => field.id === 'tags')
  const { createEntry } = useCreateEntry()
  const { deleteEntry } = useDeleteEntry()
  const { isMobile } = useDevice()
  const { setConfig } = useMobilePageHeader()
  const { section } = useMobileNavigation()
  const layout = useInitialEditorLayout()

  const editorContainerRef = useRef<HTMLDivElement>(null)

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
      onToggleTreeCollapsed={() => setTreeCollapsed(!treeCollapsed)}
      isMobile={isMobile}
      onCloseMobileTree={() => setShowMobileTree(false)}
    />
  )

  return (
    <div className="flex h-full">
      {!isMobile ? (
        <div className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out ${treeCollapsed ? 'w-0' : 'w-[200px]'}`}>
          {treePanel}
        </div>
      ) : null}

      {isMobile ? (
        <div className={`fixed inset-0 z-50 transition-all duration-200 ${showMobileTree ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ${showMobileTree ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowMobileTree(false)} />
          <div className={`absolute top-0 bottom-0 left-0 w-[280px] transition-transform duration-200 ease-out ${showMobileTree ? 'translate-x-0' : '-translate-x-full'}`}>
            {treePanel}
          </div>
        </div>
      ) : null}

      {layout === 'multi' && !isMobile && selectedId !== null && currentEntry ? (
        <div className="flex min-h-0 flex-1">
          <section className="w-[340px] shrink-0 overflow-y-auto border-r border-line">
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-center gap-2">
                {treeCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setTreeCollapsed(false)}
                    className={ICON_BTN_MD}
                    title="展开目录"
                    aria-label="展开目录"
                  >
                    <Menu size={16} strokeWidth={2} />
                  </button>
                ) : null}
                <input
                  type="text"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="词条标题"
                  className="h-8 min-w-0 flex-1 bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
                />
                <EntityHistoryButton table="worldEntries" id={currentEntry.id} name={title} />
              </div>

              <div className={`flex flex-col ${LIST_END}`}>
                {showTags ? (
                  <div className={FIELD_ROW_TOP}>
                    <span className={FIELD_LABEL}>标签</span>
                    <div className="min-w-0 flex-1">
                      <TagPicker selectedIds={tags} onChange={handleTagsChange} />
                    </div>
                  </div>
                ) : null}

                {backlinks.length > 0 ? (
                  <div className={FIELD_ROW_TOP}>
                    <span className={FIELD_LABEL}>被引用</span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
                      {backlinks.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => {
                            const target = entries.find((e) => e.id === b.id)
                            if (target) void handleSelect(b.id, target)
                          }}
                          className="text-[13px] text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                        >
                          {b.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <WorldEntryBody
            selectedId={selectedId}
            pane
            onReady={handleEditorReady}
            onContentChange={handleContentChange}
            onMentionClick={onMentionClick}
            onCharacterCount={onCharacterCount}
            onWikiLinkClick={onWikiLinkClick}
          />
        </div>
      ) : (
      <div
        className="flex flex-1 flex-col min-w-0 overflow-auto max-md:overflow-visible"
        ref={editorContainerRef}
      >
        <div className="md:hidden h-[calc(60px+var(--safe-top))] flex-shrink-0" />
        {selectedId !== null && currentEntry ? (
          <>
            <div className="flex-1">
              <div className="flex h-12 items-center gap-2 sticky top-0 max-md:top-[calc(60px+var(--safe-top))] z-10 border-b border-line px-4 bg-paper/85 backdrop-blur-lg">
                {treeCollapsed && !isMobile ? (
                  <button
                    onClick={() => setTreeCollapsed(false)}
                    className={ICON_BTN_MD}
                    title="展开目录"
                  >
                    <Menu size={16} strokeWidth={2} />
                  </button>
                ) : null}
                <input
                  type="text"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="词条标题"
                  className="h-8 flex-1 min-w-0 bg-transparent font-serif text-lg text-ink placeholder:text-ink-faint focus:outline-none"
                />
                <EntityHistoryButton table="worldEntries" id={currentEntry.id} name={title} />
              </div>

              <div className="mx-auto w-full max-w-3xl px-4 md:px-8">
                {/* 属性：分类 / 标签 / 被引用，与编辑器同一套字段行 */}
                <section className="mt-8">
                  <div className={`grid grid-cols-1 gap-x-10 sm:grid-cols-2 ${LIST_END}`}>
                    {showTags ? (
                    <div className={`${FIELD_ROW_TOP} sm:col-span-2`}>
                      <span className={FIELD_LABEL}>标签</span>
                      <div className="min-w-0 flex-1">
                        <TagPicker selectedIds={tags} onChange={handleTagsChange} />
                      </div>
                    </div>
                    ) : null}

                    {backlinks.length > 0 ? (
                      <div className={`${FIELD_ROW_TOP} sm:col-span-2`}>
                        <span className={FIELD_LABEL}>被引用</span>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
                          {backlinks.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => {
                                const target = entries.find((e) => e.id === b.id)
                                if (target) void handleSelect(b.id, target)
                              }}
                              className="text-[13px] text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
                            >
                              {b.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                <div className="mt-8 border-t border-line" />

                <section className="mt-8 pb-24 md:pb-16">
                  <h3 className={SECTION_TITLE}>正文</h3>
                  <WorldEntryBody
                    selectedId={selectedId}
                    pane={false}
                    onReady={handleEditorReady}
                    onContentChange={handleContentChange}
                    onMentionClick={onMentionClick}
                    onCharacterCount={onCharacterCount}
                    onWikiLinkClick={onWikiLinkClick}
                  />
                </section>
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[13px] text-ink-faint">加载中…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-error">{error}</span>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              {isMobile ? (
                <button
                  onClick={() => setShowMobileTree(true)}
                  className={`mx-auto mb-4 ${ICON_BTN_MD}`}
                >
                  <Menu size={20} strokeWidth={2} />
                </button>
              ) : treeCollapsed ? (
                <button
                  onClick={() => setTreeCollapsed(false)}
                  className={`mx-auto mb-4 ${ICON_BTN_MD}`}
                >
                  <Menu size={20} strokeWidth={2} />
                </button>
              ) : null}
              <p className="text-sm text-ink-muted">
                {entries.length === 0 ? '暂无词条，从左侧创建' : '选择一个词条或新建词条'}
              </p>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
