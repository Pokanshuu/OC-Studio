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
import { BTN_PRIMARY, EMPTY_STATE, LIST_GRID, PAGE_TITLE, ROUND_ITEM } from '@/lib/ui-tokens'
import { listNovelEntries, createNovelRoot } from './services'
import { flattenNovel, countNovelWords } from './export'
import { NovelTree } from './NovelTree'

interface BookSummary {
  id: number
  title: string
  chapters: number
  words: number
}

export function NovelSection() {
  const [books, setBooks] = useState<BookSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<number | null>(null)

  const reload = useCallback(async () => {
    const entries = await listNovelEntries()
    const roots = entries.filter((entry) => entry.parentId === null)
    const summaries = roots.map((root) => {
      const children = entries.filter((entry) => {
        let cursor = entry.parentId
        let guard = 0
        while (cursor !== null && cursor !== root.id && guard < 64) {
          cursor = entries.find((item) => item.id === cursor)?.parentId ?? null
          guard += 1
        }
        return cursor === root.id
      })
      return {
        id: root.id,
        title: root.title,
        chapters: children.length,
        words: countNovelWords(flattenNovel(children)),
      }
    })
    setBooks(summaries)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleCreate = async () => {
    const id = await createNovelRoot()
    await reload()
    setActiveId(id)
  }

  const active = books.find((book) => book.id === activeId) ?? null
  if (active) {
    return <NovelTree novelId={active.id} title={active.title} />
  }

  if (loading) return null

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-24 pt-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={PAGE_TITLE}>小说</h1>
        <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
          <BookPlus size={14} strokeWidth={2} />
          新建小说
        </button>
      </div>

      {books.length === 0 ? (
        <div className={EMPTY_STATE}>
          <p className="text-sm text-ink-muted">还没有小说</p>
        </div>
      ) : (
        <div className={LIST_GRID}>
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              onClick={() => setActiveId(book.id)}
              className={`group flex flex-col overflow-hidden bg-paper-card text-left transition-colors hover:bg-line ${ROUND_ITEM}`}
            >
              {/* 封面槽位：书籍经典 2:3 */}
              <div className="relative aspect-[2/3] w-full overflow-hidden bg-paper-alt">
                <div className="absolute inset-0 grid place-items-center">
                  <span className="font-serif text-3xl text-ink-faint">{book.title.slice(0, 1)}</span>
                </div>
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
  )
}
