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

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DragHandle, useSortableItem } from '@/components/shared/list-dnd'
import { useLongPress } from '@/lib/useLongPress'
import { useCoverTuning } from '@/lib/cover'
import {
  COVER_FRAME,
  COVER_INTRO,
  COVER_INTRO_MONO,
  COVER_SUBTITLE,
  COVER_SUBTITLE_MONO,
  COVER_TEXT,
  COVER_TITLE,
  COVER_TITLE_MONO,
  DRAG_SLOT_CARD,
} from '@/lib/ui-tokens'
import { useSettings } from '@/lib/settings'
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
  /**
   * 卡片比例（宽 / 高）覆盖。
   * 默认用调试面板的全局值（实体卡 7:6）；小说封面是 2:3 的竖槽位，单独传。
   */
  aspect?: number
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
  aspect,
}: CoverCardProps) {
  const { setNodeRef, style, attributes, listeners, longPress: longPressSort, cardAttributes, cardListeners } =
    useSortableItem(id, !sortable)
  // 长按拖动和「长按动作表」抢同一个手势：排序模式下让拖动赢
  const longPress = useLongPress({
    onLongPress: onLongPress ?? (() => {}),
    enabled: isMobile && !longPressSort,
  })
  const tuning = useCoverTuning()
  // 黑白模式下块色跟主题走（亮 = 纸色、暗 = 墨色），文字也得跟着翻
  const mono = useSettings().settings.coverTintMode === 'mono'

  /*
   * 规范：**模糊从标题开始，混色从小字开始**。
   * 这两处不能写死成「卡片高度的百分之几」—— 标题的字号跟字数、有没有小字都会变。
   * 所以量一次真实位置：标题顶边 / 小字顶边（没有小字就取标题底边），换算成卡片高度比。
   */
  const frameRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const subtitleRef = useRef<HTMLSpanElement | null>(null)
  const [anchors, setAnchors] = useState<{ blurStart: number; mixStart: number } | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = (): void => {
      const rect = frame.getBoundingClientRect()
      const titleRect = titleRef.current?.getBoundingClientRect()
      if (rect.height <= 0 || !titleRect) return
      const subtitleRect = subtitleRef.current?.getBoundingClientRect()
      const ratio = (y: number): number => Math.min(1, Math.max(0, (y - rect.top) / rect.height))
      const next = {
        blurStart: ratio(titleRect.top),
        mixStart: ratio(subtitleRect?.top ?? titleRect.bottom),
      }
      setAnchors((prev) =>
        prev && Math.abs(prev.blurStart - next.blurStart) < 0.001 && Math.abs(prev.mixStart - next.mixStart) < 0.001
          ? prev
          : next,
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [title, meta, intro, tuning, aspect])

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
          ref={frameRef}
          className={COVER_FRAME}
          style={{ containerType: 'inline-size', aspectRatio: String(aspect ?? tuning.aspect) }}
        >
          <CoverArt
            src={imageSrc}
            tintSrc={tintSrc}
            aspect={aspect}
            blurStart={anchors?.blurStart}
            mixStart={anchors?.mixStart}
            watermark={Array.from(title)[0] ?? ''}
          />
          {/*
            文字块：
            - 有头像 / 国徽时**左右布局**——圆像在左，标题在上、小字在下（角色、国家靠这块认人）
            - 没有头像就不占位，标题直接顶到左边
            - 没有简介 / 小字就不渲染，不预留空行（宁可标题低一点，也不要空一块）
          */}
          <div
            className={COVER_TEXT}
            style={{
              bottom: `${tuning.textBottom}%`,
              left: `${tuning.textLeft}%`,
              right: `${tuning.textRight}%`,
            }}
          >
            {/* 头像与「标题 + 小字」按**视觉居中**对齐：不贴顶（items-center），
                这样两行标题时头像也不会孤零零挂在上面 */}
            <div className="flex items-center gap-2.5">
              {emblem ? <div className="flex h-10 w-10 shrink-0 items-center justify-center">{emblem}</div> : null}
              <div className="min-w-0 flex-1">
                <h3
                  ref={titleRef}
                  className={mono ? COVER_TITLE_MONO : COVER_TITLE}
                  style={titleFontSize(title, tuning.titleScale, tuning.titleMax)}
                >
                  {marker ? <span className="mr-1.5 shrink-0">{marker}</span> : null}
                  {title}
                </h3>
                {meta ? (
                  <span
                    ref={subtitleRef}
                    className={mono ? COVER_SUBTITLE_MONO : COVER_SUBTITLE}
                    style={{ fontSize: `${tuning.metaSize}px` }}
                  >
                    {meta}
                  </span>
                ) : null}
              </div>
            </div>
            {intro ? (
              <p className={mono ? COVER_INTRO_MONO : COVER_INTRO} style={{ fontSize: `${tuning.introSize}px` }}>
                {intro}
              </p>
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
