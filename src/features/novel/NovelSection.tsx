'use client'

/**
 * 小说书架 + 从书架进入章节树。
 *
 * 设计口径（`docs/小说.md` §9、`oc-studio-design`）：
 * - 封面 **2:3**（书籍经典比例，6:9）—— 和角色卡的 3:2、头像的 1:1 一样，是**槽位**不是样式
 * - 卡片零阴影、`ROUND_ITEM`、hover 抬底 `--oc-hover`
 * - 文案节制：标题下只放事实（几章 / 多少字），不写「分章节写作、插入图片…」这类说明
 */
import { useCallback, useEffect, useState } from 'react'
import { BookOpen, BookPlus, CircleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import { BTN_PRIMARY, BTN_QUIET, CENTER_STATE, LIST_GRID, LOADING_TEXT } from '@/lib/ui-tokens'
import { CoverCard } from '@/components/shared/cover/CoverCard'
import { PageToolbar } from '@/components/shared/PageToolbar'
import { ListShell } from '@/components/shared/ListShell'
import { CoverFlow } from '@/components/shared/CoverFlow'
import { SortViewControls } from '@/components/shared/SortViewControls'
import { normalizeViewMode, type ViewMode } from '@/components/shared/SortViewControls'
import { useDevice } from '@/lib/use-device'
import { ListEmptyState } from '@/components/shared/ListEmptyState'
import { resolveImageUrl } from '@/lib/image-service'
import { listNovelEntries, createNovelRoot } from './services'
import { readLegacyNovels } from '@/lib/legacy/pr5-novels'
import { importLegacyNovels } from '@/lib/legacy/pr5-novels-import'
import { flattenNovel, countNovelWords } from './export'
import { NovelTree } from './NovelTree'

interface BookSummary {
  id: number
  title: string
  chapters: number
  words: number
  cover?: string
}

export interface NovelEntryRequest {
  entryId: number
  /** 同一个 id 连续点两次也要重新定位（state 值相同不会触发 effect） */
  nonce: number
}

/** 视图偏好（卡片 / 画廊 / 列表）与书架排序，各自落 localStorage */
const VIEW_KEY = 'oc-novel-view'
const SORT_KEY = 'oc-novel-sort'

const SORT_OPTIONS = [
  { label: '默认顺序', value: 'default' },
  { label: '按名称', value: 'name' },
]

export function NovelSection({
  openEntryRequest,
  onOpenEntryConsumed,
  onWikiLinkClick,
}: {
  /** 来自 `[[章节]]` / `[[小说]]` 的定位请求（`useEntityWorkspace` 查库后给出） */
  openEntryRequest?: NovelEntryRequest | null
  onOpenEntryConsumed?: () => void
  onWikiLinkClick?: (id: string) => void
} = {}) {
  const [books, setBooks] = useState<BookSummary[]>([])
  const [rootByEntry, setRootByEntry] = useState<Record<number, number>>({})
  const [focusedEntry, setFocusedEntry] = useState<{ id: number; nonce: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [legacyCount, setLegacyCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const { isMobile } = useDevice()
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window === 'undefined' ? 'grid' : normalizeViewMode(localStorage.getItem(VIEW_KEY)),
  )
  const [sortKey, setSortKey] = useState<'default' | 'name'>(() =>
    typeof window !== 'undefined' && localStorage.getItem(SORT_KEY) === 'name' ? 'name' : 'default',
  )

  const handleViewChange = (mode: ViewMode): void => {
    setViewMode(mode)
    localStorage.setItem(VIEW_KEY, mode)
  }

  const handleSortChange = (key: string): void => {
    const next = key === 'name' ? 'name' : 'default'
    setSortKey(next)
    localStorage.setItem(SORT_KEY, next)
  }

  /** 书架排序（默认 = 服务端给的书根顺序） */
  const sortedBooks = sortKey === 'name'
    ? [...books].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans'))
    : books

  const renderBookCard = (book: BookSummary) => (
    <div key={book.id}>
      <CoverCard
        id={book.id}
        title={book.title}
        meta={`${book.chapters} 章 · ${book.words} 字`}
        imageSrc={book.cover ? resolveImageUrl(book.cover, 'cover') : undefined}
        // 书籍封面是 2:3 的竖槽位，不跟实体卡的 7:6 走；书封本身就是整张卡
        aspect={2 / 3}
        photoHeight={100}
        onSelect={() => {
          setFocusedEntry(null)
          setActiveId(book.id)
        }}
        isMobile={isMobile}
      />
    </div>
  )

  const reload = useCallback(async () => {
    try {
      const entries = await listNovelEntries()
      const byId = new Map(entries.map((entry) => [entry.id, entry]))
      // 章节 → 所属书根：内链只给一个章节 id，打开哪本书得沿 parentId 上溯
      const rootOf = (entry: WorldEntry): WorldEntry => {
        let cursor = entry
        let guard = 0
        while (cursor.parentId !== null && guard < 128) {
          const parent = byId.get(cursor.parentId)
          if (!parent) break
          cursor = parent
          guard += 1
        }
        return cursor
      }
      const mapping: Record<number, number> = {}
      for (const entry of entries) mapping[entry.id] = rootOf(entry).id

      const roots = entries.filter((entry) => entry.parentId === null)
      const summaries = roots.map((root) => {
        const children = entries.filter(
          (entry) => entry.id !== root.id && mapping[entry.id] === root.id,
        )
        return {
          id: root.id,
          title: root.title,
          chapters: children.length,
          words: countNovelWords(flattenNovel(children)),
          cover: root.novelCover,
        }
      })
      setBooks(summaries)
      setRootByEntry(mapping)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    void readLegacyNovels()
      .then((rows) => setLegacyCount(rows.length))
      .catch(() => setLegacyCount(0))
  }, [reload])

  // 内链定位：等书架数据到达后解析「章节 → 书根」，再打开书并选中目标章
  useEffect(() => {
    if (!openEntryRequest) return
    const rootId = rootByEntry[openEntryRequest.entryId]
    if (rootId !== undefined) {
      setActiveId(rootId)
      // 目标就是书根（`[[小说]]`）时没有「这一章」，交给树选第一章
      setFocusedEntry(
        rootId === openEntryRequest.entryId
          ? null
          : { id: openEntryRequest.entryId, nonce: openEntryRequest.nonce },
      )
      onOpenEntryConsumed?.()
      return
    }
    if (!loading) {
      toast.error('条目不存在')
      onOpenEntryConsumed?.()
    }
  }, [openEntryRequest, rootByEntry, loading, onOpenEntryConsumed])

  const handleImportLegacy = async () => {
    if (importing) return
    setImporting(true)
    try {
      const report = await importLegacyNovels()
      await reload()
      setLegacyCount(0)
      const skipped = report.skippedCovers > 0 ? `，${report.skippedCovers} 张封面需要重设` : ''
      toast.success(
        report.importedNovels > 0
          ? `已导入 ${report.importedNovels} 本 / ${report.importedChapters} 章${skipped}`
          : '没有可导入的旧版小说',
      )
    } catch (err) {
      toast.error('导入失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
    }
  }

  const handleCreate = async () => {
    const id = await createNovelRoot()
    await reload()
    setActiveId(id)
  }

  const active = books.find((book) => book.id === activeId) ?? null
  if (active) {
    return (
      <NovelTree
        novelId={active.id}
        title={active.title}
        initialEntryId={focusedEntry?.id ?? null}
        initialEntryNonce={focusedEntry?.nonce ?? 0}
        onWikiLinkClick={onWikiLinkClick}
        onBack={() => {
          void reload()
          setActiveId(null)
          setFocusedEntry(null)
        }}
      />
    )
  }

  return (
    <ListShell
      header={() => (
        <PageToolbar
          title="小说"
          className="md:px-6"
          actions={
            <>
              {legacyCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleImportLegacy()}
                  disabled={importing}
                  className={BTN_QUIET}
                >
                  {importing ? '正在导入…' : `导入旧版小说（${legacyCount}）`}
                </button>
              ) : null}
              <SortViewControls
                sortKey={sortKey}
                onSortChange={handleSortChange}
                sortOptions={SORT_OPTIONS}
                viewMode={viewMode}
                onViewModeChange={handleViewChange}
              />
              <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
                <BookPlus size={14} strokeWidth={2} />
                新建小说
              </button>
            </>
          }
        />
      )}
    >
      {/* 左右留白放在内容里，不要塞给 ListShell 的 bodyClassName：
          那个 padding 加在滚动容器上，页头也在里面，会跟 PageToolbar 自己的 px 叠成双层。
          这层是 `flex-1`：空态 / 加载 / 报错要在内容区里纵向居中，得先有高度。 */}
      <div className="flex flex-1 flex-col px-6 pb-6 pt-4 max-md:pb-24">
        <div className="md:hidden h-[calc(60px+var(--safe-top))] shrink-0" aria-hidden />
        {loading ? (
          <div className={CENTER_STATE}>
            <span className={LOADING_TEXT}>加载中…</span>
          </div>
        ) : error ? (
          <ListEmptyState
            icon={CircleAlert}
            message={error}
            action={{ label: '重试', onClick: () => void reload() }}
          />
        ) : books.length === 0 ? (
          <ListEmptyState
            icon={BookOpen}
            message="还没有小说"
            action={{ label: '新建小说', onClick: () => void handleCreate() }}
          />
        ) : viewMode === 'gallery' ? (
          <CoverFlow itemWidth={isMobile ? 190 : 260}>
            {sortedBooks.map((book) => renderBookCard(book))}
          </CoverFlow>
        ) : viewMode === 'list' ? (
          <div className="flex flex-col rules-end">
            {sortedBooks.map((book) => (
              <div key={book.id} className="row-rule">
                <button
                  type="button"
                  onClick={() => {
                    setFocusedEntry(null)
                    setActiveId(book.id)
                  }}
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-[var(--oc-hover)]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{book.title}</span>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {book.chapters} 章 · {book.words} 字
                  </span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={LIST_GRID}>{sortedBooks.map((book) => renderBookCard(book))}</div>
        )}
      </div>
      </ListShell>
  )
}
