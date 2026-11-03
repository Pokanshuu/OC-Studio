'use client'

/**
 * 小说页（W2 界面）：**章节树 + 我们自己的编辑器内核**。
 *
 * 刻意不搬 fork 那份 1069 行的 EditorCore（见 `docs/小说.md` §8）：
 * 正文继续用 `DocumentEditor`（`entityType: 'worldEntry'`），所以
 * `@` 引用、`[[内链]]`、未保存判定、图片引用收集、vault 落盘全部免费复用。
 *
 * 这里只做三件事：左侧章节树、新建卷/章、导出 TXT / Markdown。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { BookPlus, FileDown, Plus } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { BTN_PRIMARY, BTN_QUIET, EMPTY_STATE, PANEL, ROUND_ITEM, SECTION_TITLE } from '@/lib/ui-tokens'
import type { WorldEntry } from '@/types'
import { flattenNovel, toMarkdown, toTxt, countNovelWords } from './export'
import { createNovelChapter, createNovelRoot, listNovelEntries } from './services'

function downloadText(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function NovelView() {
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const rows = await listNovelEntries()
    setEntries(rows)
    setSelectedId((current) => current ?? rows.find((row) => row.parentId === null)?.id ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const tree = useMemo(() => buildEntryTree(entries), [entries])
  const selected = entries.find((entry) => entry.id === selectedId) ?? null

  const handleCreateRoot = async () => {
    const id = await createNovelRoot()
    await reload()
    setSelectedId(id)
  }

  const handleCreateChapter = async () => {
    const parent = selected?.parentId === null ? selected.id : selected?.parentId ?? null
    const id = await createNovelChapter(parent)
    await reload()
    setSelectedId(id)
  }

  const handleExport = (format: 'md' | 'txt') => {
    const chapters = flattenNovel(entries)
    if (chapters.length === 0) return
    const title = tree[0]?.entry.title ?? '小说'
    const content = format === 'md' ? toMarkdown(chapters, { title }) : toTxt(chapters, { title })
    downloadText(`${title}.${format === 'md' ? 'md' : 'txt'}`, content)
  }

  const total = countNovelWords(flattenNovel(entries))

  if (loading) return null

  if (entries.length === 0) {
    return (
      <div className={EMPTY_STATE}>
        <p className="text-sm text-ink-muted">这个库里还没有小说</p>
        <button type="button" onClick={() => void handleCreateRoot()} className={BTN_PRIMARY}>
          <BookPlus size={14} strokeWidth={2} />
          新建小说
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className={`${PANEL} flex w-60 shrink-0 flex-col overflow-y-auto`}>
        <div className="flex items-center justify-between px-3 py-2">
          <span className={SECTION_TITLE}>目录</span>
          <button type="button" onClick={() => void handleCreateChapter()} className={BTN_QUIET} title="新建章节">
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <TreeList nodes={tree} selectedId={selectedId} onSelect={setSelectedId} depth={0} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-ink">{selected?.title ?? '未选择章节'}</div>
            <div className="text-xs text-ink-faint">全书 {total} 字</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => handleExport('txt')} className={BTN_QUIET}>
              <FileDown size={14} strokeWidth={2} />
              TXT
            </button>
            <button type="button" onClick={() => handleExport('md')} className={BTN_QUIET}>
              <FileDown size={14} strokeWidth={2} />
              Markdown
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">
          {selected ? (
            <DocumentEditor
              key={selected.id}
              entityId={selected.id}
              entityType="worldEntry"
              onReady={(_editor: Editor) => {}}
              onDocChange={() => {}}
              placeholder="从这一章开始写…"
            />
          ) : (
            <p className="text-sm text-ink-muted">在左侧选一章，或者新建一章</p>
          )}
        </div>
      </section>
    </div>
  )
}

function TreeList({
  nodes,
  selectedId,
  onSelect,
  depth,
}: {
  nodes: WorldTreeNode[]
  selectedId: number | null
  onSelect: (id: number) => void
  depth: number
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <li key={node.entry.id}>
          <button
            type="button"
            onClick={() => onSelect(node.entry.id)}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
            className={`flex w-full items-center py-1.5 pr-2 text-left text-[13px] transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM} ${
              selectedId === node.entry.id ? 'text-ink' : 'text-ink-muted'
            }`}
          >
            <span className="truncate">{node.entry.title}</span>
          </button>
          {node.children.length > 0 ? (
            <TreeList nodes={node.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
