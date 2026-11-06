'use client'

/**
 * 「移到文件夹」小菜单（角色卡片 / 行共用）。
 *
 * 文件夹只是角色上的一个名字（`folders.ts`），所以这里做三件事：
 * 移到已有文件夹、**新建一个文件夹并移进去**、移出到未分组。
 *
 * 「新建文件夹…」不再在原菜单里换成输入框，而是弹**居中的新建文件夹弹窗**：
 * 菜单在卡片旁边只有窄窄一条，输入框挤在里面既不像菜单也不像表单。
 *
 * 面板走 `MenuSurface`（Portal 到 `#overlay-root`、贴边翻转、点外 / Escape 关闭）：
 * 卡片在 `overflow` 容器里，用 `absolute` 会被裁掉。
 */
import { useState } from 'react'
import { Check, FolderInput, FolderPlus } from 'lucide-react'
import { ICON_BTN, MENU_ITEM_BASE } from '@/lib/ui-tokens'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import { OverlayIconButton } from '@/components/shared/OverlayIconButton'
import { NewFolderDialog } from './NewFolderDialog'

export function MoveToFolderMenu({
  folders,
  current,
  onMove,
  tone = 'default',
}: {
  folders: string[]
  current?: string
  onMove: (folder: string | null) => void
  /** `overlay` = 压在封面卡的照片上（与 DeleteButton 的 overlay 同一套皮肤） */
  tone?: 'default' | 'overlay'
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const open = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setAt({ x: Math.max(8, rect.right - 160), y: rect.bottom + 4 })
  }

  const close = () => {
    setAt(null)
  }

  return (
    <span className="inline-flex">
      {tone === 'overlay' ? (
        <OverlayIconButton label="移到文件夹" onClick={open}>
          <FolderInput size={14} strokeWidth={2} />
        </OverlayIconButton>
      ) : (
        <button
          type="button"
          onClick={open}
          className={ICON_BTN}
          aria-label="移到文件夹"
          title="移到文件夹"
        >
          <FolderInput size={14} strokeWidth={2} />
        </button>
      )}

      {at ? (
        <MenuSurface at={at} onClose={close} className="min-w-40">
          {folders.map((folder) => (
            <button
              key={folder}
              type="button"
              className={`${MENU_ITEM_BASE} ${
                folder === current ? 'text-ink' : 'text-ink-muted hover:text-ink'
              } hover:bg-[var(--oc-hover)]`}
              onClick={() => {
                close()
                if (folder !== current) onMove(folder)
              }}
            >
              <Check
                size={12}
                strokeWidth={2}
                className={folder === current ? 'text-ink' : 'text-transparent'}
              />
              <span className="truncate">{folder}</span>
            </button>
          ))}

          <button
            type="button"
            className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
            onClick={() => {
              close()
              setNewFolderOpen(true)
            }}
          >
            <FolderPlus size={12} strokeWidth={2} />
            新建文件夹…
          </button>

          {current ? (
            <button
              type="button"
              className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
              onClick={() => {
                close()
                onMove(null)
              }}
            >
              移出文件夹
            </button>
          ) : null}
        </MenuSurface>
      ) : null}

      <NewFolderDialog
        open={newFolderOpen}
        existing={folders}
        onClose={() => setNewFolderOpen(false)}
        onCreate={(name) => {
          setNewFolderOpen(false)
          onMove(name)
        }}
      />
    </span>
  )
}
