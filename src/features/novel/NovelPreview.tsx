/**
 * 分页预览浮层（W2 的「预览」）。
 *
 * 只读：不改数据、不改版式，只是把当前章节树按 9:16 / 16:9 / A4 排成页。
 * 浮层 Portal 到 `#overlay-root`（项目约束 6）。
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { BTN_QUIET, ICON_BTN, MENU, ROUND_CONTROL, SECTION_TITLE } from '@/lib/ui-tokens'
import type { NovelExportChapter } from './export'
import { PAGE_MARGIN, PAGE_SIZES, paginateNovel, type NovelPageFormat } from './pagination'

const FORMATS: NovelPageFormat[] = ['9:16', '16:9', 'A4']

export function NovelPreview({
  title,
  chapters,
  onClose,
}: {
  title: string
  chapters: NovelExportChapter[]
  onClose: () => void
}) {
  const [format, setFormat] = useState<NovelPageFormat>('9:16')
  const [mounted, setMounted] = useState(false)

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
  if (!mounted) return null

  const root = document.getElementById('overlay-root') ?? document.body
  const scale = 0.55

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--oc-scrim)]"
      role="dialog"
      aria-modal="true"
      aria-label="分页预览"
      onClick={onClose}
    >
      <div
        className={`mx-auto mt-6 flex min-h-0 w-[min(1100px,92vw)] flex-1 flex-col overflow-hidden bg-paper ${MENU}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-2">
          <span className={SECTION_TITLE}>{title}</span>
          <span className="text-xs text-ink-faint">{pages.length} 页</span>
          <div className="ml-auto flex items-center gap-1">
            {FORMATS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFormat(item)}
                className={`${BTN_QUIET} ${ROUND_CONTROL} ${format === item ? 'text-ink' : 'text-ink-muted'}`}
              >
                {PAGE_SIZES[item].label}
              </button>
            ))}
            <button type="button" onClick={onClose} className={ICON_BTN} aria-label="关闭">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-paper-alt px-6 py-6">
          <div className="mx-auto flex w-fit flex-col items-center gap-6">
            {pages.length === 0 ? (
              <p className="text-sm text-ink-muted">还没有内容</p>
            ) : (
              pages.map((page) => (
                <div
                  key={`${page.index}-${page.chapterTitle}`}
                  className={`relative shrink-0 overflow-hidden border border-line bg-paper ${ROUND_CONTROL}`}
                  style={{
                    width: size.width * scale,
                    height: size.height * scale,
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
                    }}
                    className="text-ink"
                  >
                    {page.startsChapter ? (
                      <div className="mb-6 text-center text-[22px] font-bold">{page.chapterTitle}</div>
                    ) : null}
                    {page.lines.map((line, index) => (
                      <div key={index} className="whitespace-pre-wrap">
                        {line.length > 0 ? line : '\u00A0'}
                      </div>
                    ))}
                    <div className="absolute bottom-4 right-6 text-[12px] text-ink-faint">
                      {page.index}
                    </div>
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
