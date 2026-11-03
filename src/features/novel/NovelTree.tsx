'use client'

/**
 * 小说章节树（某本书的内部编辑器）。
 *
 * 只负责「一本书」：左侧章节树 + 右侧我们的编辑器内核 + 导出。
 * 书与书之间由 `NovelSection` 切换（首页 = 书架）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ArrowLeft, ChevronDown, FileDown, Plus } from 'lucide-react'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { BTN_QUIET, FIELD_LABEL, INPUT_LINE, MENU, MENU_ITEM, ROUND_ITEM, SECTION_TITLE } from '@/lib/ui-tokens'
import { EditorBodyPane } from '@/components/editor/EditorBodyPane'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { downloadBlob } from '@/lib/zip'
import type { WorldEntry } from '@/types'
import { flattenNovel, toMarkdown, toTxt, countNovelWords } from './export'
import { buildDocx } from './docx'
import { createNovelChapter, listNovelEntries, updateChapterOutline, updateNovelMeta } from './services'

export function NovelTree({ novelId, title, onBack }: { novelId: number; title: string; onBack: () => void }) {
  const [entries, setEntries] = useState<WorldEntry[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null)

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
  const root = entries.find((entry) => entry.id === novelId) ?? null
  const selected = entries.find((entry) => entry.id === selectedId) ?? null
  const words = countNovelWords(flattenNovel(chapters))
  const chapterWords = selected ? countNovelWords(flattenNovel([selected])) : 0
  const target = root?.novelTargetWords ?? 0

  const handleCreateChapter = async () => {
    const id = await createNovelChapter(novelId)
    await reload()
    setSelectedId(id)
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

        <div className="mt-auto flex flex-col gap-2 border-t border-line px-3 py-3">
          <label className="flex items-center gap-2">
            <span className={FIELD_LABEL}>作者</span>
            <input
              defaultValue={root?.novelAuthor ?? ''}
              onBlur={(event) => void saveMeta({ novelAuthor: event.target.value })}
              placeholder="未署名"
              className={INPUT_LINE}
            />
          </label>
          <label className="flex items-start gap-2">
            <span className={FIELD_LABEL}>简介</span>
            <textarea
              defaultValue={root?.novelSynopsis ?? ''}
              onBlur={(event) => void saveMeta({ novelSynopsis: event.target.value })}
              rows={3}
              placeholder="一句话说清这本书"
              className={INPUT_LINE}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className={FIELD_LABEL}>目标字数</span>
            <input
              type="number"
              defaultValue={root?.novelTargetWords ?? ''}
              onBlur={(event) => {
                const value = Number(event.target.value)
                void saveMeta({ novelTargetWords: Number.isFinite(value) && value > 0 ? value : undefined })
              }}
              placeholder="可选"
              className={INPUT_LINE}
            />
          </label>
          <label className="flex items-start gap-2">
            <span className={FIELD_LABEL}>笔记</span>
            <textarea
              defaultValue={root?.novelNotes ?? ''}
              onBlur={(event) => void saveMeta({ novelNotes: event.target.value })}
              rows={3}
              placeholder="设定、灵感、待办"
              className={INPUT_LINE}
            />
          </label>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-4">
          <button type="button" onClick={onBack} className={BTN_QUIET} aria-label="返回书架" title="返回书架">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-ink">{selected?.title ?? title}</div>
            <div className="text-xs text-ink-faint">
              {selected ? `本章 ${chapterWords} 字 · ` : ''}全书 {words} 字{target > 0 ? ` / ${target}` : ''}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className={BTN_QUIET}>
              <FileDown size={14} strokeWidth={2} />
              导出
              <ChevronDown size={12} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className={MENU}>
              <DropdownMenuItem className={MENU_ITEM} onClick={() => handleExport('docx')}>
                Word（.docx）
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onClick={() => handleExport('md')}>
                Markdown
              </DropdownMenuItem>
              <DropdownMenuItem className={MENU_ITEM} onClick={() => handleExport('txt')}>
                纯文本（.txt）
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {selected ? (
          <div className="flex items-center gap-2 px-4 pb-1">
            <input
              key={`outline-${selected.id}`}
              defaultValue={selected.chapterOutline ?? ''}
              onBlur={(event) => void saveOutline(event.target.value)}
              placeholder="章节大纲 / 备注"
              className="w-full bg-transparent py-1 text-xs text-ink-muted outline-none placeholder:text-ink-faint"
            />
          </div>
        ) : null}

        {selected ? (
          <EditorBodyPane editor={bodyEditor} showToolbar>
            <DocumentEditor
              key={selected.id}
              entityId={selected.id}
              entityType="worldEntry"
              onReady={(editor) => setBodyEditor(editor)}
              onDocChange={() => {}}
              showToolbar={false}
              placeholder="从这一章开始写…"
            />
          </EditorBodyPane>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <p className="text-sm text-ink-muted">在左侧选一章，或者新建一章</p>
          </div>
        )}
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
