'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Plus, Menu, ChevronLeft, Search } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { useDevice } from '@/lib/use-device'
import type { WorldEntry } from '@/types'
import { useEntryList, useEntry, useCreateEntry, useDeleteEntry } from '../hooks/useWorldEntries'
import { saveEntryContent, renameEntry, reorderEntries, updateEntry } from '../services'
import { TagPicker } from '@/features/tags'
import { FIELD_LABEL, FIELD_ROW, FIELD_ROW_TOP, PAGE_TITLE, SECTION_TITLE } from '@/lib/ui-tokens'
import { syncReferenceLabels } from '@/lib/reference-sync'
import type { WorldFormData } from '../types'
import { WorldTree } from './WorldTree'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'

function parseEditorContent(content: string): object | string {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content) as unknown
    if (parsed && typeof parsed === 'object') return parsed as object
    return content
  } catch {
    return content
  }
}

/** 判断一份 TipTap JSON 文档里是否引用了某个实体（wikiLink / mention） */
function docHasRef(node: unknown, idStr: string): boolean {
  if (Array.isArray(node)) return node.some((n) => docHasRef(n, idStr))
  if (!node || typeof node !== 'object') return false
  const n = node as Record<string, unknown>
  if ((n.type === 'wikiLink' || n.type === 'mention') && n.attrs && typeof n.attrs === 'object') {
    if (String((n.attrs as Record<string, unknown>).id) === idStr) return true
  }
  return Array.isArray(n.content) ? docHasRef(n.content, idStr) : false
}

/** 目录搜索：命中项的祖先一并保留，维持树的形状 */
function filterEntriesWithAncestors(entries: WorldEntry[], query: string): WorldEntry[] {
  const key = query.trim().toLowerCase()
  if (!key) return entries
  const byId = new Map<number, WorldEntry>()
  for (const e of entries) if (e.id != null) byId.set(e.id, e)
  const keep = new Set<number>()
  for (const e of entries) {
    if (e.id == null || !e.title.toLowerCase().includes(key)) continue
    keep.add(e.id)
    let parent = e.parentId
    while (parent != null && !keep.has(parent)) {
      keep.add(parent)
      parent = byId.get(parent)?.parentId ?? null
    }
  }
  return entries.filter((e) => e.id != null && keep.has(e.id))
}

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
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState<number[]>([])
  const { createEntry } = useCreateEntry()
  const { deleteEntry } = useDeleteEntry()
  const { isMobile } = useDevice()
  const { setConfig } = useMobilePageHeader()
  const { section } = useMobileNavigation()

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

  const editorRef = useRef<Editor | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ title: string; content: string } | null>(null)
  const selectedIdRef = useRef<number | null>(null)
  const saveEnabledRef = useRef(false)
  const currentEntryRef = useRef<WorldEntry | undefined>(undefined)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const { entry: currentEntry } = useEntry(selectedId)
  useEffect(() => { currentEntryRef.current = currentEntry }, [currentEntry])

  // 已有分类（去重，供输入建议 —— 防止「地理 / 地理志」这类分裂）
  const categories = useMemo(
    () => Array.from(new Set(entries.map((e) => e.category).filter(Boolean))).sort(),
    [entries],
  )

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

  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value)
    if (selectedIdRef.current == null) return
    void updateEntry(selectedIdRef.current, { category: value }).catch(() => {})
  }, [])

  const handleTagsChange = useCallback((ids: number[]) => {
    setTags(ids)
    if (selectedIdRef.current == null) return
    void updateEntry(selectedIdRef.current, { tags: ids }).catch(() => {})
  }, [])

  const flushSave = useCallback(async () => {
    if (!selectedIdRef.current || !pendingSaveRef.current) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const { title: t, content: c } = pendingSaveRef.current
    try {
      const doc = JSON.parse(c) as Record<string, unknown>
      const synced = await syncReferenceLabels(doc)
      await saveEntryContent(selectedIdRef.current, t, JSON.stringify(synced))
      pendingSaveRef.current = null
      refresh()
    } catch (err) {
      console.error(`[save] flushSave 写入失败:`, err)
    }
  }, [refresh])

  const scheduleSave = useCallback((newTitle: string, json: object) => {
    if (!selectedIdRef.current) return
    const contentStr = JSON.stringify(json)
    pendingSaveRef.current = { title: newTitle, content: contentStr }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushSave()
    }, 2000)
  }, [flushSave])

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleContentChange = useCallback((_html: string) => {
    if (!saveEnabledRef.current) return
    if (!editorRef.current) return
    const json = editorRef.current.getJSON()
    scheduleSave(title, json)
  }, [title, scheduleSave])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setTitle(newTitle)
    if (editorRef.current) {
      const json = editorRef.current.getJSON()
      scheduleSave(newTitle, json)
    }
  }, [scheduleSave])

  const handleSelect = useCallback(async (id: number, entry: WorldEntry) => {
    if (selectedIdRef.current === id) return
    await flushSave()
    setSelectedId(id)
    setTitle(entry.title)
    setCategory(entry.category ?? '')
    setTags(entry.tags ?? [])
    setShowMobileTree(false)
  }, [flushSave])

  const handleCreate = useCallback(async (parentId: number | null, entryTitle: string) => {
    await flushSave()
    const data: WorldFormData = {
      title: entryTitle,
      content: '',
      category: 'concept',
      parentId,
      order: 0,
      isConcept: false,
      tags: [],
    }
    const newId = await createEntry(data)
    setSelectedId(newId)
    setTitle(entryTitle)
    setCategory('concept')
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
    const handler = () => {
      if (selectedIdRef.current && pendingSaveRef.current) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        void saveEntryContent(
          selectedIdRef.current,
          pendingSaveRef.current.title,
          pendingSaveRef.current.content,
        ).catch((err) => {
          console.error(`[WorldLayout] beforeunload 保存失败:`, err)
        })
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (selectedEntryId == null || selectedEntryId === selectedIdRef.current) return
    const entry = entries.find((e) => e.id === selectedEntryId)
    if (!entry) return
    void flushSave().then(() => {
      setSelectedId(selectedEntryId)
      setTitle(entry.title)
      setCategory(entry.category ?? '')
      setTags(entry.tags ?? [])
    })
  }, [selectedEntryId, entries, flushSave])

  const handleEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor
    saveEnabledRef.current = false
    const entry = currentEntryRef.current
    if (entry && entry.id === selectedIdRef.current && entry.content) {
      const content = parseEditorContent(entry.content)
      editor.commands.setContent(content)
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
    }
  }, [])

  useEffect(() => {
    if (currentEntry && editorRef.current && currentEntry.id === selectedId) {
      saveEnabledRef.current = false
      const content = parseEditorContent(currentEntry.content)
      editorRef.current.commands.setContent(content)
      setTimeout(() => {
        saveEnabledRef.current = true
      }, 300)
    }
  }, [currentEntry, selectedId])

   const treePanel = (
    <div className="flex h-full flex-col border-r border-line bg-paper-alt max-md:pt-[var(--safe-top)]">
      <div className="flex h-12 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1">
          {isMobile ? (
            <button onClick={() => setShowMobileTree(false)} className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : null}
          {!isMobile ? (
            <button
              onClick={() => setTreeCollapsed(!treeCollapsed)}
              className="flex h-8 w-8 items-center justify-center text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
              title={treeCollapsed ? '展开目录' : '折叠目录'}
            >
              {treeCollapsed ? <Menu size={16} strokeWidth={2} /> : <ChevronLeft size={16} strokeWidth={2} />}
            </button>
          ) : null}
          <h2 className={PAGE_TITLE}>世界观</h2>
        </div>
        <button
          onClick={() => handleCreate(null, '新词条')}
          className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
          title="新建词条"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {/* 目录搜索 */}
      <div className="border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-2 border-b border-transparent transition-colors focus-within:border-line-hover">
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            type="text"
            value={treeQuery}
            onChange={(e) => setTreeQuery(e.target.value)}
            placeholder="搜索词条"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <WorldTree
          entries={visibleEntries}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
          onRename={handleRename}
          onReorder={handleReorder}
          isMobile={isMobile}
        />
      </div>
    </div>
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

      <div
        className="flex flex-1 flex-col min-w-0 overflow-auto max-md:overflow-visible"
        ref={editorContainerRef}
      >
        <div className="md:hidden h-[calc(60px+var(--safe-top))] flex-shrink-0" />
        {selectedId !== null && currentEntry ? (
          <>
            <div className="flex-1">
              <div className="flex h-12 items-center gap-2 sticky top-0 max-md:top-[calc(60px+var(--safe-top))] z-10 border-b border-line px-4 bg-paper/85 dark:bg-[#1C1B1A]/85 backdrop-blur-lg">
                {treeCollapsed && !isMobile ? (
                  <button
                    onClick={() => setTreeCollapsed(false)}
                    className="flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
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
              </div>

              <div className="mx-auto w-full max-w-3xl px-4 md:px-8">
                {/* 属性：分类 / 标签 / 被引用，与编辑器同一套字段行 */}
                <section className="mt-8">
                  <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    <div className={`${FIELD_ROW} sm:col-span-2`}>
                      <span className={FIELD_LABEL}>分类</span>
                      <input
                        type="text"
                        list="world-categories"
                        value={category}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        placeholder="未分类"
                        className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
                      />
                      <datalist id="world-categories">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>

                    <div className={`${FIELD_ROW_TOP} sm:col-span-2`}>
                      <span className={FIELD_LABEL}>标签</span>
                      <div className="min-w-0 flex-1">
                        <TagPicker selectedIds={tags} onChange={handleTagsChange} />
                      </div>
                    </div>

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
                              className="border-b border-transparent pb-px text-[13px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
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
                  <EditorCore
                    plain
                    key={selectedId}
                    onReady={handleEditorReady}
                    content=""
                    placeholder="编写词条内容... 输入 @ 引用角色/事件/国家，输入 / 插入块"
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
                  className="mx-auto mb-4 flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                >
                  <Menu size={20} strokeWidth={2} />
                </button>
              ) : treeCollapsed ? (
                <button
                  onClick={() => setTreeCollapsed(false)}
                  className="mx-auto mb-4 flex h-8 w-8 items-center justify-center text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
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
    </div>
  )
}
