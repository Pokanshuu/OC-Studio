'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileText, ImagePlus, Loader2, X } from 'lucide-react'
import type { Novel, NovelExportOptions, NovelPageFormat } from './types'
import { novelBackgroundDataUrl } from './background'
import {
  downloadNovelPage,
  novelPageFileLabel,
  pagePixelLabel,
  renderNovelPages,
  type NovelPageImage,
} from './render'
import { downloadNovelDocx } from './docx'

interface NovelExportDialogProps {
  open: boolean
  novel: Novel
  onClose: () => void
}

const FORMATS: Array<{ value: NovelPageFormat; label: string }> = [
  { value: '9:16', label: '9:16 竖屏' },
  { value: '16:9', label: '16:9 横屏' },
  { value: 'A4', label: 'A4 文档' },
]

export function NovelExportDialog({ open, novel, onClose }: NovelExportDialogProps) {
  const [format, setFormat] = useState<NovelPageFormat>('9:16')
  const [scale, setScale] = useState(1)
  const [backgroundUrl, setBackgroundUrl] = useState('')
  const [pages, setPages] = useState<NovelPageImage[]>([])
  const [generating, setGenerating] = useState(false)
  const [exportingDocx, setExportingDocx] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setPages([])
    setError('')
  }, [open, format, scale, backgroundUrl])

  if (!open) return null

  const generate = async (): Promise<void> => {
    setGenerating(true)
    setError('')
    try {
      const options: NovelExportOptions = { format, scale, backgroundUrl: backgroundUrl || undefined }
      const rendered = await renderNovelPages(novel, options)
      setPages(rendered)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成预览失败')
    } finally {
      setGenerating(false)
    }
  }

  const uploadBackground = (file: File | undefined): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setBackgroundUrl(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  const exportAll = async (): Promise<void> => {
    let source = pages
    if (source.length === 0) {
      setGenerating(true)
      setError('')
      try {
        source = await renderNovelPages(novel, {
          format,
          scale,
          backgroundUrl: backgroundUrl || undefined,
        })
        setPages(source)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '生成页面失败')
        return
      } finally {
        setGenerating(false)
      }
    }
    source.forEach((page, index) => {
      window.setTimeout(() => {
        downloadNovelPage(
          page,
          `${novel.title || '小说'}-${format.replace(':', 'x')}-${novelPageFileLabel(page)}.png`,
        )
      }, index * 220)
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-[1000px] max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h3 className="font-serif text-lg text-ink">预览与导出</h3>
            <p className="mt-0.5 text-[11px] text-ink-faint">{novel.title}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/5"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-5 overflow-y-auto border-b border-line p-5 md:border-b-0 md:border-r">
            <section>
              <p className="mb-2 text-xs font-medium text-ink-muted">页面尺寸</p>
              <div className="grid grid-cols-3 gap-1.5">
                {FORMATS.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setFormat(item.value)}
                    className={`rounded-lg border px-2 py-2 text-[11px] transition-colors ${
                      format === item.value
                        ? 'border-ink/40 bg-black/5 text-ink dark:bg-white/10'
                        : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-ink-faint">
                导出像素：{pagePixelLabel(format, scale)}
              </p>
            </section>

            <section>
              <p className="mb-2 text-xs font-medium text-ink-muted">清晰度 / 图片大小</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[1, 1.5, 2].map((item) => (
                  <button
                    key={item}
                    onClick={() => setScale(item)}
                    className={`rounded-lg border px-2 py-2 text-[11px] transition-colors ${
                      scale === item
                        ? 'border-ink/40 bg-black/5 text-ink dark:bg-white/10'
                        : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                    }`}
                  >
                    {item === 1 ? '标清' : item === 1.5 ? '高清' : '超清'}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-xs font-medium text-ink-muted">页背景</p>
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setBackgroundUrl('')}
                  className={`overflow-hidden rounded-lg border-2 ${
                    backgroundUrl ? 'border-line' : 'border-ink/40'
                  }`}
                  title="默认羊皮纸花纹背景"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={novelBackgroundDataUrl(150, 240)}
                    alt="默认背景"
                    className="h-[120px] w-[75px] object-cover"
                  />
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line text-[11px] text-ink-muted hover:border-line-hover hover:text-ink"
                  >
                    <ImagePlus size={13} strokeWidth={2} />
                    上传背景图
                  </button>
                  {backgroundUrl ? (
                    <div className="relative overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={backgroundUrl} alt="自定义背景" className="h-[72px] w-full object-cover" />
                      <button
                        onClick={() => setBackgroundUrl('')}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/45 text-white"
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] leading-4 text-ink-faint">
                      默认使用原创简化羊皮纸花纹边框，文字区域会自动加深以保证可读性。
                    </p>
                  )}
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => uploadBackground(event.target.files?.[0])}
              />
            </section>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => void generate()}
                disabled={generating}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-sm text-paper hover:opacity-90 disabled:opacity-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : null}
                {generating ? '正在生成…' : '生成预览'}
              </button>
              <button
                onClick={() => void exportAll()}
                disabled={generating}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
              >
                <Download size={14} strokeWidth={2} />
                导出全部图片页
              </button>
              <button
                onClick={async () => {
                  setExportingDocx(true)
                  setError('')
                  try {
                    await downloadNovelDocx(novel)
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : '导出 Word 失败')
                  } finally {
                    setExportingDocx(false)
                  }
                }}
                disabled={exportingDocx || generating}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
              >
                {exportingDocx ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} strokeWidth={2} />}
                导出 Word (.docx)
              </button>
            </div>
            {error ? <p className="text-[11px] text-error">{error}</p> : null}
          </div>

          <div className="min-h-0 overflow-y-auto bg-black/[0.03] p-5 dark:bg-white/[0.02]">
            {pages.length === 0 ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-center">
                <p className="font-serif text-base text-ink-muted">还没有生成页面</p>
                <p className="max-w-[280px] text-[11px] leading-5 text-ink-faint">
                  选择尺寸、清晰度和背景后点击“生成预览”。导出的每一页都是独立 PNG。
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pages.map((page, index) => (
                  <div key={index} className="group">
                    <button
                      onClick={() =>
                        downloadNovelPage(
                          page,
                          `${novel.title || '小说'}-${format.replace(':', 'x')}-${novelPageFileLabel(page)}.png`,
                        )
                      }
                      className="block w-full overflow-hidden rounded-lg border border-line bg-paper shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                      title="点击下载这一页"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={page.dataUrl}
                        alt={`第 ${index + 1} 页`}
                        className="h-auto w-full object-contain"
                      />
                    </button>
                    <p className="mt-1.5 truncate text-center text-[10px] text-ink-faint">
                      {page.isCover ? '封面' : `第 ${page.pageNumber} 页`} · {page.title}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
