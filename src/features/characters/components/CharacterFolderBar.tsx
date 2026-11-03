'use client'

/**
 * 角色列表的文件夹条（W6 UI）。
 *
 * 口径（`docs/待设计决策清单.md` §8.1）：文件夹只是角色上的一个名字，
 * 所以这里能做的只有「建 / 改名 / 删」——**删文件夹不删角色**，角色回到未分组。
 */
import { useState } from 'react'
import { Check, MoreHorizontal, Plus, X } from 'lucide-react'
import { BTN_QUIET, CHIP, INPUT_LINE, MENU, MENU_ITEM } from '@/lib/ui-tokens'
import type { CharacterFolder } from '../folders'

export type FolderFilter = 'all' | 'ungrouped' | string

export function CharacterFolderBar({
  folders,
  ungrouped,
  total,
  value,
  onChange,
  onCreate,
  onRename,
  onDelete,
}: {
  folders: CharacterFolder[]
  ungrouped: number
  total: number
  value: FolderFilter
  onChange: (next: FolderFilter) => void
  onCreate: (name: string) => Promise<void>
  onRename: (from: string, to: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const commitCreate = async () => {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name.length === 0) return
    await onCreate(name)
    onChange(name)
  }

  const commitRename = async (from: string) => {
    const name = renameDraft.trim()
    setRenaming(null)
    if (name.length === 0 || name === from) return
    await onRename(from, name)
    if (value === from) onChange(name)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
      <button type="button" onClick={() => onChange('all')} className={`${CHIP} ${value === 'all' ? 'text-ink' : 'text-ink-muted'}`}>
        全部 {total}
      </button>
      <button
        type="button"
        onClick={() => onChange('ungrouped')}
        className={`${CHIP} ${value === 'ungrouped' ? 'text-ink' : 'text-ink-muted'}`}
      >
        未分组 {ungrouped}
      </button>

      {folders.map((folder) => (
        <span key={folder.name} className="relative flex items-center">
          {renaming === folder.name ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={() => void commitRename(folder.name)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitRename(folder.name)
                if (event.key === 'Escape') setRenaming(null)
              }}
              className={INPUT_LINE}
            />
          ) : (
            <button
              type="button"
              onClick={() => onChange(folder.name)}
              className={`${CHIP} ${value === folder.name ? 'text-ink' : 'text-ink-muted'}`}
            >
              {folder.name} {folder.count}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuFor(menuFor === folder.name ? null : folder.name)}
            className="ml-0.5 flex h-5 w-5 items-center justify-center text-ink-faint hover:text-ink"
            aria-label={`${folder.name} 的更多操作`}
          >
            <MoreHorizontal size={12} strokeWidth={2} />
          </button>
          {menuFor === folder.name ? (
            <div className={`${MENU} absolute left-0 top-7 z-20 min-w-32`}>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setRenaming(folder.name)
                  setRenameDraft(folder.name)
                  setMenuFor(null)
                }}
              >
                <Check size={12} strokeWidth={2} />
                重命名
              </button>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setMenuFor(null)
                  void onDelete(folder.name).then(() => {
                    if (value === folder.name) onChange('all')
                  })
                }}
              >
                <X size={12} strokeWidth={2} />
                删除文件夹
              </button>
            </div>
          ) : null}
        </span>
      ))}

      {creating ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commitCreate()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commitCreate()
            if (event.key === 'Escape') {
              setCreating(false)
              setDraft('')
            }
          }}
          placeholder="文件夹名"
          className={INPUT_LINE}
        />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className={BTN_QUIET} title="新建文件夹">
          <Plus size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
