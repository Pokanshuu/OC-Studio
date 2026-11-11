'use client'

/**
 * 地图选择器 —— 从左上角的地图名片垂下来的卡片列表。
 *
 * 一行 = 一张地图：左边名字压在**纸色实底**上，向右渐隐到不模糊的缩略图
 * （`from-paper` 渐变 + 反向 mask 的 `backdrop-blur`，和封面卡「渐进模糊」同一套观感）。
 *
 * 为什么这里曾经糊成一块灰带：面板自己是 `bg-paper/85 + backdrop-blur-lg`，
 * 行里的 `backdrop-blur` 就变成了**嵌套的 backdrop-filter** —— WebView2 里嵌套时
 * 采样的是面板外那层（地图），不是行里的图，于是整行被糊平。
 * 现在面板改不透明（`PANEL_SOLID`，去掉面板自己的 blur），行的模糊只采样行内的图。
 * mask 走**内联 style**：Tailwind 的任意属性类一旦没进样式表，模糊层就会铺满整行。
 */
import { useState } from 'react'
import { Check, Info, Pencil, Plus, Trash2 } from 'lucide-react'
import { resolveImageUrl } from '@/lib/image-service'
import { BTN_QUIET, ICON_BTN, INPUT_LINE, PANEL_SOLID } from '@/lib/ui-tokens'
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
import type { MapEntity } from '../services'
import { isImeComposing } from '@/lib/ime'

/** 渐隐遮罩：右边留给缩略图，左边交给纸色实底 */
const FADE_MASK = 'linear-gradient(to right, black, transparent 62%)'

interface MapSwitcherProps {
  maps: readonly MapEntity[]
  activeId: number | null
  /** 每张地图的锚点数（按 `map_id` = 地图名统计，空归属不算在任一图上） */
  anchorCount: (map: MapEntity) => number
  onSelect: (id: number) => void
  onCreate: () => void
  onRename: (id: number, name: string) => void
  /** 带上名字：id 只在本次会话有效，整库重读过就对不上（见 `deleteMap` 的说明） */
  onDelete: (id: number, name: string) => void
  /** 打开这张图的详情（尺寸 / 锚点 / 标注 / 重新生成 / 导出） */
  onOpenDetail: () => void
}

export function MapSwitcher({
  maps,
  activeId,
  anchorCount,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onOpenDetail,
}: MapSwitcherProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  /**
   * 删除前先问一句 —— 与角色 / 国家 / 事件 / 笔记 / 小说是同一套规矩。
   *
   * 以前这个小垃圾桶是**一点就删**：整张图连同锚点、标注、生成参数一起没了，
   * 而隔壁「详情」里的删除却要确认。同一个动作两种行为，手滑一次就得去回收站捞。
   */
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null)

  return (
    <div
      className={`pointer-events-auto flex max-h-[min(60vh,460px)] w-full flex-col overflow-hidden p-2 ${PANEL_SOLID}`}
      role="dialog"
      aria-label="选择地图"
    >
      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
        {maps.map((map) => {
          const active = map.id === activeId
          const renaming = renamingId === map.id
          return (
            <div key={map.id} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (!renaming) onSelect(map.id)
                }}
                aria-current={active}
                className={`relative flex h-16 w-full items-stretch overflow-hidden rounded-item border text-left transition-colors ${
                  active ? 'border-ink' : 'border-transparent hover:border-line'
                }`}
              >
                {map.image ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImageUrl(map.image, 'map')}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    {/* 渐进模糊：右侧清楚，向左渐隐。mask 内联，不依赖样式表里有没有生成 */}
                    <span
                      aria-hidden
                      className="absolute inset-0 backdrop-blur-[6px]"
                      style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
                    />
                  </>
                ) : (
                  <span className="absolute inset-0 bg-paper-card" aria-hidden />
                )}
                {/* 左实色混色 → 右透明（名字压在这块上） */}
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-r from-paper via-paper/85 to-transparent"
                />

                <span className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
                  <span className="truncate text-[13px] text-ink">{map.name}</span>
                  <span className="flex items-baseline gap-1 text-[11px] tabular-nums text-ink-faint">
                    {map.seed !== undefined ? <span>seed {map.seed}</span> : null}
                    {map.seed !== undefined ? <span aria-hidden>·</span> : null}
                    <span>{anchorCount(map)} 个锚点</span>
                  </span>
                </span>
                {active ? (
                  <span className="relative z-10 flex items-center pr-3 text-ink">
                    <Check size={14} strokeWidth={2} />
                  </span>
                ) : null}
              </button>

              {renaming ? (
                <div className="mt-1 flex items-center gap-1 px-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      // 组字中的回车是「选候选词」/ Esc 是「取消组字」：此时不提交、不关闭
                      if (isImeComposing(event)) return
                      if (event.key === 'Enter') {
                        const next = draft.trim()
                        if (next !== '') onRename(map.id, next)
                        setRenamingId(null)
                      }
                      if (event.key === 'Escape') setRenamingId(null)
                    }}
                    className={INPUT_LINE}
                    aria-label="地图名"
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
                <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(map.id)
                      setDraft(map.name)
                    }}
                    className={ICON_BTN}
                    aria-label="重命名"
                    title="重命名"
                  >
                    <Pencil size={12} strokeWidth={2} />
                  </button>
                  {maps.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ id: map.id, name: map.name })}
                      className={`${ICON_BTN} hover:text-error`}
                      aria-label="删除地图"
                      title="删除"
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

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
        <button type="button" onClick={onCreate} className={BTN_QUIET}>
          <Plus size={13} strokeWidth={2} />
          新建地图
        </button>
        <button type="button" onClick={onOpenDetail} className={BTN_QUIET}>
          <Info size={13} strokeWidth={2} />
          详情
        </button>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除地图</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.name ?? ''}」和它的锚点、标注会一起移到回收站，可在回收站里恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete !== null) onDelete(pendingDelete.id, pendingDelete.name)
                setPendingDelete(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
