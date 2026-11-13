'use client'

/**
 * 角色列表的文件夹条（W6 UI）。
 *
 * 口径（`docs/待设计决策清单.md` §8.1）：文件夹只是角色上的一个名字。
 * **删文件夹不删角色**，角色回到未分组；重命名只批量改这个名字。
 *
 * 末尾是一个和标签一样的输入框：回车就能新建文件夹。空文件夹本身没有角色可挂，
 * 靠 `folders.ts` 的清单（`.ocstudio/folders.json`）留住；卡片 / 行的
 * 「移到文件夹」里也有同一个入口（居中弹窗）。
 */
import { useState } from 'react'
import { Folder, Pencil, Plus, Trash2, X } from 'lucide-react'
import { CHIP, CHIP_EDIT, CHIP_ON, INLINE_INPUT } from '@/lib/ui-tokens'
import { MediaContextMenu } from '@/components/shared/MediaContextMenu'
import { useDevice } from '@/lib/use-device'
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
import { isImeComposing } from '@/lib/ime'

export type FolderFilter = 'all' | 'ungrouped' | string

export function CharacterFolderBar({
  folders,
  ungrouped,
  total,
  value,
  onChange,
  onRename,
  onDelete,
  onCreate,
  noun = '角色',
}: {
  folders: CharacterFolder[]
  ungrouped: number
  total: number
  value: FolderFilter
  /** 切换筛选：带上点击事件，列表拿它算「打开 / 返回文件夹」动画的原点 */
  onChange: (next: FolderFilter, event?: React.MouseEvent<HTMLElement>) => void
  onRename: (from: string, to: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
  /** 新建（可能是空的）文件夹；成功后清空输入 */
  onCreate: (name: string) => Promise<void>
  /** 文案里的实体称呼（角色 / 条目），只影响提示语 */
  noun?: string
}) {
  const [menu, setMenu] = useState<{ name: string; at: { x: number; y: number } } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleting, setDeleting] = useState<CharacterFolder | null>(null)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState('')
  /** 悬停 / 聚焦的文件夹：数字让位给删除 ×（移动端没有 hover，× 常显） */
  const [hovered, setHovered] = useState<string | null>(null)
  const { isMobile } = useDevice()

  const commitRename = async (from: string) => {
    const name = renameDraft.trim()
    setRenaming(null)
    if (name.length === 0 || name === from) return
    await onRename(from, name)
    if (value === from) onChange(name)
  }

  const commitCreate = () => {
    const name = createDraft.trim()
    if (name === '' || creating) return
    // 同名就当作「跳到那个文件夹」，不重复建
    if (folders.some((folder) => folder.name === name)) {
      setCreateDraft('')
      onChange(name)
      return
    }
    setCreating(true)
    void onCreate(name)
      .then(() => setCreateDraft(''))
      .catch(() => {})
      .finally(() => setCreating(false))
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
      <button
        type="button"
        onClick={(event) => onChange('all', event)}
        className={value === 'all' ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
      >
        全部 {total}
      </button>
      <button
        type="button"
        onClick={(event) => onChange('ungrouped', event)}
        className={value === 'ungrouped' ? CHIP_ON : `${CHIP} transition-colors hover:text-ink`}
      >
        未分组 {ungrouped}
      </button>

      {folders.map((folder) => {
        const active = value === folder.name
        const showDelete = isMobile || hovered === folder.name
        return (
        <span
          key={folder.name}
          className={`relative ${
            renaming === folder.name
              ? CHIP_EDIT
              : active
                ? CHIP_ON
                : `${CHIP} transition-colors hover:text-ink`
          }`}
          onMouseEnter={() => setHovered(folder.name)}
          onMouseLeave={() => setHovered((current) => (current === folder.name ? null : current))}
          onFocus={() => setHovered(folder.name)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setHovered((current) => (current === folder.name ? null : current))
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({ name: folder.name, at: { x: event.clientX, y: event.clientY } })
          }}
        >
          {renaming === folder.name ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={() => void commitRename(folder.name)}
              onKeyDown={(event) => {
                if (isImeComposing(event)) return
                if (event.key === 'Enter') void commitRename(folder.name)
                if (event.key === 'Escape') setRenaming(null)
              }}
              className={INLINE_INPUT}
            />
          ) : (
            <button
              type="button"
              onClick={(event) => onChange(folder.name, event)}
              className="flex min-w-0 items-center gap-1"
            >
              <Folder size={12} strokeWidth={2} />
              {folder.name}
              {/* 悬停时数字让位给删除 ×：同一个位置，不加宽、不留空 */}
              <span
                className="transition-opacity"
                style={{ opacity: isMobile ? 0.6 : showDelete ? 0 : 0.6 }}
              >
                {folder.count}
              </span>
            </button>
          )}
          {renaming === folder.name ? null : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setDeleting(folder)
              }}
              aria-label={`删除文件夹 ${folder.name}`}
              title="删除文件夹"
              /*
               * 桌面：绝对定位在数字那一格，平时不占位 —— 文件夹之间不会空出一截。
               * 移动端没有 hover：回到文档流里常显，数字也还在。
               */
              className={
                isMobile
                  ? 'static ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center transition-opacity hover:text-error'
                  : 'absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center transition-opacity hover:text-error'
              }
              style={{ opacity: showDelete ? 1 : 0, pointerEvents: showDelete ? 'auto' : 'none' }}
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
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
        )
      })}

      {/* 和标签一样：末尾一个输入框，回车就新建 —— 空文件夹靠清单留住 */}
      <div className="flex items-center gap-1 rounded-item bg-paper-alt px-2 py-[3px] text-[12px] transition-colors focus-within:bg-paper-card">
        <input
          value={createDraft}
          onChange={(event) => setCreateDraft(event.target.value)}
          onKeyDown={(event) => {
            // 组字中的回车是「选候选词」/ Esc 是「取消组字」：此时不提交、不关闭
            if (isImeComposing(event)) return
            if (event.key === 'Enter') {
              event.preventDefault()
              commitCreate()
            }
            if (event.key === 'Escape') {
              setCreateDraft('')
              event.currentTarget.blur()
            }
          }}
          placeholder="新建文件夹"
          aria-label="新建文件夹"
          className="w-16 bg-transparent text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="button"
          onClick={commitCreate}
          disabled={creating || createDraft.trim() === ''}
          title="新建文件夹"
          aria-label="新建文件夹"
          className="flex shrink-0 items-center text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
        >
          <Plus size={12} strokeWidth={2} />
        </button>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹「{deleting?.name}」</AlertDialogTitle>
            <AlertDialogDescription>
              里面的 {deleting?.count ?? 0} 个{noun}回到未分组，{noun}本身不会被删除。
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
export function folderEmptyHint(value: FolderFilter, noun = '角色'): string {
  if (value === 'ungrouped') return `未分组里还没有${noun}`
  if (value !== 'all') return `「${value}」里还没有${noun}`
  return `还没有${noun}`
}

