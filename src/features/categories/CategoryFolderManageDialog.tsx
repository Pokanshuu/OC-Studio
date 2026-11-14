'use client'

/**
 * 分类文件夹的两个动作（卡片 / 画廊视图里右键「堆」触发）：
 * - `rename`  改名：批量改条目的 `folder` 键，条目本身不动
 * - `members` 管理内容：勾选决定谁在这个夹里（取消勾选 = 回到未分组）
 *
 * 与角色侧的 `FolderManageDialog` 同一套交互与口径：
 * 文件夹只是条目上的一个名字，没有文件夹表；空文件夹由
 * `.ocstudio/world-folders.json`（按分类分组）留住。
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Folder } from 'lucide-react'
import type { WorldEntry } from '@/types'
import { BTN_PRIMARY, BTN_QUIET, FIELD_LABEL_BLOCK, INPUT_LINE, PAGE_TITLE, PANEL } from '@/lib/ui-tokens'
import { CheckboxBox } from '@/components/ui/checkbox'
import { isImeComposing } from '@/lib/ime'

interface CategoryFolderManageDialogProps {
  open: boolean
  mode: 'rename' | 'members'
  folder: string | null
  /** 当前分类的全部条目（未删除）；对话框自己算勾选态 */
  entries: WorldEntry[]
  onClose: () => void
  onRename: (from: string, to: string) => Promise<void>
  /** `inFolder` = true 表示把该条目放进本夹，false 表示移出 */
  onToggleMember: (id: number, inFolder: boolean) => Promise<void>
}

export function CategoryFolderManageDialog(props: CategoryFolderManageDialogProps) {
  // 用 key 重置草稿：不要在 effect 里 setState（会多一轮渲染，且打开时闪一下旧名字）
  if (!props.open || !props.folder) return null
  return <CategoryFolderDialogBody key={`${props.mode}:${props.folder}`} {...props} />
}

function CategoryFolderDialogBody({
  mode,
  folder,
  entries,
  onClose,
  onRename,
  onToggleMember,
}: CategoryFolderManageDialogProps) {
  const name = folder ?? ''
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Set<number>>(new Set())

  const members = useMemo(
    () => new Set(entries.filter((entry) => (entry.folder ?? '').trim() === name).map((entry) => entry.id)),
    [entries, name],
  )

  const commitRename = async (): Promise<void> => {
    const next = draft.trim()
    if (next.length === 0 || next === name || busy) return
    setBusy(true)
    setError('')
    try {
      await onRename(name, next)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (entry: WorldEntry): Promise<void> => {
    if (pending.has(entry.id)) return
    const inFolder = members.has(entry.id)
    setPending((prev) => new Set(prev).add(entry.id))
    try {
      await onToggleMember(entry.id, !inFolder)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const dialog = (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`flex max-h-[80vh] w-[440px] flex-col p-6 max-md:w-[calc(100%-2rem)] ${PANEL}`}>
        <h2 className={`mb-1 flex items-center gap-2 ${PAGE_TITLE}`}>
          <Folder size={16} strokeWidth={2} className="text-ink-muted" />
          {mode === 'rename' ? '重命名文件夹' : name}
        </h2>

        {mode === 'rename' ? (
          <div className="mt-4">
            <label className={FIELD_LABEL_BLOCK}>名称</label>
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (isImeComposing(event)) return
                if (event.key === 'Enter') void commitRename()
                if (event.key === 'Escape') onClose()
              }}
              className={INPUT_LINE}
            />
            {error ? <p className="mt-3 text-[12px] text-error">{error}</p> : null}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={onClose} className={BTN_QUIET}>
                取消
              </button>
              <button type="button" onClick={() => void commitRename()} disabled={busy || draft.trim() === ''} className={BTN_PRIMARY}>
                <Check size={14} strokeWidth={2} />
                <span>{busy ? '保存中…' : '确认'}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[12px] text-ink-faint">
              {members.size > 0 ? `已在「${name}」里 ${members.size} 个` : `「${name}」里还没有条目`}
            </p>
            <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-ink-faint">还没有条目</p>
              ) : (
                entries.map((entry) => {
                  const checked = members.has(entry.id)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => void toggle(entry)}
                      disabled={pending.has(entry.id)}
                      className="flex w-full items-center gap-2 rounded-item px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:opacity-50"
                    >
                      <CheckboxBox checked={checked} />
                      <span className="truncate">{entry.title || '未命名'}</span>
                      {entry.folder && entry.folder !== name ? (
                        <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{entry.folder}</span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
            {error ? <p className="mt-2 text-[12px] text-error">{error}</p> : null}
            <div className="mt-4 flex items-center justify-end">
              <button type="button" onClick={onClose} className={BTN_PRIMARY}>
                完成
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return overlayRoot ? createPortal(dialog, overlayRoot) : dialog
}
