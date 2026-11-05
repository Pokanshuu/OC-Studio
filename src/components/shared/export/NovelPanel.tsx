'use client'

/**
 * 导出中心 · 小说页签。
 *
 * 和「文档」页签不是一回事：小说是**按章节出成品**——PNG 逐页打包成 zip、Word / Markdown / TXT，
 * 版式（四套预设 + 字号 / 行距 / 页边距 / 页码 / 扉页）只对 PNG 生效。所以它单独一个页签。
 *
 * 左半边**直接是整本书的翻页预览**（`NovelReader`）：能翻页、能缩放，不必先看一张缩略图
 * 再点开浮层 —— 那块横向空间本来就是用来读的。预览与 PNG 共用同一份分页（`pagination.ts`）
 * 与同一份版式参数（`layout.ts`），所以看到的就是导出的。
 *
 * 数据按 `novelId` 自己读（根笔记 + 它的子孙章节），调用方只要 `openExport({ tab: 'novel', novelId })`。
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Download, ImagePlus, Loader2 } from 'lucide-react'
import type { WorldEntry } from '@/types'
import { db } from '@/lib/db'
import { createZip, downloadBlob } from '@/lib/zip'
import { flattenNovel, toMarkdown, toTxt } from '@/features/novel/export'
import { PAGE_SIZES, paginateNovel, type NovelPageFormat } from '@/features/novel/pagination'
import {
  DEFAULT_NOVEL_LAYOUT,
  NOVEL_FONT_OPTIONS,
  NOVEL_LAYOUT_OPTIONS,
  NOVEL_LAYOUT_PRESETS,
  NOVEL_PAGE_NUMBER_OPTIONS,
  NOVEL_TITLE_OPTIONS,
  normalizeNovelLayout,
  presetIdOf,
  toPaginateOptions,
  type NovelLayoutParams,
  type NovelLayoutPresetId,
  type NovelPageNumber,
  type NovelTitleStyle,
  type NovelFontKind,
} from '@/features/novel/layout'
import {
  NOVEL_BACKGROUND_PRESETS,
  resolveNovelBackground,
  type NovelBackgroundKind,
} from '@/features/novel/background'
import { canvasToPngBytes, renderNovelPages } from '@/features/novel/render-pages'
import { NovelReader } from '@/features/novel/NovelReader'
import { buildNovelDocx } from '@/features/novel/docx'
import { novelPageDoc } from '@/features/novel/preview-doc'
import { PagePreview } from '@/components/shared/document/PagePreview'
import { BTN_PRIMARY, ROUND_CONTROL, ROUND_ITEM } from '@/lib/ui-tokens'
import { ExportRow, ExportSection, Segmented, Slider, Toggle } from './controls'
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
  const [layout, setLayout] = useState<NovelLayoutParams>(DEFAULT_NOVEL_LAYOUT)
  const [backgroundKind, setBackgroundKind] = useState<NovelBackgroundKind>('paper')
  const [backgroundImage, setBackgroundImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

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

  const meta = useMemo(
    () => ({ title: book.title, author: book.author, synopsis: book.synopsis }),
    [book],
  )

  const plainChapters = useMemo(() => flattenNovel(chapters), [chapters])
  const previewDoc = useMemo(() => novelPageDoc(book, plainChapters), [book, plainChapters])
  const pages = useMemo(
    () => paginateNovel(plainChapters, toPaginateOptions(layout, pageFormat, meta)),
    [plainChapters, layout, pageFormat, meta],
  )
  const background = useMemo(
    () => resolveNovelBackground(backgroundKind, backgroundImage),
    [backgroundKind, backgroundImage],
  )

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

  const applyLayout = (patch: Partial<NovelLayoutParams>): void => {
    setLayout((current) => normalizeNovelLayout({ ...current, ...patch }))
  }

  const applyPreset = (id: NovelLayoutPresetId): void => {
    const preset = NOVEL_LAYOUT_PRESETS.find((item) => item.id === id)
    if (preset) setLayout(preset.params)
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
          layout,
          meta,
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

  const activePreset = presetIdOf(layout)
  const presetHint = activePreset
    ? NOVEL_LAYOUT_PRESETS.find((preset) => preset.id === activePreset)?.hint ?? ''
    : '已微调'

  const summary =
    !loaded
      ? '正在读取…'
      : error !== ''
        ? error
        : `${plainChapters.length} 章 · ${
            format === 'png'
              ? `${PAGE_SIZES[pageFormat].label} · ${pages.length} 页`
              : FORMAT_OPTIONS.find((option) => option.value === format)?.label ?? ''
          }`

  return (
    <ExportPanelLayout
      preview={
        <>
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line px-3 text-[11px] text-ink-faint">
            <span className="truncate text-ink-muted">{book.title}</span>
            <span className="shrink-0 truncate">{summary}</span>
          </div>
          {format === 'png' ? (
            <NovelReader
              pages={pages}
              layout={layout}
              format={pageFormat}
              background={background}
              meta={meta}
              className="min-h-0 flex-1"
            />
          ) : (
            <div className="min-h-0 flex-1 p-4">
              <div className={`h-full overflow-hidden border border-line bg-paper-alt ${ROUND_CONTROL}`}>
                <PagePreview doc={previewDoc} emptyHint="没有可导出的章节" />
              </div>
            </div>
          )}
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

              <ExportSection title="版式">
                <Segmented
                  value={(activePreset ?? '') as NovelLayoutPresetId}
                  ariaLabel="版式"
                  options={NOVEL_LAYOUT_OPTIONS}
                  onChange={(value: NovelLayoutPresetId) => applyPreset(value)}
                />
                <p className="text-[11px] text-ink-faint">{presetHint}</p>

                <ExportRow label="字体">
                  <Segmented
                    value={layout.font}
                    ariaLabel="字体"
                    options={NOVEL_FONT_OPTIONS}
                    onChange={(value: NovelFontKind) => applyLayout({ font: value })}
                  />
                </ExportRow>
                <ExportRow label="字号">
                  <div className="w-40">
                    <Slider
                      value={layout.fontSize}
                      min={12}
                      max={22}
                      step={1}
                      ariaLabel="字号"
                      format={(value) => `${value}px`}
                      onChange={(value) => applyLayout({ fontSize: value })}
                    />
                  </div>
                </ExportRow>
                <ExportRow label="行距">
                  <div className="w-40">
                    <Slider
                      value={layout.lineHeight}
                      min={1.4}
                      max={2.6}
                      step={0.1}
                      ariaLabel="行距"
                      format={(value) => value.toFixed(1)}
                      onChange={(value) => applyLayout({ lineHeight: value })}
                    />
                  </div>
                </ExportRow>
                <ExportRow label="页边距">
                  <div className="w-40">
                    <Slider
                      value={layout.margin}
                      min={24}
                      max={96}
                      step={2}
                      ariaLabel="页边距"
                      format={(value) => `${value}px`}
                      onChange={(value) => applyLayout({ margin: value })}
                    />
                  </div>
                </ExportRow>
                <ExportRow label="章首">
                  <Segmented
                    value={layout.titleStyle}
                    ariaLabel="章首标题"
                    options={NOVEL_TITLE_OPTIONS}
                    onChange={(value: NovelTitleStyle) => applyLayout({ titleStyle: value })}
                  />
                </ExportRow>
                <ExportRow label="页码">
                  <Segmented
                    value={layout.pageNumber}
                    ariaLabel="页码"
                    options={NOVEL_PAGE_NUMBER_OPTIONS}
                    onChange={(value: NovelPageNumber) => applyLayout({ pageNumber: value })}
                  />
                </ExportRow>
                <ExportRow label="每章另起">
                  <Toggle
                    checked={layout.chapterBreak}
                    ariaLabel="每章另起一页"
                    onChange={(next) => applyLayout({ chapterBreak: next })}
                  />
                </ExportRow>
                <ExportRow label="扉页">
                  <Toggle
                    checked={layout.titlePage}
                    ariaLabel="正文前加一页扉页"
                    onChange={(next) => applyLayout({ titlePage: next })}
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

          {error !== '' && loaded ? <p className="text-[11px] text-error">{error}</p> : null}
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            {busy && progress !== null
              ? `正在导出 ${progress.done}/${progress.total}`
              : format === 'png'
                ? `PNG · ${pages.length} 页 · zip`
                : FORMAT_OPTIONS.find((option) => option.value === format)?.label}
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
  )
}
