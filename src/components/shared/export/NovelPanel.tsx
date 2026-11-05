'use client'

/**
 * 导出中心 · 小说页签。
 *
 * 和「文档」页签不是一回事：小说是**按章节出成品**——PNG 逐页打包成 zip、Word / Markdown / TXT，
 * 页面尺寸 / 清晰度 / 背景只对 PNG 生效。所以它单独一个页签，而不是塞进文档里。
 *
 * 数据按 `novelId` 自己读（根笔记 + 它的子孙章节），调用方只要 `openExport({ tab: 'novel', novelId })`，
 * 不用把书和章节递进来。
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { BookOpen, Download, ImagePlus, Loader2 } from 'lucide-react'
import type { WorldEntry } from '@/types'
import { db } from '@/lib/db'
import { createZip, downloadBlob } from '@/lib/zip'
import { flattenNovel, toMarkdown, toTxt } from '@/features/novel/export'
import { PAGE_SIZES, type NovelPageFormat } from '@/features/novel/pagination'
import { NOVEL_BACKGROUND_PRESETS, resolveNovelBackground, type NovelBackgroundKind } from '@/features/novel/background'
import { canvasToPngBytes, renderNovelPages } from '@/features/novel/render-pages'
import { buildNovelDocx } from '@/features/novel/docx'
import { novelPageDoc } from '@/features/novel/preview-doc'
import { PagePreview } from '@/components/shared/document/PagePreview'
import { NovelPreview } from '@/features/novel/NovelPreview'
import { BTN_PRIMARY, ROUND_CONTROL, ROUND_ITEM } from '@/lib/ui-tokens'
import { ExportRow, ExportSection, Segmented } from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

type ExportFormat = 'png' | 'docx' | 'markdown' | 'txt'

const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: 'png', label: 'PNG' },
  { value: 'docx', label: 'Word' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'txt', label: 'TXT' },
] as const

const PAGE_FORMATS: NovelPageFormat[] = ['9:16', '16:9', 'A4']

const RESOLUTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '标清' },
  { value: 1.5, label: '高清' },
  { value: 2, label: '超清' },
] as const

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n\t]/g, '-').trim() || '未命名'
}

/** 从根笔记往下收集它自己的子孙（库里可能有好几本书，别把别人的章节带上） */
function collectChapters(rows: WorldEntry[], rootId: number): WorldEntry[] {
  const children = new Map<number, WorldEntry[]>()
  for (const row of rows) {
    if (row.parentId === null || row.id === rootId) continue
    const list = children.get(row.parentId) ?? []
    list.push(row)
    children.set(row.parentId, list)
  }
  const out: WorldEntry[] = []
  const walk = (id: number): void => {
    for (const child of children.get(id) ?? []) {
      out.push(child)
      walk(child.id)
    }
  }
  walk(rootId)
  return out
}

export function NovelPanel({ novelId }: { novelId?: number }) {
  const [root, setRoot] = useState<WorldEntry | null>(null)
  const [chapters, setChapters] = useState<WorldEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const [format, setFormat] = useState<ExportFormat>('png')
  const [pageFormat, setPageFormat] = useState<NovelPageFormat>('9:16')
  const [scale, setScale] = useState(1)
  const [backgroundKind, setBackgroundKind] = useState<NovelBackgroundKind>('paper')
  const [backgroundImage, setBackgroundImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pagePreview, setPagePreview] = useState<string | null>(null)
  const [pageRendering, setPageRendering] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [readerOpen, setReaderOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const rows = await db.worldEntries.filter((entry) => !entry.deleted).toArray()
        const target =
          novelId !== undefined
            ? rows.find((entry) => entry.id === novelId)
            : rows.filter((entry) => entry.parentId === null && (entry.novelAuthor !== undefined || entry.category === '小说')).sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (!alive) return
        if (!target) {
          setError('没有可导出的小说')
          setLoaded(true)
          return
        }
        setRoot(target)
        setChapters(collectChapters(rows, target.id))
        setLoaded(true)
      } catch (reason) {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [novelId])

  const book = useMemo(
    () => ({
      title: root?.title ?? '未命名小说',
      author: root?.novelAuthor,
      synopsis: root?.novelSynopsis,
      cover: root?.novelCover,
    }),
    [root],
  )

  const plainChapters = useMemo(() => flattenNovel(chapters), [chapters])
  const previewDoc = useMemo(() => novelPageDoc(book, plainChapters), [book, plainChapters])

  // PNG 的预览只能是真画出来的第一页；其余格式就是那张 A4 纸
  useEffect(() => {
    if (format !== 'png' || plainChapters.length === 0) return
    let alive = true
    void (async () => {
      setPageRendering(true)
      try {
        const canvases = await renderNovelPages(plainChapters.slice(0, 1), {
          format: pageFormat,
          scale: Math.min(scale, 1.5),
          background: { kind: backgroundKind, image: backgroundImage || undefined },
        })
        if (!alive) return
        setPagePreview(canvases[0]?.toDataURL('image/png') ?? null)
      } catch {
        if (alive) setPagePreview(null)
      } finally {
        if (alive) setPageRendering(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [format, pageFormat, scale, backgroundKind, backgroundImage, plainChapters])

  const handleBackgroundFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setBackgroundImage(String(reader.result ?? ''))
      setBackgroundKind('custom')
      setError('')
    }
    reader.onerror = () => setError('读不到这张图片')
    reader.readAsDataURL(file)
  }

  const runExport = async (): Promise<void> => {
    if (busy || plainChapters.length === 0) {
      if (plainChapters.length === 0) setError('没有可导出的章节')
      return
    }
    setBusy(true)
    setError('')
    setProgress(null)
    const title = safeFileName(book.title)
    try {
      if (format === 'png') {
        const canvases = await renderNovelPages(plainChapters, {
          format: pageFormat,
          scale,
          background: { kind: backgroundKind, image: backgroundImage || undefined },
          onProgress: (done, total) => setProgress({ done, total }),
        })
        const files: Array<{ name: string; data: Uint8Array }> = []
        for (const [index, canvas] of canvases.entries()) {
          files.push({ name: `${String(index + 1).padStart(2, '0')}.png`, data: await canvasToPngBytes(canvas) })
        }
        downloadBlob(createZip(files), `${title}-${pageFormat.replace(':', 'x')}.zip`)
      } else if (format === 'docx') {
        const blob = await buildNovelDocx(plainChapters, {
          title: book.title,
          author: book.author,
          synopsis: book.synopsis,
          coverSrc: book.cover,
        })
        downloadBlob(blob, `${title}.docx`)
      } else if (format === 'markdown') {
        const content = toMarkdown(flattenNovel(chapters, { markdown: true }), { title: book.title })
        downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${title}.md`)
      } else {
        const content = toTxt(plainChapters, { title: book.title })
        downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${title}.txt`)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const backgroundOptions: Array<{ value: NovelBackgroundKind; label: string }> = [
    ...NOVEL_BACKGROUND_PRESETS.map((preset) => ({ value: preset.value, label: preset.label })),
    { value: 'custom', label: '自定义' },
  ]

  const summary =
    !loaded
      ? '正在读取…'
      : error !== ''
        ? error
        : `${plainChapters.length} 章 · ${
            format === 'png'
              ? `${PAGE_SIZES[pageFormat].label} · ${scale}×`
              : FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? ''
          }`

  return (
    <>
      <ExportPanelLayout
      previewClassName="p-4"
      preview={
        <>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-[11px] text-ink-faint">
            <span className="truncate">{book.title}</span>
            <span className="shrink-0 truncate">{summary}</span>
          </div>
          <div className={`relative min-h-0 flex-1 overflow-hidden border border-line bg-paper-alt ${ROUND_CONTROL}`}>
            {format === 'png' ? (
              pagePreview !== null ? (
                <div className="flex h-full items-center justify-center p-2">
                  {pageRendering ? (
                    <Loader2 size={16} strokeWidth={2} className="absolute animate-spin text-ink-faint" />
                  ) : null}
                  {/* eslint-disable-next-line @next/next/no-img-element -- 预览的是画布出的位图，不走 next/image */}
                  <img src={pagePreview} alt="小说页面预览" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">
                  {pageRendering ? '正在生成…' : error || '没有可导出的章节'}
                </div>
              )
            ) : (
              <PagePreview doc={previewDoc} emptyHint="没有可导出的章节" />
            )}
          </div>
        </>
      }
      config={
        <>
          <ExportSection title="格式">
            <Segmented
              value={format}
              ariaLabel="导出格式"
              options={FORMAT_OPTIONS}
              onChange={(value: ExportFormat) => setFormat(value)}
            />
          </ExportSection>

          {format === 'png' ? (
            <>
              <ExportSection title="页面">
                <ExportRow label="尺寸">
                  <Segmented
                    value={pageFormat}
                    ariaLabel="页面尺寸"
                    options={PAGE_FORMATS.map((value) => ({ value, label: PAGE_SIZES[value].label }))}
                    onChange={(value: NovelPageFormat) => setPageFormat(value)}
                  />
                </ExportRow>
                <ExportRow label="清晰度">
                  <Segmented
                    value={scale}
                    ariaLabel="清晰度"
                    options={RESOLUTIONS.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(value: number) => setScale(value)}
                  />
                </ExportRow>
              </ExportSection>

              <ExportSection title="背景">
                <div className="grid grid-cols-4 gap-1">
                  {backgroundOptions.map((option) => {
                    const selected = backgroundKind === option.value
                    const custom = option.value === 'custom'
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          if (custom) {
                            setBackgroundKind('custom')
                            fileRef.current?.click()
                            return
                          }
                          setBackgroundKind(option.value)
                        }}
                        className={`flex min-w-0 flex-col items-center gap-1.5 py-1.5 transition-colors ${ROUND_ITEM} ${
                          selected ? 'text-ink' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-full items-center justify-center overflow-hidden border ${ROUND_ITEM} ${
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
                        <span className="truncate text-[11px]">{option.label}</span>
                      </button>
                    )
                  })}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundFile} />
              </ExportSection>
            </>
          ) : (
            <ExportSection title="内容">
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {format === 'docx' ? 'Word 带作品信息（作者 / 简介 / 封面）' : format === 'markdown' ? 'Markdown 保留标题层级' : 'TXT 只有书名与纯文本'}
              </p>
            </ExportSection>
          )}

          <ExportSection title="预览">
            <button
              type="button"
              onClick={() => setReaderOpen(true)}
              disabled={plainChapters.length === 0}
              className={`flex h-8 items-center justify-center gap-1.5 px-2 text-[12px] text-ink transition-colors hover:bg-[var(--oc-hover)] disabled:opacity-50 ${ROUND_ITEM}`}
            >
              <BookOpen size={14} strokeWidth={2} />
              整本翻页预览
            </button>
          </ExportSection>

          {error !== '' && loaded ? <p className="text-[11px] text-error">{error}</p> : null}
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            {busy && progress !== null ? `正在导出 ${progress.done}/${progress.total}` : format === 'png' ? 'PNG · zip' : FORMAT_OPTIONS.find((option) => option.value === format)?.label}
          </span>
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={busy || !loaded || plainChapters.length === 0}
            className={`${BTN_PRIMARY} ${busy || !loaded || plainChapters.length === 0 ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {busy ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Download size={14} strokeWidth={2} />}
            {busy ? '正在导出…' : '导出'}
          </button>
        </>
      }
      />

      {readerOpen ? (
        <NovelPreview
          title={book.title}
          chapters={plainChapters}
          onClose={() => setReaderOpen(false)}
        />
      ) : null}
    </>
  )
}
