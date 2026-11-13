'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useDevice } from '@/lib/use-device'
import type { WorldEntry } from '@/types'
import type { Editor } from '@tiptap/core'
import { EntityHistoryButton } from '@/features/vault'
import { FileText } from 'lucide-react'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { TalkToAgentButton } from '@/components/shared/TalkToAgentButton'
import { useEntryList, useEntry, useCreateEntry, useDeleteEntry } from '../hooks/useWorldEntries'
import { renameEntry, reorderEntries, updateEntry } from '../services'
import type { WorldFormData } from '../types'
import { useWorldEntryDraft } from '../hooks/useWorldEntryDraft'
import { useNoteLinks } from '../hooks/useNoteLinks'
import { NoteTemplateContent } from './note/NoteTemplateContent'
import { useTemplates } from '@/lib/templates/store'
import { perNoteTemplateByName } from '@/lib/templates/note'
import { NoteTemplateButton } from './NoteTemplateButton'
import { templateFieldKeys, templateFieldLabels, templateFieldTypes } from '@/lib/templates/fields'
import { useInfoGroups } from '@/lib/templates/info-groups'
import { useCategories } from '@/lib/categories/store'
import { toast } from 'sonner'
import { WorldTreePanel } from './WorldTreePanel'
import { WorldEntryBody } from './WorldEntryBody'
import { filterEntriesWithAncestors } from './world-content-utils'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'
import { notifyDataUpdated } from '@/lib/data-events'

interface WorldLayoutProps {
  onMentionClick?: (id: string, entityType?: string) => void
  onCharacterCount?: (count: number) => void
  selectedEntryId?: number | null
  /** 内链/引用跳进来的一次性指令，消费后通知上层清空，避免下次列表刷新时重放 */
  onSelectedEntryConsumed?: () => void
  onWikiLinkClick?: (id: string) => void
}

export function WorldLayout({ onMentionClick, onCharacterCount, selectedEntryId, onSelectedEntryConsumed, onWikiLinkClick }: WorldLayoutProps) {
  const { entries, loading, error, refresh } = useEntryList()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [showMobileTree, setShowMobileTree] = useState(false)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [treeQuery, setTreeQuery] = useState('')
  const [tags, setTags] = useState<number[]>([])
  /** 本篇刚选的模板：`{ 条目 id, 名字 }`，切到别的条目就自然失效（不需要 effect 重置） */
  const [templateChoice, setTemplateChoice] = useState<{ id: number; name: string } | null>(null)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const handledNavRef = useRef<number | null>(null)
  // 词条编辑器走模板渲染循环（阶段一：顺序/开关来自模板，数据仍写原列）
  const { templates } = useTemplates()
  const categories = useCategories()
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

  // 模板解析顺序：单篇覆盖（模板:）→ 分类绑定 → 内置词条模板。
  // 单篇覆盖只认「按篇候选」（`perNoteTemplateByName`）：实体模板 / 旧脏值一律忽略。
  const categoryTemplate = categories.find(
    (category) => category.name === (currentEntry?.category ?? ''),
  )?.template
  const chosenName = templateChoice?.id === selectedId ? templateChoice.name : undefined
  const overrideTemplate = perNoteTemplateByName(templates, chosenName ?? currentEntry?.template)
  const entryTemplate =
    overrideTemplate ??
    templates.find((doc) => doc.id === categoryTemplate || doc.name === categoryTemplate) ??
    templates.find((doc) => doc.id === 'entry')


  const {
    handleContentChange,
    handleTitleChange,
    handleEditorReady,
    flushSave,
    selectedIdRef,
  } = useWorldEntryDraft({ selectedId, currentEntry, refresh, title, setTitle })

  // 被引用：哪些词条在正文里 [[链接]] 或 @ 引用了当前词条（与分类条目共用同一份查询）
  const { backlinks } = useNoteLinks(selectedId)

  /** 单篇换模板：写 `WorldEntry.template`（名字），空 = 跟随分类 */
  const handleTemplateSelect = (name: string) => {
    const id = selectedIdRef.current
    if (id === null) return
    setTemplateChoice({ id, name })
    void updateEntry(id, { template: name })
      .then(() => refresh())
      .catch((err: unknown) => {
        toast.error('模板保存失败', { description: err instanceof Error ? err.message : String(err) })
      })
  }

  const infoGroups = useInfoGroups()
  const fieldKeys = useMemo(
    () => (entryTemplate ? templateFieldKeys(entryTemplate, infoGroups) : undefined),
    [entryTemplate, infoGroups],
  )
  const fieldTypes = useMemo(
    () => (entryTemplate ? templateFieldTypes(entryTemplate, infoGroups) : undefined),
    [entryTemplate, infoGroups],
  )
  const fieldLabels = useMemo(
    () => (entryTemplate ? templateFieldLabels(entryTemplate, infoGroups) : undefined),
    [entryTemplate, infoGroups],
  )

  const visibleEntries = useMemo(
    () => filterEntriesWithAncestors(entries, treeQuery),
    [entries, treeQuery],
  )

  const handleTagsChange = useCallback((ids: number[]) => {
    setTags(ids)
    if (selectedIdRef.current == null) return
    void updateEntry(selectedIdRef.current, { tags: ids }).catch((err: unknown) => {
      // 标签是用户点了就走的操作：写失败静默会让「打了标签、重开没了」变成悬案
      toast.error('保存标签失败', { description: err instanceof Error ? err.message : String(err) })
    })
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
    renameEntry(id, newTitle).then(() => {
      refresh()
      // 改名是离散动作：地图锚点标签、相册来源名、关系图节点名都靠这条广播刷新
      notifyDataUpdated()
    }).catch(() => {})
  }, [refresh])

  const handleReorder = useCallback((updates: { id: number; parentId: number | null; order: number }[]) => {
    reorderEntries(updates).then(() => { refresh() }).catch(() => {})
  }, [refresh])

  useEffect(() => {
    if (selectedEntryId == null) return
    // 导航意图只消费一次：worldSelectedEntryId 是「跳到这里」的一次性指令，
    // 一旦消费就把 handledNavRef 记下并通知上层清空。
    // 这个 effect 的依赖里有 entries —— 自动保存后的 refresh() 会让它重跑；
    // 若不做一次性判定，上次的内链跳转目标就会被反复重放，表现为「编辑着突然跳到别的词条」。
    if (selectedEntryId === handledNavRef.current) return
    if (selectedEntryId === selectedIdRef.current) {
      handledNavRef.current = selectedEntryId
      onSelectedEntryConsumed?.()
      return
    }
    const entry = entries.find((e) => e.id === selectedEntryId)
    if (!entry) return
    handledNavRef.current = selectedEntryId
    onSelectedEntryConsumed?.()
    void flushSave().then(() => {
      setSelectedId(selectedEntryId)
      setTitle(entry.title)
      setTags(entry.tags ?? [])
    })
  }, [selectedEntryId, entries, flushSave, selectedIdRef, onSelectedEntryConsumed])

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
        <div className={`fixed inset-0 z-50 transition-all duration-base ${showMobileTree ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <div className={`absolute inset-0 bg-black/20 transition-opacity duration-base ${showMobileTree ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowMobileTree(false)} />
          <div className={`absolute top-0 bottom-0 left-0 w-[280px] transition-transform duration-base ease-quiet ${showMobileTree ? 'translate-x-0' : '-translate-x-full'}`}>
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
            <>
              <NoteTemplateButton
                template={entryTemplate}
                followLabel={categoryTemplate ? `跟随分类（${currentEntry.category}）` : '默认模板'}
                onSelect={handleTemplateSelect}
              />
              <TalkToAgentButton
                kind="world"
                id={currentEntry.id}
                title={title}
                onBeforeOpen={flushSave}
              />
              <EntityHistoryButton table="worldEntries" id={currentEntry.id} name={title} />
            </>
          ) : null
        }
      >
        {selectedId !== null && currentEntry ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="h-12 shrink-0" aria-hidden />
            <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
              {entryTemplate ? (
                <NoteTemplateContent
                  entry={currentEntry}
                  template={entryTemplate}
                  title={title}
                  onTitleChange={handleTitleChange}
                  titlePlaceholder="词条标题"
                  tags={tags}
                  onTagsChange={handleTagsChange}
                  backlinks={backlinks}
                  onNavigateNote={(id) => {
                    const target = entries.find((e) => e.id === id)
                    if (target) void handleSelect(id, target)
                  }}
                  onNavigateEntity={(kind, id) => {
                    if (kind === 'world') {
                      const target = entries.find((e) => e.id === id)
                      if (target) void handleSelect(id, target)
                      return
                    }
                    onMentionClick?.(String(id), kind)
                  }}
                  body={
                    <WorldEntryBody
                      selectedId={selectedId}
                      pane={false}
                      onReady={handleBodyReady}
                      onContentChange={handleContentChange}
                      onMentionClick={onMentionClick}
                      onCharacterCount={onCharacterCount}
                      onWikiLinkClick={onWikiLinkClick}
                    />
                  }
                  linkRows={entries}
                  fieldKeys={fieldKeys}
                  fieldTypes={fieldTypes}
                  fieldLabels={fieldLabels}
                />
              ) : (
                <div className="h-24" aria-hidden />
              )}
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
          <div className="flex h-full flex-col">
            <ListEmptyState
              icon={FileText}
              message={entries.length === 0 ? '还没有词条' : '选择一个词条或新建词条'}
              action={{ label: '新建词条', onClick: () => void handleCreate(null, '新词条') }}
            />
          </div>
        )}
      </EntityEditorShell>

    </>
  )
}