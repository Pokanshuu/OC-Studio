'use client'

/**
 * 树表（W5）：词条树的**表格形态**。
 *
 * 口径（`docs/todo.md` §1 / `docs/模板.md` §1.4）：
 * **只做渲染层**——树的构建一律走 `lib/world-tree.ts#buildEntryTree`，
 * 不另写第二套层级排序；数据来自 `useEntryList()`（它已经排除了小说章节）。
 *
 * 表格里能改的只有「标题」（走 `renameEntry`，写 frontmatter 的 `title`），
 * 层级、排序、父级都不在这里改（那是编辑器和拖拽的事）。
 */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import { renameEntry } from '@/features/world/services'
import { buildEntryTree, type WorldTreeNode } from '@/lib/world-tree'
import { INPUT_LINE, LIST_GRID, SECTION_TITLE } from '@/lib/ui-tokens'
import type { WorldEntry } from '@/types'

interface FlatRow {
  entry: WorldEntry
  depth: number
  childCount: number
  hasChildren: boolean
}

/** 树 → 扁平行（受展开状态控制）——只在这里做一次，渲染与计数共用 */
export function flattenTree(nodes: WorldTreeNode[], expanded: Set<number>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = []
  for (const node of nodes) {
    const hasChildren = node.children.length > 0
    rows.push({ entry: node.entry, depth, childCount: node.children.length, hasChildren })
    if (hasChildren && expanded.has(node.entry.id)) {
      rows.push(...flattenTree(node.children, expanded, depth + 1))
    }
  }
  return rows
}

function wordCount(entry: WorldEntry): number {
  const raw = entry.content ?? ''
  if (!raw.startsWith('{')) return raw.replace(/\s/g, '').length
  try {
    const parsed: unknown = JSON.parse(raw)
    const text: string[] = []
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return
      const record = node as { text?: unknown; content?: unknown }
      if (typeof record.text === 'string') text.push(record.text)
      if (Array.isArray(record.content)) record.content.forEach(walk)
    }
    walk(parsed)
    return text.join('').replace(/\s/g, '').length
  } catch {
    return 0
  }
}

export function TreeTable() {
  const { entries, loading, error, refresh } = useEntryList()
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  const tree = useMemo(() => buildEntryTree(entries), [entries])
  const rows = useMemo(() => flattenTree(tree, expanded), [tree, expanded])

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpanded(new Set(entries.map((entry) => entry.id)))
  const collapseAll = () => setExpanded(new Set())

  const commitRename = async (row: FlatRow) => {
    const title = draft.trim()
    setRenaming(null)
    if (title.length === 0 || title === row.entry.title) return
    await renameEntry(row.entry.id, title)
    refresh()
  }

  if (loading) return null
  if (error) return <p className="px-6 py-8 text-sm text-error">{error}</p>

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-6 pb-3 pt-4">
        <h1 className={SECTION_TITLE}>词条树</h1>
        <span className="text-xs text-ink-faint">{entries.length} 条</span>
        <div className="ml-auto flex items-center gap-1 text-[13px] text-ink-muted">
          <button type="button" onClick={expandAll} className="px-2 py-1 hover:bg-[var(--oc-hover)]">
            全部展开
          </button>
          <button type="button" onClick={collapseAll} className="px-2 py-1 hover:bg-[var(--oc-hover)]">
            全部折叠
          </button>
        </div>
      </header>

      <div className={`${LIST_GRID} flex-1 overflow-y-auto px-6 pb-24`}>
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="text-ink-faint">
            <tr className="row-rule">
              <th className="py-2 font-normal">名称</th>
              <th className="w-24 py-2 font-normal">子项</th>
              <th className="w-24 py-2 font-normal">字数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entry.id} className="row-rule hover:bg-[var(--oc-hover)]">
                <td className="py-1.5">
                  <div className="flex items-center gap-1" style={{ paddingLeft: row.depth * 16 }}>
                    {row.hasChildren ? (
                      <button
                        type="button"
                        onClick={() => toggle(row.entry.id)}
                        className="flex h-5 w-5 items-center justify-center text-ink-faint hover:text-ink"
                        aria-label={expanded.has(row.entry.id) ? '折叠' : '展开'}
                      >
                        {expanded.has(row.entry.id) ? (
                          <ChevronDown size={14} strokeWidth={2} />
                        ) : (
                          <ChevronRight size={14} strokeWidth={2} />
                        )}
                      </button>
                    ) : (
                      <span className="h-5 w-5" />
                    )}
                    {renaming === row.entry.id ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => void commitRename(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void commitRename(row)
                          if (event.key === 'Escape') setRenaming(null)
                        }}
                        className={INPUT_LINE}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming(row.entry.id)
                          setDraft(row.entry.title)
                        }}
                        className="truncate text-left text-ink"
                      >
                        {row.entry.title}
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-1.5 text-ink-muted">{row.childCount > 0 ? row.childCount : ''}</td>
                <td className="py-1.5 text-ink-muted">{wordCount(row.entry)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-ink-faint">
                  还没有词条
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
