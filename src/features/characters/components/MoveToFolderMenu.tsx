'use client'

/**
 * 「移到文件夹」小菜单（角色卡片 / 行共用）。
 *
 * 文件夹只是角色上的一个名字（`docs/待设计决策清单.md` §8.1），所以这里只做一件事：
 * 把 `folder` 换成另一个名字，或清空回未分组。
 */
import { useState } from 'react'
import { FolderInput } from 'lucide-react'
import { ICON_BTN, MENU, MENU_ITEM } from '@/lib/ui-tokens'

export function MoveToFolderMenu({
  folders,
  current,
  onMove,
}: {
  folders: string[]
  current?: string
  onMove: (folder: string | null) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={ICON_BTN}
        aria-label="移到文件夹"
        title="移到文件夹"
      >
        <FolderInput size={14} strokeWidth={2} />
      </button>
      {open ? (
        <span
          className={`${MENU} absolute right-0 top-full z-30 flex min-w-36 flex-col`}
          onClick={(event) => event.stopPropagation()}
        >
          {folders.length === 0 ? (
            <span className={`${MENU_ITEM} text-ink-faint`}>还没有文件夹</span>
          ) : (
            folders.map((folder) => (
              <button
                key={folder}
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setOpen(false)
                  if (folder !== current) onMove(folder)
                }}
              >
                {folder}
              </button>
            ))
          )}
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setOpen(false)
              if (current) onMove(null)
            }}
          >
            移出文件夹
          </button>
        </span>
      ) : null}
    </span>
  )
}
