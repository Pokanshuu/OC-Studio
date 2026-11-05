'use client'

/**
 * 文件夹的两个动作（卡片 / 画廊视图里右键「堆」触发）：
 * - `rename`  改名：批量改 `folder` 键，角色本身不动
 * - `members` 管理内容：勾选决定谁在这个夹里（取消勾选 = 回到未分组）
 *
 * 数据口径仍然是 `docs/待设计决策清单.md` §8.1：文件夹只是角色上的一个名字，
 * 没有文件夹表；空文件夹由 `folders.ts` 的清单（`.ocstudio/folders.json`）留住。
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Folder } from 'lucide-react'
import type { Character } from '@/types'
import { BTN_PRIMARY, BTN_QUIET, FIELD_LABEL_BLOCK, INPUT_LINE, PAGE_TITLE, PANEL } from '@/lib/ui-tokens'
import { CheckboxBox } from '@/components/ui/checkbox'

interface FolderManageDialogProps {
  open: boolean
  mode: 'rename' | 'members'
  folder: string | null
  /** 全部角色（未删除）；对话框自己算勾选态 */
  characters: Character[]
  onClose: () => void
  onRename: (from: string, to: string) => Promise<void>
  /** `inFolder` = true 表示把该角色放进本夹，false 表示移出 */
  onToggleMember: (id: number, inFolder: boolean) => Promise<void>
}

export function FolderManageDialog(props: FolderManageDialogProps) {
  // 用 key 重置草稿：不要在 effect 里 setState（会多一轮渲染，且打开时闪一下旧名字）
  if (!props.open || !props.folder) return null
  return <FolderDialogBody key={`${props.mode}:${props.folder}`} {...props} />
}

function FolderDialogBody({
  mode,
  folder,
  characters,
  onClose,
  onRename,
  onToggleMember,
}: FolderManageDialogProps) {
  const name = folder ?? ''
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Set<number>>(new Set())

  const members = useMemo(
    () => new Set(characters.filter((character) => (character.folder ?? '').trim() === name).map((c) => c.id)),
    [characters, name],
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

  const toggle = async (character: Character): Promise<void> => {
    if (pending.has(character.id)) return
    const inFolder = members.has(character.id)
    setPending((prev) => new Set(prev).add(character.id))
    try {
      await onToggleMember(character.id, !inFolder)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(character.id)
        return next
      })
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const dialog = (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)]"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
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
              {members.size > 0 ? `已在「${name}」里 ${members.size} 个` : `「${name}」里还没有角色`}
            </p>
            <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
              {characters.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-ink-faint">还没有角色</p>
              ) : (
                characters.map((character) => {
                  const checked = members.has(character.id)
                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => void toggle(character)}
                      disabled={pending.has(character.id)}
                      className="flex w-full items-center gap-2 rounded-item px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:opacity-50"
                    >
                      <CheckboxBox checked={checked} />
                      <span className="truncate">{character.name}</span>
                      {character.folder && character.folder !== name ? (
                        <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{character.folder}</span>
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
