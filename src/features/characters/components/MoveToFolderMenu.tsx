'use client'

/**
 * 「移到文件夹」小菜单（角色卡片 / 行共用）。
 *
 * 文件夹只是角色上的一个名字（`docs/待设计决策清单.md` §8.1），所以这里做三件事：
 * 移到已有文件夹、**新建一个文件夹并移进去**（空文件夹在这个模型里不存在，
 * 所以「新建」必然伴随一次移动）、移出到未分组。
 *
 * 面板走 `MenuSurface`（Portal 到 `#overlay-root`、贴边翻转、点外 / Escape 关闭）：
 * 卡片在 `overflow` 容器里，用 `absolute` 会被裁掉。
 */
import { useState } from 'react'
import { Check, FolderInput, FolderPlus } from 'lucide-react'
import { ICON_BTN, INLINE_INPUT, MENU_ITEM_BASE } from '@/lib/ui-tokens'
import { MenuSurface } from '@/components/shared/menu/MenuSurface'
import { OverlayIconButton } from '@/components/shared/OverlayIconButton'

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
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  const open = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setCreating(false)
    setDraft('')
    setAt({ x: Math.max(8, rect.right - 160), y: rect.bottom + 4 })
  }

  const close = () => {
    setAt(null)
    setCreating(false)
  }

  const commitCreate = () => {
    const name = draft.trim()
    if (name.length > 0) onMove(name)
    close()
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

          {creating ? (
            <div className="px-3 py-1">
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitCreate()
                  if (event.key === 'Escape') setCreating(false)
                }}
                onBlur={commitCreate}
                placeholder="文件夹名"
                className={INLINE_INPUT}
              />
            </div>
          ) : (
            <button
              type="button"
              className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
              onClick={() => setCreating(true)}
            >
              <FolderPlus size={12} strokeWidth={2} />
              新建文件夹…
            </button>
          )}

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
    </span>
  )
}
