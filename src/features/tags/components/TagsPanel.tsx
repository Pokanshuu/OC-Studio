'use client'

/**
 * 设置 › 世界 › 标签（`docs/模板.md` §8.9）。
 *
 * 标签是**维度**，不是分类树：这里只做改名 / 合并 / 删除 / 颜色 / 使用篇数，
 * 不做层级。删除标签**不等于删笔记**：只把引用从笔记里摘掉，笔记本身保留。
 *
 * 写文件的分工：标签名存在各实体 frontmatter 的 `标签:` 里，颜色/分类在
 * `.ocstudio/tags.json`。改名与合并不手写文件，改的是内存里的 tag id / name，
 * 真正的文件重写由落盘队列完成。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, GitMerge, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import { useTags, useTagMutations } from '../hooks/useTags'
import { getTagUsage, mergeTag } from '../services'
import { TAG_PRESET_COLORS } from '@/lib/tag-colors'
import type { Tag } from '@/types'
import { BTN_QUIET, ICON_BTN, INPUT_LINE, MENU_ITEM, MENU_GROUP_LABEL, ROUND_CONTROL } from '@/lib/ui-tokens'

interface TagMenuState {
  kind: 'color' | 'merge'
  tag: Tag
  at: { x: number; y: number }
}

export function TagsPanel() {
  const { tags, loading, error, refresh } = useTags()
  const { createTag, updateTag, deleteTag } = useTagMutations()
  const [usage, setUsage] = useState<Map<number, number>>(new Map())
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<TagMenuState | null>(null)
  const [deleting, setDeleting] = useState<Tag | null>(null)
  const [newName, setNewName] = useState('')

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await getTagUsage())
    } catch {
      setUsage(new Map())
    }
  }, [])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage, tags])

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans')),
    [tags],
  )

  const commitRename = async (tag: Tag): Promise<void> => {
    const next = draft.trim()
    if (next === '' || next === tag.name) {
      setRenamingId(null)
      return
    }
    if (tags.some((item) => item.id !== tag.id && item.name === next)) {
      toast.error('已经有同名标签')
      return
    }
    setBusy(true)
    try {
      await updateTag(tag.id, { name: next })
      refresh()
      setRenamingId(null)
    } catch (err) {
      toast.error('改名失败', { description: String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleMerge = async (source: Tag, target: Tag): Promise<void> => {
    setMenu(null)
    setBusy(true)
    try {
      await mergeTag(source.id, target.id)
      refresh()
      await loadUsage()
      toast.success(`已把「${source.name}」合并到「${target.name}」`)
    } catch (err) {
      toast.error('合并失败', { description: String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleColor = async (tag: Tag, color: string): Promise<void> => {
    setMenu(null)
    try {
      await updateTag(tag.id, { color })
      refresh()
    } catch (err) {
      toast.error('改色失败', { description: String(err) })
    }
  }

  const handleDelete = async (tag: Tag): Promise<void> => {
    setBusy(true)
    try {
      await deleteTag(tag.id)
      refresh()
      await loadUsage()
      setDeleting(null)
    } catch (err) {
      toast.error('删除失败', { description: String(err) })
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async (): Promise<void> => {
    const name = newName.trim()
    if (name === '') return
    if (tags.some((tag) => tag.name === name)) {
      toast.error('已经有同名标签')
      return
    }
    setBusy(true)
    try {
      await createTag({ name, category: '', color: TAG_PRESET_COLORS[tags.length % TAG_PRESET_COLORS.length] })
      setNewName('')
      refresh()
    } catch (err) {
      toast.error('新建失败', { description: String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {loading ? <p className="py-3 text-[12px] text-ink-faint">加载中…</p> : null}
      {error ? <p className="py-3 text-[12px] text-error">{error}</p> : null}

      {sortedTags.length === 0 && !loading ? (
        <p className="py-3 text-[12px] text-ink-faint">还没有标签</p>
      ) : (
        <div className="flex flex-col rules-end">
          {sortedTags.map((tag) => {
            const count = usage.get(tag.id) ?? 0
            const renaming = renamingId === tag.id
            return (
              <div
                key={tag.id}
                className="row-rule flex items-center gap-2 py-2 text-sm text-ink"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setMenu({ kind: 'color', tag, at: { x: rect.left, y: rect.bottom + 4 } })
                  }}
                  className={`h-3.5 w-3.5 shrink-0 rounded-full border border-line ${ROUND_CONTROL}`}
                  style={{ backgroundColor: tag.color || 'var(--oc-ink-faint)' }}
                  aria-label={`修改「${tag.name}」的颜色`}
                  title="颜色"
                />
                {renaming ? (
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void commitRename(tag)
                        if (event.key === 'Escape') setRenamingId(null)
                      }}
                      className={`${INPUT_LINE} h-7`}
                      aria-label={`重命名「${tag.name}」`}
                    />
                    <button
                      type="button"
                      onClick={() => void commitRename(tag)}
                      disabled={busy}
                      className={ICON_BTN}
                      aria-label="确定改名"
                    >
                      <Check size={13} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                )}
                <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                  {count} 篇
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(tag.id)
                    setDraft(tag.name)
                  }}
                  className={ICON_BTN}
                  aria-label={`重命名「${tag.name}」`}
                >
                  <Pencil size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setMenu({ kind: 'merge', tag, at: { x: rect.left, y: rect.bottom + 4 } })
                  }}
                  className={ICON_BTN}
                  aria-label={`合并「${tag.name}」`}
                >
                  <GitMerge size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(tag)}
                  className={`${ICON_BTN} hover:text-error`}
                  aria-label={`删除「${tag.name}」`}
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleCreate()
            }
          }}
          placeholder="新标签"
          className={`${INPUT_LINE} h-7 min-w-0 flex-1`}
          aria-label="新标签名称"
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy || newName.trim() === ''}
          className={`${BTN_QUIET} shrink-0`}
        >
          <Plus size={13} strokeWidth={2} />
          新建标签
        </button>
      </div>

      {menu ? (
        <MenuSurface
          at={menu.at}
          onClose={() => setMenu(null)}
          width={menu.kind === 'color' ? 168 : 220}
          ariaLabel={menu.kind === 'color' ? '标签颜色' : '合并到'}
        >
          {menu.kind === 'color' ? (
            <div className="grid grid-cols-5 gap-1 p-1">
              {TAG_PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => void handleColor(menu.tag, color)}
                  className={`h-6 w-6 rounded-full border border-line transition-transform hover:scale-110 ${ROUND_CONTROL}`}
                  style={{ backgroundColor: color }}
                  aria-label={`使用颜色 ${color}`}
                />
              ))}
            </div>
          ) : (
            <>
              <span className={MENU_GROUP_LABEL}>合并到</span>
              <div className="max-h-64 overflow-y-auto">
                {sortedTags
                  .filter((tag) => tag.id !== menu.tag.id)
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => void handleMerge(menu.tag, tag)}
                      className={`${MENU_ITEM} gap-2`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color || 'var(--color-ink-faint)' }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  ))}
                {sortedTags.length <= 1 ? (
                  <p className="px-3 py-2 text-[12px] text-ink-faint">还没有别的标签</p>
                ) : null}
              </div>
            </>
          )}
        </MenuSurface>
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标签</AlertDialogTitle>
            <AlertDialogDescription>
              只从笔记里摘掉这个标签，笔记本身保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) void handleDelete(deleting) }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
