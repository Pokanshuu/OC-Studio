'use client'

/**
 * 「画廊」视图的卡片：一张封面。
 *
 * 版式来自 Simple_Cover —— 照片在上、下缘逐行渐进模糊溶进色块，标题（衬线）压在
 * 模糊区上，简介与小字落在色块里。三个列表（角色 / 国家 / 事件）共用这一个壳，
 * 各自的差异只在传进来的 title / intro / meta / emblem / marker 上。
 *
 * 所有版式数字都来自 `lib/cover/tuning.ts`（「视图 → 封面卡参数」可实时拖）。
 *
 * 卡里不放按钮：删除、移到文件夹这些动作由调用方给 `actions`，压在右上角 ——
 * 卡片本身就是个 `<button>`，嵌进去会变成非法 HTML。
 */

import type { CSSProperties, ReactNode } from 'react'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { useLongPress } from '@/lib/useLongPress'
import { useCoverTuning } from '@/lib/cover'
import { COVER_FRAME, COVER_INTRO, COVER_META, COVER_TEXT, COVER_TITLE, DRAG_SLOT_CARD } from '@/lib/ui-tokens'
import { CoverArt } from './CoverArt'

interface CoverCardProps {
  /** 拖拽排序用的实体 id */
  id: number
  /** 标题：角色名 / 国家名 / 事件名 */
  title: string
  /** 简介，两行截断 */
  intro?: string
  /** 色块底部那行小字（事件时间、种族 · 国籍） */
  meta?: string
  /** 已解析的头图地址；空 = 只有色块 */
  imageSrc?: string
  /** 没有头图时拿它取混色（头像 / 国徽） */
  tintSrc?: string
  /** 标题前的小标记（主要角色 / 重要事件） */
  marker?: ReactNode
  /** 标题上方的小像：角色头像 / 国家徽记 */
  emblem?: ReactNode
  /** 压在右上角的动作（移到文件夹 / 删除） */
  actions?: ReactNode
  onSelect: () => void
  onLongPress?: () => void
  isMobile: boolean
  /** 手动排序模式下才挂拖拽手柄 */
  sortable?: boolean
}

/**
 * 标题字号跟着卡片宽度走（`cqw`），长标题再降一档 —— 与参考实现的四档一致。
 * 下限是「小卡片上也读得清」，上限由面板给。
 */
function titleFontSize(title: string, scale: number, max: number): CSSProperties {
  const length = Array.from(title).length
  const factor = length > 24 ? 0.56 : length > 16 ? 0.67 : length > 10 ? 0.81 : 1
  const size = scale * factor
  const floor = Math.min(max, Math.max(11, Math.round(max * 0.55)))
  return { fontSize: `clamp(${floor}px, ${size.toFixed(2)}cqw, ${max}px)` }
}

export function CoverCard({
  id,
  title,
  intro,
  meta,
  imageSrc,
  tintSrc,
  marker,
  emblem,
  actions,
  onSelect,
  onLongPress,
  isMobile,
  sortable = false,
}: CoverCardProps) {
  const { setNodeRef, style, attributes, listeners, longPress: longPressSort, cardAttributes, cardListeners } =
    useSortableItem(id, !sortable)
  // 长按拖动和「长按动作表」抢同一个手势：排序模式下让拖动赢
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile && !longPressSort,
  })
  const tuning = useCoverTuning()

  return (
    <div
      ref={setNodeRef}
      style={longPressSort ? { ...style, touchAction: 'none' } : style}
      className={`group relative touch-feedback ${longPressSort ? 'touch-none' : ''}`}
      {...longPress}
      {...cardAttributes}
      {...cardListeners}
    >
      {sortable ? (
        <div className={DRAG_SLOT_CARD}>
          <DragHandle tone="overlay" handleProps={{ attributes, listeners }} />
        </div>
      ) : null}

      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div
          className={COVER_FRAME}
          style={{ containerType: 'inline-size', aspectRatio: String(tuning.aspect) }}
        >
          <CoverArt src={imageSrc} tintSrc={tintSrc} watermark={Array.from(title)[0] ?? ''} />
          <div
            className={COVER_TEXT}
            style={{
              bottom: `${tuning.textBottom}%`,
              left: `${tuning.textLeft}%`,
              right: `${tuning.textRight}%`,
            }}
          >
            {emblem ? <div className="mb-2 flex items-center gap-2">{emblem}</div> : null}
            <h3 className={COVER_TITLE} style={titleFontSize(title, tuning.titleScale, tuning.titleMax)}>
              {marker ? <span className="mr-1.5 shrink-0">{marker}</span> : null}
              {title}
            </h3>
            {intro ? (
              <p className={COVER_INTRO} style={{ fontSize: `${tuning.introSize}px` }}>
                {intro}
              </p>
            ) : null}
            {meta ? (
              <span className={COVER_META} style={{ fontSize: `${tuning.metaSize}px` }}>
                {meta}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {actions ? (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
