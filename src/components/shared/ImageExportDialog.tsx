'use client'

/**
 * 图片导出：海报版模板预览 + 选项 + 真实截图。
 * 预览和导出都用同一个 `TemplatePoster`，选项只影响内容 / 留白 / 背景 / 署名。
 */
import { useEffect, useRef, useState } from 'react'
import { Download, Star, Trash2 } from 'lucide-react'
import { toPng } from 'html-to-image'
import { toast } from 'sonner'
import { downloadMediaFile } from '@/lib/media-download'
import {
  BUILTIN_IMAGE_PRESETS,
  deleteImagePreset,
  loadExportPresets,
  saveImagePreset,
  type ImageExportPreset,
  type ImageRatio,
} from '@/lib/export/presets'
import {
  DEFAULT_POSTER_OPTIONS,
  TemplatePoster,
  type TemplatePosterData,
  type TemplatePosterOptions,
  type PosterPadding,
} from './TemplatePoster'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { useSettings } from '@/lib/settings'
import { BTN_PRIMARY, BTN_QUIET, FIELD_LABEL, INPUT_LINE } from '@/lib/ui-tokens'

const TOGGLES: { key: keyof Pick<TemplatePosterOptions, 'showCover' | 'showFields' | 'showTags' | 'showSummary' | 'showBody' | 'showSignature'>; label: string }[] = [
  { key: 'showCover', label: '封面' },
  { key: 'showFields', label: '字段' },
  { key: 'showTags', label: '标签' },
  { key: 'showSummary', label: '简介' },
  { key: 'showBody', label: '正文' },
  { key: 'showSignature', label: '署名' },
]

const PADDINGS: { value: PosterPadding; label: string }[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'standard', label: '标准' },
  { value: 'loose', label: '宽松' },
]

const RATIOS: { value: ImageRatio; label: string }[] = [
  { value: 'card', label: '角色卡' },
  { value: 'square', label: '方卡' },
  { value: 'portrait', label: '竖版' },
]

const STORAGE_KEY = 'oc-image-export'

function loadOptions(): TemplatePosterOptions {
  if (typeof window === 'undefined') return DEFAULT_POSTER_OPTIONS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_POSTER_OPTIONS
    const parsed = JSON.parse(raw) as Partial<TemplatePosterOptions>
    return { ...DEFAULT_POSTER_OPTIONS, ...parsed }
  } catch {
    return DEFAULT_POSTER_OPTIONS
  }
}

function safeFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
  return cleaned === '' ? 'template-poster' : cleaned
}

export function ImageExportDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TemplatePosterData | null
}) {
  const posterRef = useRef<HTMLDivElement | null>(null)
  const { settings, updateSetting } = useSettings()
  const [options, setOptions] = useState<TemplatePosterOptions>(loadOptions)
  const [busy, setBusy] = useState(false)
  const [presets, setPresets] = useState<ImageExportPreset[]>([])
  const [presetName, setPresetName] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
    }
  }, [options])

  useEffect(() => {
    if (!open) return
    void loadExportPresets()
      .then((file) => {
        setPresets(file.image)
        const preset = [...BUILTIN_IMAGE_PRESETS, ...file.image].find(
          (item) => item.id === settings.defaultImagePresetId,
        )
        if (preset) setOptions(preset.options)
      })
      .catch(() => setPresets([]))
  }, [open, settings.defaultImagePresetId])

  const toggle = (key: (typeof TOGGLES)[number]['key']) =>
    setOptions((current) => ({ ...current, [key]: !current[key] }))

  const allPresets = [...BUILTIN_IMAGE_PRESETS, ...presets]

  const savePreset = async (): Promise<void> => {
    try {
      const next = await saveImagePreset(presetName, options)
      setPresets(next.image)
      setPresetName('')
      toast.success('预设已保存')
    } catch (err) {
      toast.error('保存预设失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const removePreset = async (id: string): Promise<void> => {
    try {
      const next = await deleteImagePreset(id)
      setPresets(next.image)
    } catch (err) {
      toast.error('删除预设失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const exportImage = async (): Promise<void> => {
    if (data === null || posterRef.current === null || busy) return
    setBusy(true)
    try {
      await document.fonts.ready
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor:
          options.background === 'transparent'
            ? 'transparent'
            : getComputedStyle(posterRef.current).backgroundColor,
      })
      const saved = await downloadMediaFile(dataUrl, `${safeFileName(data.title)}.png`)
      toast.success('图片已导出', { description: saved ?? undefined })
      onOpenChange(false)
    } catch (err) {
      toast.error('图片导出失败', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle>导出图片</DialogTitle>
          <DialogDescription>1080 宽海报；选项只影响这一张图。</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="h-[54vh] overflow-auto rounded-control border border-line bg-paper-alt p-4">
            {data ? (
              <div style={{ zoom: 0.42 }}>
                <TemplatePoster data={data} options={options} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">
                没有可导出的预览
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="flex flex-col gap-2">
              <span className={FIELD_LABEL}>尺寸</span>
              <div className="flex gap-1">
                {RATIOS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={options.ratio === item.value}
                    onClick={() => setOptions((current) => ({ ...current, ratio: item.value }))}
                    className={`rounded-item px-2 py-1 text-[12px] transition-colors ${
                      options.ratio === item.value
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className={FIELD_LABEL}>内容</span>
              {TOGGLES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={options[key]}
                    onCheckedChange={() => toggle(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <span className={FIELD_LABEL}>留白</span>
              <div className="flex gap-1">
                {PADDINGS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={options.padding === item.value}
                    onClick={() => setOptions((current) => ({ ...current, padding: item.value }))}
                    className={`rounded-item px-2 py-1 text-[12px] transition-colors ${
                      options.padding === item.value
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={FIELD_LABEL}>背景</span>
              <div className="flex gap-1">
                {(['paper', 'transparent'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={options.background === value}
                    onClick={() => setOptions((current) => ({ ...current, background: value }))}
                    className={`rounded-item px-2 py-1 text-[12px] transition-colors ${
                      options.background === value
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                    }`}
                  >
                    {value === 'paper' ? '纸色' : '透明'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOptions(DEFAULT_POSTER_OPTIONS)}
              className="mt-1 self-start text-[11px] text-ink-faint transition-colors hover:text-ink"
            >
              重置选项
            </button>

            <div className="flex flex-col gap-1.5 border-t border-line pt-2">
              <span className={FIELD_LABEL}>预设</span>
              {allPresets.length > 0 ? (
                <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                  {allPresets.map((preset) => (
                    <div key={preset.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setOptions(preset.options)}
                        className="min-w-0 flex-1 truncate rounded-item px-1 py-0.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSetting(
                            'defaultImagePresetId',
                            settings.defaultImagePresetId === preset.id ? '' : preset.id,
                          )
                        }
                        aria-label={`将${preset.name}设为默认预设`}
                        aria-pressed={settings.defaultImagePresetId === preset.id}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                      >
                        <Star
                          size={12}
                          strokeWidth={2}
                          className={settings.defaultImagePresetId === preset.id ? 'fill-current text-ink' : ''}
                        />
                      </button>
                      {preset.builtin ? (
                        <span className="h-6 w-6 shrink-0" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => void removePreset(preset.id)}
                          aria-label={`删除预设${preset.name}`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-1">
                <input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="预设名"
                  maxLength={20}
                  className={`${INPUT_LINE} h-7 min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void savePreset()}
                  disabled={presetName.trim() === ''}
                  className={`${BTN_QUIET} h-7 shrink-0 px-2 text-[12px] ${presetName.trim() === '' ? 'opacity-50' : ''}`}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={BTN_QUIET}>
            取消
          </button>
          <button type="button" onClick={() => void exportImage()} disabled={data === null || busy} className={BTN_PRIMARY}>
            <Download size={14} strokeWidth={2} />
            {busy ? '导出中…' : '导出 PNG'}
          </button>
        </DialogFooter>
      </DialogContent>

      {data ? (
        <div style={{ position: 'fixed', left: -12000, top: 0, pointerEvents: 'none' }} aria-hidden>
          <TemplatePoster ref={posterRef} data={data} options={options} />
        </div>
      ) : null}
    </Dialog>
  )
}
