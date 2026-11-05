'use client'

/**
 * 导出中心 · 文档页签：Word / Markdown / TXT。
 *
 * 左预览是**排好版的文档页**（不是源码），右侧勾选分区。预览与三个导出格式都吃
 * 同一份 `DocumentModel`（`lib/export/document`），所以看到的就是导出的。
 */
import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  buildDocumentModel,
  DOCUMENT_SECTIONS,
  documentCounts,
  toPageDoc,
  type DocumentModel,
  type DocumentSection,
} from '@/lib/export/document'
import { buildDocumentDocx } from '@/lib/export/document-docx'
import { renderMarkdown, renderTxt } from '@/lib/export/markdown'
import { pageDocCharCount } from '@/lib/export/page'
import { downloadText } from '@/lib/export/download'
import { saveBytesFile } from '@/lib/media-download'
import { BTN_PRIMARY, ROUND_CONTROL } from '@/lib/ui-tokens'
import { ExportSection, Segmented } from './controls'
import { PagePreview } from '@/components/shared/document/PagePreview'
import { ExportPanelLayout } from './ExportPanelLayout'

type Format = 'word' | 'markdown' | 'txt'

const FORMAT_EXTENSION: Record<Format, string> = { word: 'docx', markdown: 'md', txt: 'txt' }
const FORMAT_MIME: Record<Format, string> = {
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  markdown: 'text/markdown',
  txt: 'text/plain',
}
const FORMAT_DONE: Record<Format, string> = {
  word: 'Word 文档已导出',
  markdown: 'Markdown 已导出',
  txt: 'TXT 已导出',
}

function localDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 按开关裁一遍分区；计数仍用完整模型（关掉的分区也要显示「有多少条」）。 */
function visibleModel(model: DocumentModel, sections: Record<DocumentSection, boolean>): DocumentModel {
  const kept = model.sections.filter((section) => sections[section.key])
  return { ...model, sections: kept, total: kept.reduce((sum, section) => sum + section.entries.length, 0) }
}

export function DocumentPanel() {
  const [format, setFormat] = useState<Format>('word')
  const [sections, setSections] = useState<Record<DocumentSection, boolean>>({
    characters: true,
    events: true,
    countries: true,
    world: true,
  })
  const [model, setModel] = useState<DocumentModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void buildDocumentModel()
      .then((next) => {
        if (alive) setModel(next)
      })
      .catch((reason: unknown) => {
        if (alive) {
          setModel(null)
          toast.error('读取文档内容失败', {
            description: reason instanceof Error ? reason.message : String(reason),
          })
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const counts = useMemo(
    () => (model === null ? { characters: 0, events: 0, countries: 0, world: 0 } : documentCounts(model)),
    [model],
  )
  const visible = useMemo(
    () => (model === null ? null : visibleModel(model, sections)),
    [model, sections],
  )

  const handleExport = async (): Promise<void> => {
    if (busy || visible === null || visible.total === 0) return
    setBusy(true)
    try {
      const name = `oc-export-${localDate()}.${FORMAT_EXTENSION[format]}`
      if (format === 'word') {
        const blob = buildDocumentDocx(visible)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const saved = await saveBytesFile(bytes, name)
        if (saved === null) return
        toast.success(FORMAT_DONE.word, { description: saved })
      } else {
        const text = format === 'markdown' ? renderMarkdown(visible) : renderTxt(visible)
        await downloadText(text, name, FORMAT_MIME[format])
        toast.success(FORMAT_DONE[format])
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      if (message !== '已取消') toast.error('导出失败', { description: message })
    } finally {
      setBusy(false)
    }
  }

  const doc = useMemo(() => (visible === null ? null : toPageDoc(visible)), [visible])
  const charCount = useMemo(() => (doc === null ? 0 : pageDocCharCount(doc)), [doc])
  const disabled = busy || visible === null || visible.total === 0

  return (
    <ExportPanelLayout
      preview={
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2 text-[11px] text-ink-faint">
            <span>
              {loading || doc === null ? '正在读取…' : `A4 · ${visible?.total ?? 0} 条 · ${charCount} 字`}
            </span>
            <span>{FORMAT_EXTENSION[format].toUpperCase()}</span>
          </div>
          <div className={`min-h-0 flex-1 overflow-hidden ${ROUND_CONTROL}`}>
            {doc !== null ? (
              <PagePreview doc={doc} />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">
                {loading ? '正在读取…' : '读不到内容'}
              </div>
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
              options={[
                { value: 'word', label: 'Word' },
                { value: 'markdown', label: 'Markdown' },
                { value: 'txt', label: 'TXT' },
              ]}
              onChange={setFormat}
            />
          </ExportSection>

          <ExportSection title="分区">
            <div className="flex flex-col gap-0.5">
              {DOCUMENT_SECTIONS.map((option) => {
                const on = sections[option.key]
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSections((previous) => ({ ...previous, [option.key]: !previous[option.key] }))}
                    className={`flex h-8 items-center justify-between gap-2 rounded-item px-1.5 text-[12px] transition-colors ${
                      on ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-faint hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className="tabular-nums text-[11px] text-ink-faint">{counts[option.key]}</span>
                  </button>
                )
              })}
            </div>
          </ExportSection>
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            .{FORMAT_EXTENSION[format]} · 单文件
          </span>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={disabled}
            className={`${BTN_PRIMARY} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            {busy ? '正在导出…' : '导出文档'}
          </button>
        </>
      }
    />
  )
}
