'use client'

/**
 * 小说章节树（某本书的内部编辑器）。
 *
 * 只负责「一本书」：左侧章节树 + 右侧我们的编辑器内核 + 导出。
 * 书与书之间由 `NovelSection` 切换（首页 = 书架）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { FileDown, Plus } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { BTN_QUIET, ROUND_ITEM, SECTION_TITLE } from '@/lib/ui-tokens'
import { downloadBlob } from '@/lib/zip'
import type { WorldEntry } from '@/types'
import { flattenNovel, toMarkdown, toTxt, countNovelWords } from './export'
import { buildDocx } from './docx'
import { createNovelChapter, listNovelEntries } from './services'

export function NovelTree({ novelId, title }: { novelId: number; title: string }) {
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const rows = (await listNovelEntries()).filter((row) => row.id === novelId || row.parentId !== null)
    const mine = rows.filter((row) => {
      if (row.id === novelId) return true
      // 只保留这棵树下的节点（父链最终指到 novelId）
      const byId = new Map(rows.map((item) => [item.id, item]))
      let cursor = row.parentId
      let guard = 0
      while (cursor !== null && guard < 64) {
        if (cursor === novelId) return true
        cursor = byId.get(cursor)?.parentId ?? null
        guard += 1
      }
      return false
    })
    setEntries(mine)
    setSelectedId((current) => current ?? mine.find((row) => row.parentId === novelId)?.id ?? null)
    setLoading(false)
  }, [novelId])

  useEffect(() => {
    void reload()
  }, [reload])

  const tree = useMemo(() => {
    const root = entries.find((entry) => entry.id === novelId)
    return root ? buildEntryTree([root, ...entries.filter((entry) => entry.id !== novelId)]) : []
  }, [entries, novelId])

  const chapters = entries.filter((entry) => entry.id !== novelId)
  const selected = entries.find((entry) => entry.id === selectedId) ?? null
  const words = countNovelWords(flattenNovel(chapters))

  const handleCreateChapter = async () => {
    const id = await createNovelChapter(novelId)
    await reload()
    setSelectedId(id)
  }

  const handleExport = (format: 'txt' | 'md' | 'docx') => {
    const flat = flattenNovel(chapters)
    if (flat.length === 0) return
    if (format === 'docx') {
      downloadBlob(buildDocx(flat, { title }), `${title}.docx`)
      return
    }
    const content = format === 'md' ? toMarkdown(flat, { title }) : toTxt(flat, { title })
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    downloadBlob(blob, `${title}.${format}`)
  }

  if (loading) return null

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-line">
        <div className="flex items-center justify-between px-3 py-2">
          <span className={SECTION_TITLE}>目录</span>
          <button type="button" onClick={() => void handleCreateChapter()} className={BTN_QUIET} title="新建章节">
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        {tree.length > 0 ? (
          <TreeList nodes={tree[0].children} selectedId={selectedId} onSelect={setSelectedId} depth={0} />
        ) : (
          <p className="px-3 py-2 text-xs text-ink-faint">还没有章节</p>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-ink">{selected?.title ?? title}</div>
            <div className="text-xs text-ink-faint">全书 {words} 字</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => handleExport('docx')} className={BTN_QUIET}>
              <FileDown size={14} strokeWidth={2} />
              Word
            </button>
            <button type="button" onClick={() => handleExport('md')} className={BTN_QUIET}>
              <FileDown size={14} strokeWidth={2} />
              Markdown
            </button>
            <button type="button" onClick={() => handleExport('txt')} className={BTN_QUIET}>
              <FileDown size={14} strokeWidth={2} />
              TXT
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-2">
          {/* 不挂常驻工具条：它 sticky top-12 会压住正文，正文自带气泡菜单 */}
          {selected ? (
            <DocumentEditor
              key={selected.id}
              entityId={selected.id}
              entityType="worldEntry"
              onReady={(_editor: Editor) => {}}
              onDocChange={() => {}}
              showToolbar={false}
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
