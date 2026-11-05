'use client'

/**
 * 地图选择器 —— 天气 App 里那种卡片列表。
 *
 * 一行 = 一张地图：左边名字压在**纸色实底**上，向右渐隐到不模糊的缩略图
 * （`from-paper` 渐变 + 反向 mask 的 `backdrop-blur`，与封面卡「渐进模糊混色」同一观感，
 * 只是方向从左到右）。点一行就切过去；管理动作（新建 / 重命名 / 删除）放底部。
 */
import { useState } from 'react'
import { Check, Library, Pencil, Plus, Trash2, X } from 'lucide-react'
import { resolveImageUrl } from '@/lib/image-service'
import type { MapEntity } from '../services'
import { BTN_QUIET, ICON_BTN, INPUT_LINE, PANEL } from '@/lib/ui-tokens'

interface MapSwitcherProps {
  maps: readonly MapEntity[]
  activeId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onRename: (id: number, name: string) => void
  onDelete: (id: number) => void
  /** 展开成完整地图库（尺寸 / 锚点 / 标注） */
  onOpenLibrary: () => void
  onClose: () => void
}

export function MapSwitcher({
  maps,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onOpenLibrary,
  onClose,
}: MapSwitcherProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <div className={`pointer-events-auto flex max-h-[60vh] w-[300px] flex-col overflow-hidden p-2 ${PANEL}`} role="dialog" aria-label="选择地图">
      <div className="flex items-center justify-between pl-1.5 pb-1">
        <span className="text-[11px] tracking-[0.08em] text-ink-faint">地图</span>
        <button type="button" onClick={onClose} className="text-ink-faint transition-colors hover:text-ink" aria-label="关闭">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
        {maps.map((map) => {
          const active = map.id === activeId
          const renaming = renamingId === map.id
          return (
            <div key={map.id} className="relative">
              <button
                type="button"
                onClick={() => { if (!renaming) onSelect(map.id) }}
                className={`relative flex h-16 w-full items-stretch overflow-hidden rounded-item border text-left transition-colors ${
                  active ? 'border-ink' : 'border-transparent hover:border-line'
                }`}
              >
                {/* 缩略图：右侧清楚，向左渐隐 */}
                {map.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImageUrl(map.image, 'map')}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 backdrop-blur-[6px] [mask-image:linear-gradient(to_right,black,transparent_62%)]" />
                  </>
                ) : (
                  <div className="absolute inset-0 bg-paper-card" />
                )}
                {/* 左实色混色 → 右透明（名字压在这块上） */}
                <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/85 to-transparent" />

                <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
                  <span className="truncate text-[13px] text-ink">{map.name}</span>
                  <span className="text-[11px] text-ink-faint">{map.image ? '有底图' : '无底图'}</span>
                </div>
                {active ? (
                  <span className="relative z-10 flex items-center pr-2 text-ink">
                    <Check size={14} strokeWidth={2} />
                  </span>
                ) : null}
              </button>

              {renaming ? (
                <div className="mt-1 flex items-center gap-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        const next = draft.trim()
                        if (next !== '') onRename(map.id, next)
                        setRenamingId(null)
                      }
                      if (event.key === 'Escape') setRenamingId(null)
                    }}
                    className={INPUT_LINE}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = draft.trim()
                      if (next !== '') onRename(map.id, next)
                      setRenamingId(null)
                    }}
                    className={ICON_BTN}
                    aria-label="确定"
                  >
                    <Check size={13} strokeWidth={2} />
                  </button>
                </div>
              ) : null}

              {active && renamingId !== map.id ? (
                <div className="absolute right-1 top-1 z-20 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setRenamingId(map.id); setDraft(map.name) }}
                    className={`${ICON_BTN} bg-paper/80`}
                    aria-label="重命名"
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                  {maps.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onDelete(map.id)}
                      className={`${ICON_BTN} bg-paper/80 hover:text-error`}
                      aria-label="删除地图"
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={onCreate} className={BTN_QUIET}>
          <Plus size={13} strokeWidth={2} />
          新建地图
        </button>
        <button type="button" onClick={onOpenLibrary} className={BTN_QUIET}>
          <Library size={13} strokeWidth={2} />
          地图库
        </button>
      </div>
    </div>
  )
}
