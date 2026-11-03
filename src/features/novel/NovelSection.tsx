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
import { BookPlus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { WorldEntry } from '@/types'
import {
  BTN_PRIMARY,
  BTN_QUIET,
  CENTER_STATE,
  LIST_GRID,
  LOADING_TEXT,
  MEDIA_IMG,
  ROUND_ITEM,
} from '@/lib/ui-tokens'
import { PageToolbar } from '@/components/shared/PageToolbar'
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
    <div className="flex h-full flex-col">
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
            <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
              <BookPlus size={14} strokeWidth={2} />
              新建小说
            </button>
          </>
        }
      />

      <div className="md:hidden h-[calc(60px+var(--safe-top))]" aria-hidden />

      <div className="flex-1 overflow-y-auto px-6 pb-24 pt-4">
        {loading ? (
          <div className={CENTER_STATE}>
            <span className={LOADING_TEXT}>加载中…</span>
          </div>
        ) : error ? (
          <div className={CENTER_STATE}>
            <span className="text-sm text-error">{error}</span>
            <button type="button" onClick={() => void reload()} className={BTN_QUIET}>
              重试
            </button>
          </div>
        ) : books.length === 0 ? (
          <ListEmptyState
            message="还没有小说"
            action={{ label: '新建小说', onClick: () => void handleCreate() }}
            className="py-24"
          />
        ) : (
          <div className={LIST_GRID}>
            {books.map((book) => (
              <button
                key={book.id}
                type="button"
                onClick={() => {
                  setFocusedEntry(null)
                  setActiveId(book.id)
                }}
                className={`group flex flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-[var(--oc-hover)] active:bg-[var(--oc-hover)] ${ROUND_ITEM}`}
              >
                {/* 封面槽位：书籍经典 2:3 */}
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-paper-alt">
                  {book.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveImageUrl(book.cover, 'cover')} alt="" className={MEDIA_IMG} />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="font-serif text-3xl text-ink-faint">{book.title.slice(0, 1)}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{book.title}</div>
                    <div className="text-[12px] text-ink-faint">
                      {book.chapters} 章 · {book.words} 字
                    </div>
                  </div>
                  <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-ink-faint" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
