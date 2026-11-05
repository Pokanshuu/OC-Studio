/**
 * 分页预览浮层（W2 的「预览」）。
 *
 * 只读：不改数据、不改版式，只是把当前章节树按 9:16 / 16:9 / A4 排成页。
 * 浮层 Portal 到 `#overlay-root`（项目约束 6）；`#overlay-root` 本身不接事件，
 * 所以**根节点必须显式 `pointer-events-auto`**，否则 X / 尺寸切换 / 滚动全部穿透。
 */
'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { BTN_QUIET, ICON_BTN_MD, PAGE_TITLE, PANEL, ROUND_CONTROL } from '@/lib/ui-tokens'
import type { NovelExportChapter } from './export'
import { PAGE_MARGIN, PAGE_SIZES, paginateNovel, type NovelPageFormat } from './pagination'
import {
  NOVEL_BACKGROUND_PRESETS,
  NOVEL_PAGE_INK,
  NOVEL_PAGE_NUMBER_INK,
  NOVEL_READING_PANEL,
  resolveNovelBackground,
  type NovelBackgroundKind,
  type NovelBackgroundResolution,
} from './background'

const FORMATS: NovelPageFormat[] = ['9:16', '16:9', 'A4']

/** 预览背景：`resolveNovelBackground` 的结果，或它需要的 kind + 自定义图 */
export type NovelPreviewBackground =
  | NovelBackgroundKind
  | { kind: NovelBackgroundKind; image?: string }
  | NovelBackgroundResolution

function normalizeBackground(background?: NovelPreviewBackground): NovelBackgroundResolution {
  if (!background) return resolveNovelBackground('paper')
  if (typeof background === 'string') return resolveNovelBackground(background)
  if ('cssBackground' in background) return background
  return resolveNovelBackground(background.kind, background.image)
}

/** 传入的是预设名时，让工具栏的选中态对得上；传整份解析结果就不猜 */
function presetOf(background?: NovelPreviewBackground): NovelBackgroundKind | null {
  if (!background) return 'paper'
  if (typeof background === 'string') return background
  return 'kind' in background ? background.kind : null
}

export function NovelPreview({
  title,
  chapters,
  background,
  onClose,
}: {
  title: string
  chapters: NovelExportChapter[]
  /** 可选：默认纸白；不传时预览内也能切换三种预设 */
  background?: NovelPreviewBackground
  onClose: () => void
}) {
  const [format, setFormat] = useState<NovelPageFormat>('9:16')
  const [overrideKind, setOverrideKind] = useState<NovelBackgroundKind | null>(null)
  const [mounted, setMounted] = useState(false)
  const [scale, setScale] = useState(0.8)
  const stageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pages = useMemo(() => paginateNovel(chapters, format), [chapters, format])
  const size = PAGE_SIZES[format]
  const resolvedBackground = useMemo(
    () => (overrideKind ? resolveNovelBackground(overrideKind) : normalizeBackground(background)),
    [overrideKind, background],
  )
  const activeBackgroundKind = overrideKind ?? presetOf(background)

  // 按可用宽度算缩放：固定 0.55 在手机上会横向溢出、在桌面上又小得读不清
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const fit = () => {
      const available = stage.clientWidth - 48
      if (available <= 0) return
      setScale(Math.max(0.4, Math.min(1, available / size.width)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [size.width, mounted])

  if (!mounted) return null

  const root = document.getElementById('overlay-root') ?? document.body

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-[var(--oc-scrim)]"
      role="dialog"
      aria-modal="true"
      aria-label="分页预览"
      onClick={onClose}
    >
      <div
        className={`mx-auto my-6 flex min-h-0 w-[min(1100px,92vw)] flex-1 flex-col overflow-hidden ${PANEL}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
          <span className={PAGE_TITLE}>{title}</span>
          <span className="text-xs text-ink-faint">{pages.length} 页</span>
          <div className="ml-auto flex items-center gap-1">
            {FORMATS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={format === item}
                onClick={() => setFormat(item)}
                className={`${BTN_QUIET} ${ROUND_CONTROL} ${format === item ? 'text-ink' : 'text-ink-muted'}`}
              >
                {PAGE_SIZES[item].label}
              </button>
            ))}
            <button type="button" onClick={onClose} className={ICON_BTN_MD} aria-label="关闭">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-4">
          <span className="mr-1 text-[12px] text-ink-faint">背景</span>
          {NOVEL_BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              aria-pressed={activeBackgroundKind === preset.value}
              onClick={() => setOverrideKind(preset.value)}
              className={`${BTN_QUIET} ${ROUND_CONTROL} ${
                activeBackgroundKind === preset.value ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div ref={stageRef} className="min-h-0 flex-1 overflow-y-auto bg-paper-alt px-6 py-6">
          <div className="mx-auto flex w-fit flex-col items-center gap-6">
            {pages.length === 0 ? (
              <p className="text-sm text-ink-muted">还没有内容</p>
            ) : (
              pages.map((page) => (
                <div
                  key={`${page.index}-${page.chapterTitle}`}
                  className={`relative shrink-0 overflow-hidden border border-line ${ROUND_CONTROL}`}
                  style={{
                    width: size.width * scale,
                    height: size.height * scale,
                    background: resolvedBackground.cssBackground,
                  }}
                >
                  <div
                    style={{
                      width: size.width,
                      height: size.height,
                      padding: PAGE_MARGIN,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      fontSize: 16,
                      lineHeight: 1.9,
                      fontFamily: "'Noto Serif SC', serif",
                      // 纸张永远是浅色 → 正文固定深墨，不跟界面主题反转（否则暗色主题下白字白纸）
                      color: NOVEL_PAGE_INK,
                    }}
                  >
                    {/* 自定义背景图可能很花：正文垫一层纸色底板，与 PNG 导出同一份色值 */}
                    <div
                      className={resolvedBackground.imageSrc ? 'h-full' : undefined}
                      style={
                        resolvedBackground.imageSrc
                          ? { background: NOVEL_READING_PANEL }
                          : undefined
                      }
                    >
                      {page.startsChapter ? (
                        <div className="mb-6 text-center text-[22px] font-bold">{page.chapterTitle}</div>
                      ) : null}
                      {page.lines.map((line, index) => (
                        <div key={index} className="whitespace-pre-wrap">
                          {line.length > 0 ? line : '\u00A0'}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* 页码放在缩放层外：跟着纸张一起缩会小到看不见 */}
                  <div
                    className="absolute bottom-2 right-3 text-[11px] tabular-nums"
                    style={{ color: NOVEL_PAGE_NUMBER_INK }}
                  >
                    {page.index}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    root,
  )
}
