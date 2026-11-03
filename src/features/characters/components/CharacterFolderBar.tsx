'use client'

/**
 * 角色列表的文件夹条（W6 UI）。
 *
 * 口径（`docs/待设计决策清单.md` §8.1）：文件夹只是角色上的一个名字，
 * 没有文件夹表，所以这里只做「筛选 / 改名 / 删」——
 * **删文件夹不删角色**，角色回到未分组。
 *
 * 「新建」不在这里：空文件夹在这个模型里不可能存在，唯一有意义的建法是
 * 「把这个角色移进一个新名字」，入口在卡片 / 行的「移到文件夹」菜单里
 * （`MoveToFolderMenu` 的「新建文件夹…」）。
 */
import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { CHIP, CHIP_ON, ICON_BTN, INLINE_INPUT } from '@/lib/ui-tokens'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
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
import type { CharacterFolder } from '../folders'

export type FolderFilter = 'all' | 'ungrouped' | string

export function CharacterFolderBar({
  folders,
  ungrouped,
  total,
  value,
  onChange,
  onRename,
  onDelete,
}: {
  folders: CharacterFolder[]
  ungrouped: number
  total: number
  value: FolderFilter
  onChange: (next: FolderFilter) => void
  onRename: (from: string, to: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const [menu, setMenu] = useState<{ name: string; at: { x: number; y: number } } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleting, setDeleting] = useState<CharacterFolder | null>(null)

  const commitRename = async (from: string) => {
    const name = renameDraft.trim()
    setRenaming(null)
    if (name.length === 0 || name === from) return
    await onRename(from, name)
    if (value === from) onChange(name)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={value === 'all' ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
      >
        全部 {total}
      </button>
      <button
        type="button"
        onClick={() => onChange('ungrouped')}
        className={value === 'ungrouped' ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
      >
        未分组 {ungrouped}
      </button>

      {folders.map((folder) => (
        <span key={folder.name} className="flex items-center">
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
              className={INLINE_INPUT}
            />
          ) : (
            <button
              type="button"
              onClick={() => onChange(folder.name)}
              className={value === folder.name ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
            >
              {folder.name} {folder.count}
            </button>
          )}
          <button
            type="button"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenu({
                name: folder.name,
                at: { x: Math.max(8, rect.right - 128), y: rect.bottom + 4 },
              })
            }}
            className={`${ICON_BTN} ml-0.5`}
            aria-label={`${folder.name} 的更多操作`}
          >
            <MoreHorizontal size={14} strokeWidth={2} />
          </button>
          {menu && menu.name === folder.name ? (
            <MediaContextMenu
              at={menu.at}
              onClose={() => setMenu(null)}
              items={[
                {
                  label: '重命名',
                  icon: <Pencil size={13} strokeWidth={2} />,
                  onSelect: () => {
                    setRenaming(folder.name)
                    setRenameDraft(folder.name)
                  },
                },
                {
                  label: '删除文件夹',
                  danger: true,
                  icon: <Trash2 size={13} strokeWidth={2} />,
                  onSelect: () => setDeleting(folder),
                },
              ]}
            />
          ) : null}
        </span>
      ))}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹「{deleting?.name}」</AlertDialogTitle>
            <AlertDialogDescription>
              里面的 {deleting?.count ?? 0} 个角色回到未分组，角色本身不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const name = deleting?.name
                setDeleting(null)
                if (!name) return
                void onDelete(name).then(() => {
                  if (value === name) onChange('all')
                })
              }}
            >
              删除文件夹
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** 放在列表里给「筛选到空」用的空态（不属于文件夹条，但文案要跟着它走） */
export function folderEmptyHint(value: FolderFilter): string {
  if (value === 'ungrouped') return '未分组里还没有角色'
  if (value !== 'all') return `「${value}」里还没有角色`
  return '还没有角色'
}
