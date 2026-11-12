'use client'

/**
 * 导出中心 · 文档页签：Word / Markdown / TXT。
 *
 * 左预览是**排好版的文档页**（不是源码），右侧勾选分区。预览与三个导出格式都吃
 * 同一份 `DocumentModel`（`lib/export/document`），所以看到的就是导出的。
 */
import { useEffect, useMemo, useState } from 'react'
import { Download, Search, Check } from 'lucide-react'
import { toast } from 'sonner'
import { buildDocumentModel, DOCUMENT_SECTIONS, documentCounts, toPageDoc, type DocumentModel, type DocumentSection, selectDocumentEntries } from '@/lib/export/document'
import { buildDocumentDocx } from '@/lib/export/document-docx'
import { renderMarkdown, renderTxt } from '@/lib/export/markdown'
import { pageDocCharCount } from '@/lib/export/page'
import { downloadText } from '@/lib/export/download'
import { saveBytesFile } from '@/lib/media-download'
import { BTN_PRIMARY, ROUND_CONTROL, SEARCH_ICON, SEARCH_INPUT } from '@/lib/ui-tokens'
import { EXPORT_SECTION_LABEL, ExportSection, Segmented } from './controls'
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
  /**
   * 「全部 / 选条目」与已选条目。
   *
   * 海报导出一直是「先选对象再导」，文档导出以前只能整库出去 —— 想单独导一篇角色，
   * 只能先关掉其它三个分区再想办法。这里给同样的能力：按条目多选，预览与文件都跟着裁。
   * 已选集合按 `DocumentModel` 的条目 id（`角色:1` 这种）记，跨分区不会撞。
   */
  const [scope, setScope] = useState<'all' | 'picked'>('all')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [pickQuery, setPickQuery] = useState('')
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
    () => (model === null ? null : selectDocumentEntries(model, sections, scope, picked)),
    [model, sections, scope, picked],
  )

  /** 可选的条目（跟着分区开关走）：分区关了就不该再出现在选择列表里 */
  const pickable = useMemo(() => {
    if (model === null) return []
    const query = pickQuery.trim().toLowerCase()
    return model.sections
      .filter((section) => sections[section.key])
      .map((section) => ({
        key: section.key,
        label: section.label,
        entries: section.entries.filter(
          (entry) => query === '' || entry.title.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.entries.length > 0)
  }, [model, sections, pickQuery])

  const togglePicked = (id: string): void => {
    setPicked((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setGroupPicked = (ids: string[], on: boolean): void => {
    setPicked((previous) => {
      const next = new Set(previous)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

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
          <p className="text-[12px] leading-relaxed text-ink-muted">
            文档导出只含文字：标题、字段、正文文字与表格文字都在，正文里的图片不会进文档
            （要带图请用「相册」或整库备份）。
          </p>

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

          <ExportSection title="内容">
            <Segmented
              value={scope}
              onChange={setScope}
              ariaLabel="导出范围"
              options={[
                { value: 'all', label: '全部' },
                {
                  value: 'picked',
                  // 显示**实际会导出**的条数：勾了但它所在的分区被关掉时，那个勾不算数，
                  // 标签上写总数会变成「选了 3 条、只导 2 条」。
                  label: (visible?.total ?? 0) > 0 ? `选条目 · ${visible?.total ?? 0}` : '选条目',
                },
              ]}
            />

            {scope === 'picked' ? (
              <>
                <div className="relative flex items-center">
                  <Search size={13} strokeWidth={2} className={SEARCH_ICON} />
                  <input
                    type="text"
                    value={pickQuery}
                    onChange={(event) => setPickQuery(event.target.value)}
                    placeholder="搜索条目..."
                    className={SEARCH_INPUT}
                  />
                </div>

                <div className={`max-h-56 overflow-y-auto ${ROUND_CONTROL}`}>
                  {pickable.length === 0 ? (
                    <p className="px-1.5 py-2 text-[12px] text-ink-faint">
                      {counts.characters + counts.events + counts.countries + counts.world === 0
                        ? '这个库还没有可导出的条目'
                        : !DOCUMENT_SECTIONS.some((option) => sections[option.key])
                          ? '四个分区都关着，先把上面的分区打开'
                          : '没有匹配的条目'}
                    </p>
                  ) : (
                    pickable.map((group) => {
                      const ids = group.entries.map((entry) => entry.id)
                      const allOn = ids.every((id) => picked.has(id))
                      return (
                        <div key={group.key} className="flex flex-col">
                          <div className="flex items-center justify-between px-1.5 pb-0.5 pt-1.5">
                            <span className={EXPORT_SECTION_LABEL}>{group.label}</span>
                            <button
                              type="button"
                              onClick={() => setGroupPicked(ids, !allOn)}
                              className="text-[11px] text-ink-faint transition-colors hover:text-ink"
                            >
                              {allOn ? '清空' : '全选'}
                            </button>
                          </div>
                          {group.entries.map((entry) => {
                            const on = picked.has(entry.id)
                            return (
                              <button
                                key={entry.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => togglePicked(entry.id)}
                                className={`flex h-8 items-center gap-2 rounded-item px-1.5 text-left text-[12px] transition-colors ${
                                  on ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-muted hover:bg-[var(--oc-hover)]'
                                }`}
                              >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-item border border-line">
                                  {on ? <Check size={11} strokeWidth={3} className="text-ink" /> : null}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })
                  )}
                </div>

                {visible !== null && visible.total === 0 ? (
                  <p className="px-1.5 text-[11px] text-ink-faint">至少选一条才能导出</p>
                ) : null}
              </>
            ) : null}
          </ExportSection>
        </>
      }
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            .{FORMAT_EXTENSION[format]} · 单文件 · 只含文字
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
