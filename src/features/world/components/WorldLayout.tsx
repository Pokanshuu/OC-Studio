'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, Menu, ChevronLeft } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { EditorCore } from '@/components/editor/EditorCore'
import { useDevice } from '@/lib/use-device'
import type { WorldEntry } from '@/types'
import { useEntryList, useEntry, useCreateEntry, useDeleteEntry } from '../hooks/useWorldEntries'
import { saveEntryContent, renameEntry, reorderEntries } from '../services'
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

  const editorRef = useRef<Editor | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<{ title: string; content: string } | null>(null)
  const selectedIdRef = useRef<number | null>(null)
  const saveEnabledRef = useRef(false)
  const currentEntryRef = useRef<WorldEntry | undefined>(undefined)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const { entry: currentEntry } = useEntry(selectedId)
  useEffect(() => { currentEntryRef.current = currentEntry }, [currentEntry])

  const flushSave = useCallback(async () => {
    if (!selectedIdRef.current || !pendingSaveRef.current) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const { title: t, content: c } = pendingSaveRef.current
    try {
      await saveEntryContent(selectedIdRef.current, t, c)
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
    }
    const newId = await createEntry(data)
    setSelectedId(newId)
    setTitle(entryTitle)
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
    <div className="flex h-full flex-col border-r border-line bg-paper-alt">
      <div className="flex items-center justify-between border-b border-line px-3 py-3">
        <div className="flex items-center gap-2">
          {isMobile ? (
            <button onClick={() => setShowMobileTree(false)} className="flex h-9 w-9 items-center justify-center rounded text-ink-muted">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : null}
          {!isMobile ? (
            <button
              onClick={() => setTreeCollapsed(!treeCollapsed)}
              className="flex h-9 w-9 items-center justify-center rounded text-ink-faint hover:text-ink transition-colors"
              title={treeCollapsed ? '展开目录' : '折叠目录'}
            >
              {treeCollapsed ? <Menu size={16} strokeWidth={2} /> : <ChevronLeft size={16} strokeWidth={2} />}
            </button>
          ) : null}
          <h2 className="text-lg text-ink font-serif font-bold">世界观</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleCreate(null, '新词条')}
            className="flex h-9 w-9 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink hover:bg-paper-card"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <WorldTree
          entries={entries}
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
      {!treeCollapsed && !isMobile ? (
        <div className="w-[200px] shrink-0 overflow-auto">{treePanel}</div>
      ) : null}

      {showMobileTree && isMobile ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowMobileTree(false)} />
          <div className="absolute top-[var(--safe-top)] bottom-0 left-0 w-[280px]">{treePanel}</div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col min-w-0">
        {selectedId !== null && currentEntry ? (
          <>
            <div className="flex-1 overflow-auto">
      <div className="flex items-center justify-between sticky top-0 z-10 border-b border-line px-4 py-3 min-h-[60px] bg-paper/70 dark:bg-[#1C1B1A]/70 backdrop-blur-md">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {treeCollapsed && !isMobile ? (
                  <button
                    onClick={() => setTreeCollapsed(false)}
                    className="flex h-9 w-9 items-center justify-center rounded text-ink-muted hover:text-ink transition-colors"
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
                  className="flex-1 min-w-0 bg-transparent text-lg text-ink placeholder:text-ink-faint focus:outline-none h-9"
                />
              </div>
            </div>
              <div className="px-4 py-2 md:px-8 md:pb-2">
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
            </div>
            </div>
          </>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-ink-muted">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-error">{error}</span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              {isMobile ? (
                <button
                  onClick={() => setShowMobileTree(true)}
                  className="mb-4 flex h-8 w-8 mx-auto items-center justify-center rounded text-ink-muted hover:text-ink"
                >
                  <Menu size={20} strokeWidth={2} />
                </button>
              ) : treeCollapsed ? (
                <button
                  onClick={() => setTreeCollapsed(false)}
                  className="mb-4 flex h-8 w-8 mx-auto items-center justify-center rounded text-ink-muted hover:text-ink"
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
