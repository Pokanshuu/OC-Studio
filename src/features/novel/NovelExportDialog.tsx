/**
 * 小说导出对话框（N2）。
 *
 * 一个入口出四种格式：PNG（按分页逐页打包 ZIP）/ Word / Markdown / TXT。
 * 页面尺寸、清晰度、背景只在 PNG 下出现 —— 其余格式不经过 Canvas，摆出来只会
 * 让人以为它们也生效。
 *
 * 浮层 Portal 到 `#overlay-root`；该容器 `pointer-events: none`，所以根节点
 * 必须显式 `pointer-events-auto`，否则整层点不动。
 *
 * 后续接线（`NovelTree`）只需要四个 props：
 * `open` / `book`（书级元信息）/ `entries`（章节条目，不含根）/ `onClose`。
 */
'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, ImagePlus, Loader2, X } from 'lucide-react'
import type { WorldEntry } from '@/types'
import {
  BTN_PRIMARY,
  ICON_BTN_MD,
  PAGE_TITLE,
  PANEL,
  ROUND_CONTROL,
  ROUND_ITEM,
} from '@/lib/ui-tokens'
import { createZip, downloadBlob } from '@/lib/zip'
import { flattenNovel, toMarkdown, toTxt } from './export'
import type { NovelPageFormat } from './pagination'
import { PAGE_SIZES } from './pagination'
import {
  NOVEL_BACKGROUND_PRESETS,
  resolveNovelBackground,
  type NovelBackgroundKind,
} from './background'
import { canvasToPngBytes, renderNovelPages } from './render-pages'
import { buildNovelDocx } from './docx'
import { novelPageDoc } from './preview-doc'
import { PagePreview } from '@/components/shared/document/PagePreview'

export interface NovelExportBook {
  title: string
  author?: string
  synopsis?: string
  /** 封面：库内相对路径或 data URL（Word 里作为首图） */
  cover?: string
}

export interface NovelExportDialogProps {
  open: boolean
  book: NovelExportBook
  /** 这本书的章节条目（**不含**小说根节点），顺序由内部按 parentId 排 */
  entries: WorldEntry[]
  onClose: () => void
}

type ExportFormat = 'png' | 'docx' | 'markdown' | 'txt'
type BusyState = ExportFormat | null

const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'docx', label: 'Word' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'txt', label: 'TXT' },
]

const PAGE_FORMATS: NovelPageFormat[] = ['9:16', '16:9', 'A4']

const RESOLUTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '标清' },
  { value: 1.5, label: '高清' },
  { value: 2, label: '超清' },
]

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n\t]/g, '-').trim() || '未命名'
}

function OptionButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`touch-feedback flex h-8 items-center justify-center px-2 text-[13px] transition-colors disabled:opacity-50 ${ROUND_CONTROL} ${
        selected ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function NovelExportDialog({ open, book, entries, onClose }: NovelExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [pageFormat, setPageFormat] = useState<NovelPageFormat>('9:16')
  const [scale, setScale] = useState(1)
  const [backgroundKind, setBackgroundKind] = useState<NovelBackgroundKind>('paper')
  const [backgroundImage, setBackgroundImage] = useState('')
  const [busy, setBusy] = useState<BusyState>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const plainChapters = useMemo(() => flattenNovel(entries), [entries])
  // 预览与 Word 用的是同一批章节（PNG 走画布另渲染）
  const previewDoc = useMemo(() => novelPageDoc(book, plainChapters), [book, plainChapters])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busy === null) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open || typeof document === 'undefined') return null

  const root = document.getElementById('overlay-root') ?? document.body
  const title = safeFileName(book.title)
  const disabled = busy !== null
  const progressLabel =
    busy === 'png' && progress ? `正在导出 ${progress.done}/${progress.total}` : '正在导出…'

  const handleBackgroundFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setBackgroundImage(String(reader.result ?? ''))
      setBackgroundKind('custom')
      setError(null)
    }
    reader.onerror = () => setError('读不到这张图片')
    reader.readAsDataURL(file)
  }

  const exportPng = async (): Promise<void> => {
    if (plainChapters.length === 0) {
      setError('没有可导出的章节')
      return
    }
    const canvases = await renderNovelPages(plainChapters, {
      format: pageFormat,
      scale,
      background: { kind: backgroundKind, image: backgroundImage || undefined },
      onProgress: (done, total) => setProgress({ done, total }),
    })
    if (canvases.length === 0) {
      setError('没有可导出的章节')
      return
    }
    const files: Array<{ name: string; data: Uint8Array }> = []
    for (const [index, canvas] of canvases.entries()) {
      files.push({
        name: `${String(index + 1).padStart(2, '0')}.png`,
        data: await canvasToPngBytes(canvas),
      })
    }
    downloadBlob(createZip(files), `${title}-${pageFormat.replace(':', 'x')}.zip`)
  }

  const exportWord = async (): Promise<void> => {
    const blob = await buildNovelDocx(plainChapters, {
      title: book.title,
      author: book.author,
      synopsis: book.synopsis,
      coverSrc: book.cover,
    })
    downloadBlob(blob, `${title}.docx`)
  }

  const exportMarkdown = (): void => {
    const markdownChapters = flattenNovel(entries, { markdown: true })
    const content = toMarkdown(markdownChapters, { title: book.title })
    downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${title}.md`)
  }

  const exportTxt = (): void => {
    const content = toTxt(plainChapters, { title: book.title })
    downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${title}.txt`)
  }

  const handleExport = async (): Promise<void> => {
    if (busy !== null) return
    setError(null)
    setProgress(null)
    setBusy(format)
    // 让按钮先切到「导出中」，再开始读图 / 画布这类耗时工作
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    try {
      if (format === 'png') await exportPng()
      else if (format === 'docx') await exportWord()
      else if (format === 'markdown') exportMarkdown()
      else exportTxt()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const backgroundOptions: Array<{ value: NovelBackgroundKind; label: string }> = [
    ...NOVEL_BACKGROUND_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
    { value: 'custom', label: '自定义' },
  ]

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="导出"
      onClick={(event) => {
        if (event.target === event.currentTarget && !disabled) onClose()
      }}
    >
      <div
        className={`flex w-[min(720px,100%)] flex-col overflow-hidden ${PANEL}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
          <h2 className={PAGE_TITLE}>导出</h2>
          <button
            type="button"
            className={ICON_BTN_MD}
            onClick={() => {
              if (!disabled) onClose()
            }}
            disabled={disabled}
            aria-label="关闭"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">
          <section>
            <p className="mb-2 text-sm font-medium text-ink">格式</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {FORMAT_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  selected={format === option.value}
                  disabled={disabled}
                  onClick={() => setFormat(option.value)}
                >
                  {option.label}
                </OptionButton>
              ))}
            </div>
          </section>

          {format !== 'png' ? (
            <section>
              <p className="mb-2 text-sm font-medium text-ink">预览</p>
              <div
                className={`h-[38vh] max-h-[420px] min-h-[220px] overflow-hidden border border-line bg-paper-alt ${ROUND_CONTROL}`}
              >
                <PagePreview doc={previewDoc} emptyHint="没有可导出的章节" />
              </div>
            </section>
          ) : null}

          {format === 'png' ? (
            <>
              <section>
                <p className="mb-2 text-sm font-medium text-ink">页面尺寸</p>
                <div className="grid grid-cols-3 gap-1">
                  {PAGE_FORMATS.map((value) => (
                    <OptionButton
                      key={value}
                      selected={pageFormat === value}
                      disabled={disabled}
                      onClick={() => setPageFormat(value)}
                    >
                      {PAGE_SIZES[value].label}
                    </OptionButton>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 text-sm font-medium text-ink">清晰度</p>
                <div className="grid grid-cols-3 gap-1">
                  {RESOLUTIONS.map((option) => (
                    <OptionButton
                      key={option.value}
                      selected={scale === option.value}
                      disabled={disabled}
                      onClick={() => setScale(option.value)}
                    >
                      {option.label}
                    </OptionButton>
                  ))}
                </div>
              </section>

              <section>
                <p className="mb-2 text-sm font-medium text-ink">背景</p>
                <div className="grid grid-cols-4 gap-1">
                  {backgroundOptions.map((option) => {
                    const selected = backgroundKind === option.value
                    const custom = option.value === 'custom'
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => {
                          if (custom) {
                            setBackgroundKind('custom')
                            fileRef.current?.click()
                            return
                          }
                          setBackgroundKind(option.value)
                        }}
                        className={`flex min-w-0 flex-col items-center gap-1.5 py-1.5 transition-colors disabled:opacity-50 ${ROUND_ITEM} ${
                          selected ? 'text-ink' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span
                          className={`flex h-12 w-full items-center justify-center overflow-hidden border ${ROUND_ITEM} ${
                            selected ? 'border-ink' : 'border-line'
                          }`}
                          style={
                            custom
                              ? backgroundImage
                                ? {
                                    backgroundImage: `url("${backgroundImage}")`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                  }
                                : undefined
                              : { background: resolveNovelBackground(option.value).cssBackground }
                          }
                        >
                          {custom && !backgroundImage ? (
                            <ImagePlus size={15} strokeWidth={2} className="text-ink-faint" />
                          ) : null}
                        </span>
                        <span className="truncate text-[12px]">{option.label}</span>
                      </button>
                    )
                  })}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBackgroundFile}
                />
              </section>
            </>
          ) : null}

          {error ? <p className="text-xs text-error">{error}</p> : null}
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-center border-t border-line px-4">
          <button
            type="button"
            className={`${BTN_PRIMARY} justify-center px-6`}
            disabled={disabled}
            onClick={() => void handleExport()}
          >
            {disabled ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <Download size={14} strokeWidth={2} />
            )}
            {disabled ? progressLabel : '导出'}
          </button>
        </footer>
      </div>
    </div>,
    root,
  )
}
