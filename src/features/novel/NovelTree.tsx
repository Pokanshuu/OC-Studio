'use client'

/**
 * 小说章节树（某本书的内部编辑器）。
 *
 * 只负责「一本书」：左侧章节树 + 右侧写作内核 + 预览 / 导出。
 * 书与书之间由 `NovelSection` 切换（首页 = 书架）。
 *
 * 版式与世界观编辑器同一套壳（`EntityEditorShell`）：48px 顶栏、可拖宽的列表面板、
 * 移动端抽屉。写作面对齐 `WorldLayout` 的管线 —— 正文在 `content` 里，
 * 由 `useWorldEntryDraft` 防抖落库（不是 `DocumentEditor` 的 `document` 字段）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { BookText, ChevronDown, ChevronLeft, ChevronUp, Eye, FileDown, Info, Plus, Search } from 'lucide-react'
import { EntityEditorShell } from '@/components/shared/EntityEditorShell'
import { EntityHistoryButton } from '@/features/vault'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import {
  ADD_ACTION,
  BTN_QUIET,
  CENTER_STATE,
  EMPTY_HINT,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_ROW,
  FIELD_ROW_TOP,
  ICON_BTN,
  ICON_BTN_MD,
  LIST_END,
  PAGE_TITLE,
  TITLE_INPUT,
} from '@/lib/ui-tokens'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { DeleteButton } from '@/components/shared/DeleteButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDevice } from '@/lib/use-device'
import { useNavigation } from '@/components/layout/NavigationContext'
import { useMobilePageHeader } from '@/components/layout/MobilePageHeaderContext'
import { useWordCount } from '@/components/layout/WordCountContext'
import { notifyDataUpdated } from '@/lib/data-events'
import type { WorldEntry } from '@/types'
import { WorldEntryBody } from '@/features/world/components/WorldEntryBody'
import { useWorldEntryDraft } from '@/features/world/hooks/useWorldEntryDraft'
import { deleteEntry } from '@/features/world/services'
import { flattenNovel, countNovelWords } from './export'
import {
  createNovelChapter,
  listNovelEntries,
  moveNovelEntry,
  renameNovelEntry,
  updateChapterOutline,
  updateNovelMeta,
} from './services'
import { NovelPreview } from './NovelPreview'
import { NovelExportDialog } from './NovelExportDialog'

export function NovelTree({
  novelId,
  title,
  onBack,
  initialEntryId = null,
  initialEntryNonce = 0,
  onWikiLinkClick,
}: {
  novelId: number
  title: string
  onBack: () => void
  /** 从 `[[章节]]` 进来时要定位的条目（书架已解析出书根） */
  initialEntryId?: number | null
  initialEntryNonce?: number
  onWikiLinkClick?: (id: string) => void
}) {
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chapterTitle, setChapterTitle] = useState(title)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [treeQuery, setTreeQuery] = useState('')
  const [listOpen, setListOpen] = useState(true)
  const [showMobileTree, setShowMobileTree] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // 同一个内链目标只定位一次；reload（保存后刷新）不应把用户拉回去
  const appliedInitialRef = useRef<string | null>(null)

  const { isMobile } = useDevice()
  const { activeItem } = useNavigation()
  const { setConfig } = useMobilePageHeader()
  const { setWordCount } = useWordCount()

  useEffect(() => {
    if (!isMobile) return
    setConfig(activeItem === '小说' ? '小说' : null)
  }, [isMobile, activeItem, setConfig])

  const reload = useCallback(async () => {
    try {
      const rows = await listNovelEntries()
      const byId = new Map(rows.map((row) => [row.id, row]))
      const inBook = (row: WorldEntry): boolean => {
        let cursor: number | null = row.id
        let guard = 0
        while (cursor !== null && guard < 128) {
          if (cursor === novelId) return true
          cursor = byId.get(cursor)?.parentId ?? null
          guard += 1
        }
        return false
      }
      const mine = rows.filter(inBook)
      setEntries(mine)
      setError(null)
      setSelectedId((current) => {
        if (current !== null && mine.some((row) => row.id === current)) return current
        return mine.find((row) => row.parentId === novelId)?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [novelId])

  useEffect(() => {
    void reload()
  }, [reload])

  const root = entries.find((entry) => entry.id === novelId) ?? null
  const chapters = entries.filter((entry) => entry.id !== novelId)
  const selected = entries.find((entry) => entry.id === selectedId) ?? null

  useEffect(() => {
    if (selected) setChapterTitle(selected.title)
  }, [selected])

  const tree = useMemo(() => {
    const nodes = buildEntryTree(entries)
    return nodes.find((node) => node.entry.id === novelId)?.children ?? []
  }, [entries, novelId])

  const visibleTree = useMemo(() => {
    const keyword = treeQuery.trim().toLowerCase()
    if (!keyword) return tree
    const filter = (nodes: WorldTreeNode[]): WorldTreeNode[] =>
      nodes.flatMap((node) => {
        const children = filter(node.children)
        if (node.entry.title.toLowerCase().includes(keyword) || children.length > 0) {
          return [{ ...node, children }]
        }
        return []
      })
    return filter(tree)
  }, [tree, treeQuery])

  const words = countNovelWords(flattenNovel(chapters))
  const chapterWords = selected ? countNovelWords(flattenNovel([selected])) : 0

  useEffect(() => {
    setWordCount(words)
  }, [words, setWordCount])

  useEffect(() => () => setWordCount(0), [setWordCount])

  const { handleContentChange, handleTitleChange, handleEditorReady, flushSave, selectedIdRef } =
    useWorldEntryDraft({
      selectedId,
      currentEntry: selected ?? undefined,
      refresh: () => void reload(),
      title: chapterTitle,
      setTitle: setChapterTitle,
    })

  const handleBodyReady = (editor: Editor) => {
    setBodyEditor(editor)
    handleEditorReady(editor)
  }

  const handleSelect = useCallback(
    async (id: number) => {
      if (selectedIdRef.current === id) return
      await flushSave()
      setSelectedId(id)
      setShowMobileTree(false)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    },
    [flushSave, selectedIdRef],
  )

  const handleBack = async () => {
    await flushSave()
    onBack()
  }

  const handleCreateChapter = async () => {
    await flushSave()
    const id = await createNovelChapter(novelId)
    await reload()
    setSelectedId(id)
    setShowMobileTree(false)
    notifyDataUpdated()
  }

  /** 在当前章下面建子章：目录因此能长成「卷 → 章 → 节」 */
  const handleCreateSubChapter = async () => {
    if (selectedId == null) return
    await flushSave()
    const id = await createNovelChapter(selectedId)
    await reload()
    setSelectedId(id)
    setShowMobileTree(false)
    notifyDataUpdated()
  }

  const handleMoveChapter = async (id: number, direction: 'up' | 'down') => {
    await flushSave()
    const moved = await moveNovelEntry(id, direction)
    if (!moved) return
    await reload()
    notifyDataUpdated()
  }

  // 内链落点：书架把「目标章节 id」传下来，章节树负责定位（只认一次）
  useEffect(() => {
    if (initialEntryId == null) return
    const token = `${initialEntryId}:${initialEntryNonce}`
    if (appliedInitialRef.current === token) return
    if (!entries.some((entry) => entry.id === initialEntryId)) return
    appliedInitialRef.current = token
    void handleSelect(initialEntryId)
  }, [entries, handleSelect, initialEntryId, initialEntryNonce])

  const handleDeleteChapter = async (id: number) => {
    await flushSave()
    await deleteEntry(id)
    await reload()
    notifyDataUpdated()
  }

  const saveMeta = async (patch: Parameters<typeof updateNovelMeta>[1]) => {
    await updateNovelMeta(novelId, patch)
    await reload()
  }

  const saveOutline = async (value: string) => {
    if (!selected) return
    await updateChapterOutline(selected.id, value)
    await reload()
  }

  const bookTitle = root?.title ?? title

  const panel = (
    <NovelTreePanel
      title={root?.title ?? title}
      tree={visibleTree}
      selectedId={selectedId}
      query={treeQuery}
      onQueryChange={setTreeQuery}
      onSelect={(id) => void handleSelect(id)}
      onCreate={() => void handleCreateChapter()}
      onCreateChild={() => void handleCreateSubChapter()}
      onMove={(id, direction) => void handleMoveChapter(id, direction)}
      sortable={treeQuery.trim().length === 0}
      metaOpen={metaOpen}
      onToggleMeta={() => setMetaOpen((open) => !open)}
      root={root}
      onSaveMeta={(patch) => void saveMeta(patch)}
      onRenameBook={(value) => {
        if (!root || !value.trim() || value === root.title) return
        void renameNovelEntry(root.id, value.trim()).then(() => void reload())
      }}
      onCloseMobile={isMobile ? () => setShowMobileTree(false) : undefined}
      onToggleCollapsed={isMobile ? undefined : () => setListOpen((open) => !open)}
    />
  )

  if (loading) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-[13px] text-ink-faint">加载中…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={CENTER_STATE}>
        <span className="text-sm text-error">{error}</span>
        <button type="button" onClick={() => void reload()} className={BTN_QUIET}>
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 移动端：给固定顶栏让位（页面外层没有 padding，spacer 必须放在滚动容器外） */}
      <div className="md:hidden h-[calc(60px+var(--safe-top))] shrink-0" aria-hidden />

      {isMobile && showMobileTree ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[var(--oc-scrim)]" onClick={() => setShowMobileTree(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px]">{panel}</div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <EntityEditorShell
        title="编辑章节"
        onBack={() => void handleBack()}
        listOpen={isMobile ? false : listOpen}
        onToggleList={() => {
          if (isMobile) setShowMobileTree(true)
          else setListOpen((open) => !open)
        }}
        list={panel}
        editor={bodyEditor}
        headerRight={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className={ICON_BTN_MD}
              aria-label="预览"
              title="预览"
            >
              <Eye size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className={ICON_BTN_MD}
              aria-label="导出"
              title="导出"
            >
              <FileDown size={16} strokeWidth={2} />
            </button>
            {selected ? (
              <>
                <DeleteButton label="删除章节" onDelete={() => void handleDeleteChapter(selected.id)} />
                <EntityHistoryButton table="worldEntries" id={selected.id} name={selected.title} />
              </>
            ) : null}
          </div>
        }
      >
        {selected ? (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="h-12 shrink-0" aria-hidden />
            <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-8 md:py-6">
              <div className="flex items-end gap-2">
                <input
                  value={chapterTitle}
                  onChange={handleTitleChange}
                  onBlur={() => void flushSave()}
                  placeholder="章节标题"
                  className={TITLE_INPUT}
                />
                <span className="shrink-0 pb-1 text-xs tabular-nums text-ink-faint">
                  本章 {chapterWords} 字
                </span>
              </div>

              <label className={FIELD_ROW}>
                <span className={FIELD_LABEL}>大纲</span>
                <input
                  key={`outline-${selected.id}`}
                  defaultValue={selected.chapterOutline ?? ''}
                  onBlur={(event) => void saveOutline(event.target.value)}
                  placeholder="一句话概括这一章"
                  className={FIELD_INPUT}
                />
              </label>

              <div className="mt-8 border-t border-line" />
              <div className="mt-8">
                <WorldEntryBody
                  selectedId={selected.id}
                  pane={false}
                  onReady={handleBodyReady}
                  onContentChange={handleContentChange}
                  onWikiLinkClick={onWikiLinkClick}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <button type="button" onClick={() => void handleCreateChapter()} className={EMPTY_HINT}>
              新建第一章
            </button>
          </div>
        )}
        </EntityEditorShell>
      </div>

      {previewOpen ? (
        <NovelPreview
          title={root?.title ?? title}
          chapters={flattenNovel(chapters)}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      <NovelExportDialog
        open={exportOpen}
        book={{
          title: bookTitle,
          author: root?.novelAuthor,
          synopsis: root?.novelSynopsis,
          cover: root?.novelCover,
        }}
        entries={chapters}
        onClose={() => setExportOpen(false)}
      />
    </div>
  )
}

interface NovelTreePanelProps {
  title: string
  tree: WorldTreeNode[]
  selectedId: number | null
  query: string
  onQueryChange: (value: string) => void
  onSelect: (id: number) => void
  /** 新建章节（根级，挂在书上） */
  onCreate: () => void
  /** 新建子章（挂在当前选中章下） */
  onCreateChild: () => void
  onMove: (id: number, direction: 'up' | 'down') => void
  /** 搜索时目录是过滤后的子集，上下移会指错兄弟，直接不给按钮 */
  sortable: boolean
  metaOpen: boolean
  onToggleMeta: () => void
  root: WorldEntry | null
  onSaveMeta: (patch: Parameters<typeof updateNovelMeta>[1]) => void
  onRenameBook: (value: string) => void
  onCloseMobile?: () => void
  onToggleCollapsed?: () => void
}

/** 目录面板：与 `WorldTreePanel` 同一形态（48px 页头 / 搜索 / 树行 / 作品信息） */
function NovelTreePanel({
  title,
  tree,
  selectedId,
  query,
  onQueryChange,
  onSelect,
  onCreate,
  onCreateChild,
  onMove,
  sortable,
  metaOpen,
  onToggleMeta,
  root,
  onSaveMeta,
  onRenameBook,
  onCloseMobile,
  onToggleCollapsed,
}: NovelTreePanelProps) {
  return (
    <div className="flex h-full flex-col bg-paper-alt max-md:pt-[var(--safe-top)]">
      <div className="flex h-12 items-center justify-between border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-1">
          {onCloseMobile ? (
            <button type="button" onClick={onCloseMobile} className={ICON_BTN_MD} aria-label="收起目录">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : null}
          {onToggleCollapsed ? (
            <button type="button" onClick={onToggleCollapsed} className={ICON_BTN_MD} title="折叠目录">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
          ) : null}
          <h2 className={`truncate ${PAGE_TITLE}`}>{title}</h2>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className={ICON_BTN_MD} aria-label="新建章节" title="新建章节">
            <Plus size={16} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onCreate}>新建章节</DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateChild} disabled={selectedId === null}>
              新建子章
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-2 border-b border-transparent transition-colors focus-within:border-line-hover">
          <Search size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索章节"
            className="h-6 w-full bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8">
            <p className="text-xs text-ink-faint">还没有章节</p>
            <button type="button" onClick={onCreate} className={`${EMPTY_HINT} flex items-center gap-1`}>
              <Plus size={12} strokeWidth={2} />
              新建第一章
            </button>
          </div>
        ) : (
          <ChapterRows
            nodes={tree}
            selectedId={selectedId}
            onSelect={onSelect}
            onMove={onMove}
            sortable={sortable}
            depth={0}
          />
        )}
      </div>

      {root ? (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={onToggleMeta}
            className={`${ADD_ACTION} w-full justify-between px-3 py-2`}
            aria-expanded={metaOpen}
          >
            <span className="flex items-center gap-1.5 text-[12px] text-ink-faint">
              <Info size={12} strokeWidth={2} />
              作品信息
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className={metaOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </button>
          {metaOpen ? (
            <div className={`max-h-72 overflow-y-auto px-3 pb-3 ${LIST_END}`}>
              <div className="mb-2 flex justify-center pt-1">
                <ImageUploader
                  value={root.novelCover}
                  aspectRatio="2:3"
                  cropAspect={2 / 3}
                  placeholderText="封面"
                  size="md"
                  onChange={(path) => onSaveMeta({ novelCover: path })}
                  onRemove={() => onSaveMeta({ novelCover: undefined })}
                />
              </div>
              <label className={FIELD_ROW}>
                <span className={FIELD_LABEL}>书名</span>
                <input
                  key={`book-${root.id}-${root.title}`}
                  defaultValue={root.title}
                  onBlur={(event) => onRenameBook(event.target.value)}
                  className={FIELD_INPUT}
                />
              </label>
              <label className={FIELD_ROW}>
                <span className={FIELD_LABEL}>作者</span>
                <input
                  key={`author-${root.id}-${root.novelAuthor ?? ''}`}
                  defaultValue={root.novelAuthor ?? ''}
                  onBlur={(event) => onSaveMeta({ novelAuthor: event.target.value })}
                  placeholder="未署名"
                  className={FIELD_INPUT}
                />
              </label>
              <label className={FIELD_ROW}>
                <span className={FIELD_LABEL}>目标字数</span>
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={root.novelTargetWords ?? ''}
                  onBlur={(event) => {
                    const value = Number(event.target.value)
                    onSaveMeta({ novelTargetWords: Number.isFinite(value) && value > 0 ? value : undefined })
                  }}
                  className={`${FIELD_INPUT} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                />
              </label>
              <label className={FIELD_ROW_TOP}>
                <span className={FIELD_LABEL}>简介</span>
                <textarea
                  defaultValue={root.novelSynopsis ?? ''}
                  onBlur={(event) => onSaveMeta({ novelSynopsis: event.target.value })}
                  rows={2}
                  placeholder="一句话说清这本书"
                  className={`${FIELD_INPUT} resize-none leading-relaxed`}
                />
              </label>
              <label className={FIELD_ROW_TOP}>
                <span className={FIELD_LABEL}>笔记</span>
                <textarea
                  defaultValue={root.novelNotes ?? ''}
                  onBlur={(event) => onSaveMeta({ novelNotes: event.target.value })}
                  rows={2}
                  placeholder="设定、灵感、待办"
                  className={`${FIELD_INPUT} resize-none leading-relaxed`}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ChapterRows({
  nodes,
  selectedId,
  onSelect,
  onMove,
  sortable,
  depth,
}: {
  nodes: WorldTreeNode[]
  selectedId: number | null
  onSelect: (id: number) => void
  onMove: (id: number, direction: 'up' | 'down') => void
  sortable: boolean
  depth: number
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node, index) => {
        const selected = selectedId === node.entry.id
        return (
          <li key={node.entry.id}>
            <div
              style={{ paddingLeft: `${12 + depth * 12}px` }}
              className={`group flex h-8 w-full items-center rounded-item pr-1 transition-colors ${
                selected ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(node.entry.id)}
                className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[13px] transition-colors ${
                  selected ? 'text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <BookText size={13} strokeWidth={2} className="shrink-0 text-ink-faint" />
                <span className="truncate">{node.entry.title}</span>
              </button>
              {sortable ? (
                <span
                  className={`flex shrink-0 items-center gap-0.5 ${
                    selected
                      ? 'opacity-100'
                      : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onMove(node.entry.id, 'up')}
                    disabled={index === 0}
                    className={`${ICON_BTN} disabled:pointer-events-none disabled:opacity-30`}
                    aria-label="上移"
                    title="上移"
                  >
                    <ChevronUp size={13} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(node.entry.id, 'down')}
                    disabled={index === nodes.length - 1}
                    className={`${ICON_BTN} disabled:pointer-events-none disabled:opacity-30`}
                    aria-label="下移"
                    title="下移"
                  >
                    <ChevronDown size={13} strokeWidth={2} />
                  </button>
                </span>
              ) : null}
            </div>
            {node.children.length > 0 ? (
              <ChapterRows
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
                onMove={onMove}
                sortable={sortable}
                depth={depth + 1}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
