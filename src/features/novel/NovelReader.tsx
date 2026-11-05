/**
 * 小说阅读预览（整本翻页 + 缩放）—— **通用组件**。
 *
 * 导出中心的小说页签直接把它铺在左半边：宽的那块地方本来就是用来「看整本书」的，
 * 不必先看一张缩略图、再点一下弹浮层。任何要读章节的地方（书架、编辑器）也可以复用它，
 * 它只认分页结果（`NovelPage[]`）与版式参数，不读数据库。
 *
 * 两条不变量，保证「预览 = 导出的 PNG」：
 * 1. **行由 `pagination.ts` 算好**，这里只按 `fontSize × lineHeight` 一行一行往下摆，
 *    和 `render-pages.ts` 的 y 累加一模一样；文字 `nowrap`，绝不二次折行。
 * 2. **字号 / 行距 / 页边距 / 字体栈都来自 `layout.ts`**，Canvas 与 CSS 共用同一个字符串。
 *
 * 交互：滚轮不抢（页面在窄条里要能滚），翻页靠按钮与 ← → 键，缩放靠 ± 与双击
 * （双击在「适配整页 / 适配宽度」之间切）。
 */
'use client'

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { ICON_BTN, ROUND_ITEM } from '@/lib/ui-tokens'
import {
  PAGE_SIZES,
  TITLE_LINES,
  type NovelBookMeta,
  type NovelPage,
  type NovelPageFormat,
} from './pagination'
import {
  NOVEL_FONTS,
  titleFontSize,
  titlePageFontSize,
  type NovelLayoutParams,
} from './layout'
import {
  NOVEL_PAGE_INK,
  NOVEL_PAGE_NUMBER_INK,
  NOVEL_READING_PANEL,
  type NovelBackgroundResolution,
} from './background'

const MIN_SCALE = 0.2
const MAX_SCALE = 3
/** 一档缩放的倍率：0.39 起手，三下就回到原大 */
const ZOOM_STEP = 1.4
/** 纸张四周留的空（量可用尺寸时要扣掉） */
const STAGE_PADDING = 24

type ZoomMode = 'fit-page' | 'fit-width' | 'manual'

export interface NovelReaderProps {
  pages: NovelPage[]
  layout: NovelLayoutParams
  format: NovelPageFormat
  /** 背景：`resolveNovelBackground()` 的结果（CSS 部分） */
  background: NovelBackgroundResolution
  meta?: NovelBookMeta
  className?: string
  /** 初始页（0 起） */
  initialPage?: number
}

export function NovelReader({
  pages,
  layout,
  format,
  background,
  meta,
  className = '',
  initialPage = 0,
}: NovelReaderProps) {
  const size = PAGE_SIZES[format]
  const [pageIndex, setPageIndex] = useState(initialPage)
  const [zoom, setZoom] = useState<{ mode: ZoomMode; value: number }>({ mode: 'fit-page', value: 1 })
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const stageRef = useRef<HTMLDivElement | null>(null)

  // 容器尺寸：预览区会随导出中心 / 窗口大小变，拟合倍数必须跟着走
  useLayoutEffect(() => {
    const element = stageRef.current
    if (element === null) return
    const measure = (): void => {
      setStage({ width: element.clientWidth, height: element.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const fitPage = useMemo(() => {
    const width = stage.width - STAGE_PADDING * 2
    const height = stage.height - STAGE_PADDING * 2
    if (width <= 0 || height <= 0) return 0.4
    return clampScale(Math.min(width / size.width, height / size.height), MAX_SCALE)
  }, [stage, size])

  const fitWidth = useMemo(() => {
    const width = stage.width - STAGE_PADDING * 2
    if (width <= 0) return 0.4
    return clampScale(width / size.width, MAX_SCALE)
  }, [stage, size])

  const scale = zoom.mode === 'fit-page' ? fitPage : zoom.mode === 'fit-width' ? fitWidth : zoom.value

  const total = pages.length
  // 换版式后页数会变：越界就地夹住（不改 state，少一轮渲染）
  const index = total === 0 ? 0 : Math.min(Math.max(0, pageIndex), total - 1)
  const page = pages[index]

  const stepZoom = (factor: number): void => {
    setZoom({ mode: 'manual', value: clampScale(scale * factor, MAX_SCALE) })
  }

  const goTo = (next: number): void => {
    if (total === 0) return
    setPageIndex(Math.min(Math.max(0, next), total - 1))
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const handled =
      event.key === 'ArrowLeft' ||
      event.key === 'PageUp' ||
      event.key === 'ArrowRight' ||
      event.key === 'PageDown' ||
      event.key === 'Home' ||
      event.key === 'End' ||
      event.key === '+' ||
      event.key === '=' ||
      event.key === '-'
    if (!handled) return
    event.preventDefault()
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(index - 1)
    else if (event.key === 'ArrowRight' || event.key === 'PageDown') goTo(index + 1)
    else if (event.key === 'Home') goTo(0)
    else if (event.key === 'End') goTo(total - 1)
    else if (event.key === '+' || event.key === '=') stepZoom(ZOOM_STEP)
    else stepZoom(1 / ZOOM_STEP)
  }

  const toggleFit = (): void => {
    setZoom(zoom.mode === 'fit-width' ? { mode: 'fit-page', value: 1 } : { mode: 'fit-width', value: 1 })
  }

  const shownScale = Math.round(scale * 100)

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-label={`分页预览，共 ${total} 页`}
        onKeyDown={onKeyDown}
        onDoubleClick={toggleFit}
        className="relative min-h-0 flex-1 select-none overflow-auto outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oc-line-hover)]"
      >
        <div
          className="flex min-h-full w-max min-w-full"
          style={{ padding: STAGE_PADDING }}
        >
          {page === undefined ? (
            <p className="m-auto text-[12px] text-ink-faint">还没有内容</p>
          ) : (
            <Sheet
              page={page}
              layout={layout}
              size={size}
              scale={scale}
              background={background}
              meta={meta}
            />
          )}
        </div>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-1 border-t border-line px-2 text-[11px] text-ink-faint">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index <= 0}
          aria-label="上一页"
          className={`${ICON_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>
        <span className="min-w-[56px] text-center tabular-nums">
          {total === 0 ? '0 / 0' : `${index + 1} / ${total}`}
        </span>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index >= total - 1}
          aria-label="下一页"
          className={`${ICON_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>

        <span className="ml-auto flex items-center gap-0.5">
          <ZoomChip active={zoom.mode === 'fit-page'} onClick={() => setZoom({ mode: 'fit-page', value: 1 })}>
            整页
          </ZoomChip>
          <ZoomChip active={zoom.mode === 'fit-width'} onClick={() => setZoom({ mode: 'fit-width', value: 1 })}>
            宽度
          </ZoomChip>
          <button type="button" onClick={() => stepZoom(1 / ZOOM_STEP)} aria-label="缩小" className={ICON_BTN}>
            <Minus size={13} strokeWidth={2} />
          </button>
          <span className="w-8 shrink-0 text-center tabular-nums">{shownScale}%</span>
          <button type="button" onClick={() => stepZoom(ZOOM_STEP)} aria-label="放大" className={ICON_BTN}>
            <Plus size={13} strokeWidth={2} />
          </button>
        </span>
      </div>
    </div>
  )
}

function ZoomChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${ROUND_ITEM} h-6 shrink-0 px-1.5 text-[11px] transition-colors ${
        active ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function clampScale(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_SCALE
  return Math.min(max, Math.max(MIN_SCALE, value))
}

/** 阅读底板的内缩：与 `render-pages.ts` 的 `paintBackground` 同一组数字 */
function readingInset(margin: number): { x: number; y: number } {
  return { x: Math.min(margin * 0.55, 32), y: Math.min(margin * 0.45, 26) }
}

function Sheet({
  page,
  layout,
  size,
  scale,
  background,
  meta,
}: {
  page: NovelPage
  layout: NovelLayoutParams
  size: { width: number; height: number }
  scale: number
  background: NovelBackgroundResolution
  meta?: NovelBookMeta
}) {
  const linePx = layout.fontSize * layout.lineHeight
  const inset = readingInset(layout.margin)
  const titleAlign = layout.titleStyle === 'center' ? 'center' : 'left'

  return (
    <div
      className={`relative m-auto shrink-0 overflow-hidden border border-line ${ROUND_ITEM}`}
      style={{
        width: size.width * scale,
        height: size.height * scale,
        background: background.cssBackground,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size.width,
          height: size.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          fontFamily: NOVEL_FONTS[layout.font].stack,
          fontSize: layout.fontSize,
          color: NOVEL_PAGE_INK,
        }}
      >
        {/* 自定义背景图可能很花：正文区垫一层纸色底板，与 PNG 导出同一份色值 */}
        {background.imageSrc ? (
          <div
            style={{
              position: 'absolute',
              left: inset.x,
              right: inset.x,
              top: inset.y,
              bottom: inset.y,
              background: NOVEL_READING_PANEL,
            }}
          />
        ) : null}

        {page.titlePage ? (
          <TitlePageContent page={page} layout={layout} size={size} meta={meta} />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: layout.margin,
              boxSizing: 'border-box',
            }}
          >
            {page.rows.map((row, position) => {
              if (row.kind === 'gap') {
                return <div key={position} style={{ height: linePx }} />
              }
              if (row.kind === 'title') {
                return (
                  <div
                    key={position}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: layout.titleStyle === 'center' ? 'center' : 'flex-start',
                      height: linePx * TITLE_LINES,
                      fontSize: titleFontSize(layout),
                      fontWeight: 600,
                      lineHeight: `${linePx}px`,
                      textAlign: titleAlign,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    {row.text}
                  </div>
                )
              }
              return (
                <div
                  key={position}
                  style={{
                    height: linePx,
                    lineHeight: `${linePx}px`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {row.text.length > 0 ? row.text : '\u00A0'}
                </div>
              )
            })}
          </div>
        )}

        {!page.titlePage && layout.pageNumber !== 'none' ? (
          <div
            style={{
              position: 'absolute',
              left: layout.margin,
              right: layout.margin,
              bottom: Math.max(0, layout.margin * 0.55 - layout.fontSize * 0.35),
              textAlign: layout.pageNumber === 'center' ? 'center' : 'right',
              fontSize: Math.round(layout.fontSize * 0.7),
              lineHeight: 1,
              color: NOVEL_PAGE_NUMBER_INK,
            }}
          >
            {page.index}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 扉页：书名 / 作者 / 简介，位置与 Canvas 版同一组比例 */
function TitlePageContent({
  page,
  layout,
  size,
  meta,
}: {
  page: NovelPage
  layout: NovelLayoutParams
  size: { width: number; height: number }
  meta?: NovelBookMeta
}) {
  const sizes = titlePageFontSize(layout)
  const title = (meta?.title ?? page.chapterTitle ?? '').trim() || '未命名'
  const author = (meta?.author ?? '').trim()
  const synopsis = (meta?.synopsis ?? '').trim()

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: layout.margin,
          right: layout.margin,
          top: size.height * 0.3,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: sizes.title, fontWeight: 600, lineHeight: 1.4 }}>{title}</div>
        {author ? (
          <div style={{ marginTop: sizes.title * 0.5, fontSize: sizes.author, color: NOVEL_PAGE_NUMBER_INK }}>
            {author}
          </div>
        ) : null}
      </div>
      {synopsis ? (
        <div
          style={{
            position: 'absolute',
            left: layout.margin + 16,
            right: layout.margin + 16,
            top: size.height * 0.56,
            textAlign: 'center',
            fontSize: sizes.synopsis,
            lineHeight: 1.9,
            color: NOVEL_PAGE_NUMBER_INK,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            maxHeight: size.height * 0.34,
          }}
        >
          {synopsis}
        </div>
      ) : null}
    </>
  )
}
