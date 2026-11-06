'use client'

/**
 * 导出中心 · 静态网站页签。
 *
 * 左 iframe 预览、右配置。预览与导出调同一个 `buildSite()`，版式 / 分区 / 纸色
 * 改一下预览立刻变 —— 不是另画一张稿。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  applySiteSections,
  buildSite,
  loadSiteData,
  prepareSiteImages,
  type SiteData,
  type SiteSectionOptions,
  type SiteTemplateId,
  type SiteThemeTokens,
} from '@/lib/export'
import { siteTemplateOf, SITE_TEMPLATES } from '@/lib/export/site/templates'
import {
  deleteSitePreset,
  loadExportPresets,
  saveSitePreset,
  type SiteExportPreset,
  type SiteThemeChoice,
} from '@/lib/export/presets'
import { downloadText } from '@/lib/export/download'
import { useSettings } from '@/lib/settings'
import { getThemePreset, type ThemePresetId } from '@/lib/theme/presets'
import { useIsDarkTheme } from '@/lib/use-theme'
import { SWITCH_CLASSES, SWITCH_DOT } from '@/components/settings/controls'
import { BTN_PRIMARY, ICON_BTN, INPUT_LINE, ROUND_CONTROL, ROUND_ITEM } from '@/lib/ui-tokens'
import { ExportRow, ExportSection, Segmented } from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

const STORAGE_KEY = 'oc-site-export'

const SECTIONS: Array<{ key: keyof SiteSectionOptions; label: string }> = [
  { key: 'timeline', label: '时间线' },
  { key: 'characters', label: '角色' },
  { key: 'events', label: '事件' },
  { key: 'countries', label: '国家' },
  { key: 'world', label: '词条' },
  { key: 'relations', label: '关系' },
]

const THEMES: Array<{ value: SiteThemeChoice; label: string }> = [
  { value: 'current', label: '当前纸色' },
  { value: 'paper', label: '纸白' },
  { value: 'night', label: '夜色' },
  { value: 'auto', label: '跟随读者' },
]

const DEFAULT_SECTIONS: SiteSectionOptions = {
  timeline: true,
  characters: true,
  events: true,
  countries: true,
  world: true,
  relations: true,
}

interface StoredConfig {
  title?: string
  sections?: Partial<SiteSectionOptions>
  theme?: SiteThemeChoice
  inlineImages?: boolean
  template?: SiteTemplateId
}

function isThemeChoice(value: unknown): value is SiteThemeChoice {
  return value === 'current' || value === 'paper' || value === 'auto' || value === 'night'
}

function loadStoredConfig(): StoredConfig {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredConfig
    const sections: Partial<SiteSectionOptions> = {}
    if (parsed.sections && typeof parsed.sections === 'object') {
      for (const option of SECTIONS) {
        if (typeof parsed.sections[option.key] === 'boolean') sections[option.key] = parsed.sections[option.key]
      }
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      sections,
      theme: isThemeChoice(parsed.theme) ? parsed.theme : undefined,
      inlineImages: typeof parsed.inlineImages === 'boolean' ? parsed.inlineImages : undefined,
      template:
        parsed.template === 'book' || parsed.template === 'archive' || parsed.template === 'gallery'
          ? parsed.template
          : undefined,
    }
  } catch {
    return {}
  }
}

function saveStoredConfig(config: StoredConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // 隐私模式 / 存储满：配置留不住，不影响导出
  }
}

function resolveTheme(choice: SiteThemeChoice, preset: ThemePresetId, isDark: boolean): SiteThemeTokens | undefined {
  if (choice === 'auto') return undefined
  if (choice === 'night') return getThemePreset(preset).tokens.dark
  const theme = getThemePreset(choice === 'paper' ? 'paper' : preset)
  return isDark ? theme.tokens.dark : theme.tokens.light
}

/** 按容器大小等比缩放 iframe；桌面 / 手机只是换画布尺寸。 */
function SitePreviewFrame({
  html,
  mode,
}: {
  html: string
  mode: 'desktop' | 'mobile'
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.5)
  const frameWidth = mode === 'desktop' ? 1120 : 390
  const frameHeight = mode === 'desktop' ? 820 : 780

  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const measure = (): void => {
      const rect = element.getBoundingClientRect()
      setScale(Math.max(0.2, Math.min((rect.width - 24) / frameWidth, (rect.height - 24) / frameHeight)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [frameWidth, frameHeight])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: frameWidth,
          height: frameHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <iframe
          title="静态站预览"
          srcDoc={html}
          sandbox="allow-scripts"
          tabIndex={-1}
          className="border-0"
          style={{ width: frameWidth, height: frameHeight }}
        />
      </div>
    </div>
  )
}

export function SitePanel() {
  const { settings, updateSetting } = useSettings()
  const [stored] = useState<StoredConfig>(loadStoredConfig)

  const [title, setTitle] = useState(stored.title ?? '')
  const [sections, setSections] = useState<SiteSectionOptions>({ ...DEFAULT_SECTIONS, ...stored.sections })
  const [themeChoice, setThemeChoice] = useState<SiteThemeChoice>(stored.theme ?? 'current')
  const [inlineImages, setInlineImages] = useState(stored.inlineImages !== false)
  const [template, setTemplate] = useState<SiteTemplateId>(stored.template ?? 'book')
  const [presets, setPresets] = useState<SiteExportPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [data, setData] = useState<SiteData | null>(null)
  const [images, setImages] = useState<Map<string, string>>(new Map())
  const [imagesReady, setImagesReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isDark = useIsDarkTheme()

  useEffect(() => {
    let alive = true
    void loadSiteData()
      .then((next) => {
        if (!alive) return
        setData(next)
        setTitle((previous) => (previous.trim() !== '' ? previous : (next.meta?.worldName ?? '').trim() || 'OC Studio'))
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (data === null) return
    let alive = true
    void prepareSiteImages(data)
      .then((map) => {
        if (alive) setImages(map)
      })
      .catch(() => {
        // 图片读不出来：预览留空，不阻塞导出
      })
      .finally(() => {
        if (alive) setImagesReady(true)
      })
    return () => {
      alive = false
    }
  }, [data])

  useEffect(() => {
    saveStoredConfig({ title, sections, theme: themeChoice, inlineImages, template })
  }, [title, sections, themeChoice, inlineImages, template])

  useEffect(() => {
    void loadExportPresets()
      .then((file) => {
        setPresets(file.site)
        const preset = file.site.find((item) => item.id === settings.defaultSitePresetId)
        if (preset) {
          setTitle(preset.config.title)
          setSections(preset.config.sections)
          setThemeChoice(preset.config.theme)
          setInlineImages(preset.config.inlineImages)
          setTemplate(preset.config.template ?? 'book')
        }
      })
      .catch(() => setPresets([]))
  }, [settings.defaultSitePresetId])

  const previewHtml = useMemo(() => {
    if (data === null) return ''
    return buildSite(applySiteSections(data, sections), {
      images,
      title,
      sections,
      theme: resolveTheme(themeChoice, settings.themePreset, isDark),
      template,
    })
  }, [data, images, title, sections, themeChoice, settings.themePreset, isDark, template])

  const ready = data !== null && (!inlineImages || imagesReady)
  const sizeKb = previewHtml === '' ? 0 : Math.max(1, Math.round(previewHtml.length / 1024))

  const savePreset = async (): Promise<void> => {
    try {
      const next = await saveSitePreset(presetName, {
        title,
        sections,
        theme: themeChoice,
        inlineImages,
        template,
      })
      setPresets(next.site)
      setPresetName('')
      toast.success('预设已保存')
    } catch (reason) {
      toast.error('保存预设失败', { description: reason instanceof Error ? reason.message : String(reason) })
    }
  }

  const removePreset = async (id: string): Promise<void> => {
    try {
      const next = await deleteSitePreset(id)
      setPresets(next.site)
    } catch (reason) {
      toast.error('删除预设失败', { description: reason instanceof Error ? reason.message : String(reason) })
    }
  }

  const handleExport = async (): Promise<void> => {
    if (data === null || busy || !ready) return
    setBusy(true)
    setError('')
    try {
      const html = buildSite(applySiteSections(data, sections), {
        images: inlineImages ? images : new Map<string, string>(),
        title,
        sections,
        theme: resolveTheme(themeChoice, settings.themePreset, isDark),
        template,
      })
      await downloadText(html, 'index.html', 'text/html')
      toast.success('静态网站已导出', { description: '单文件，改名 index.html 即可发布' })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      if (message !== '已取消') setError(message)
    } finally {
      setBusy(false)
    }
  }

  const activeTemplate = siteTemplateOf(template)

  return (
    <ExportPanelLayout
      previewClassName="gap-2 p-4"
      preview={
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 text-[11px] text-ink-faint">
            <span className="flex items-center gap-2">
              预览
              <span className="tabular-nums">
                {data === null ? '正在读取…' : inlineImages && !imagesReady ? '正在准备图片…' : `${sizeKb} KB`}
              </span>
            </span>
            <span className="flex items-center gap-0.5">
              {(['desktop', 'mobile'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={previewMode === mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`px-2 py-0.5 transition-colors ${ROUND_ITEM} ${
                    previewMode === mode ? 'bg-[var(--oc-hover)] text-ink' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  {mode === 'desktop' ? '桌面' : '手机'}
                </button>
              ))}
            </span>
          </div>
          <div className={`relative min-h-0 flex-1 overflow-hidden border border-line bg-paper ${ROUND_CONTROL}`}>
            {data === null ? (
              <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">正在读取笔记库…</div>
            ) : (
              <SitePreviewFrame html={previewHtml} mode={previewMode} />
            )}
          </div>
        </>
      }
      config={
        <>
          <ExportSection title="版式">
            <div className="flex flex-col gap-1">
              {SITE_TEMPLATES.map((item) => {
                const active = item.id === template
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTemplate(item.id)}
                    className={`${ROUND_ITEM} flex items-baseline justify-between gap-2 border px-2 py-1.5 text-left transition-colors ${
                      active ? 'border-line-hover bg-[var(--oc-hover)]' : 'border-line hover:bg-[var(--oc-hover)]'
                    }`}
                  >
                    <span className="text-[12px] text-ink">{item.name}</span>
                    <span className="text-[10px] text-ink-faint">{item.hint}</span>
                  </button>
                )
              })}
            </div>
          </ExportSection>

          <ExportSection title="站点">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-ink-muted">标题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                placeholder="世界名"
                className={`${INPUT_LINE} h-8`}
              />
            </label>
            <ExportRow label="内联图片">
              <button
                type="button"
                role="switch"
                aria-checked={inlineImages}
                onClick={() => setInlineImages((previous) => !previous)}
                className={`${SWITCH_CLASSES.base} ${inlineImages ? SWITCH_CLASSES.on : SWITCH_CLASSES.off}`}
              >
                <span className={`${SWITCH_DOT} ${inlineImages ? 'translate-x-[18px] bg-paper' : 'translate-x-[2px]'}`} />
              </button>
            </ExportRow>
          </ExportSection>

          <ExportSection title="分区">
            <div className="grid grid-cols-2 gap-1.5">
              {SECTIONS.map((option) => {
                const on = sections[option.key]
                const count =
                  option.key === 'characters'
                    ? data?.characters.length
                    : option.key === 'events'
                      ? data?.events.length
                      : option.key === 'countries'
                        ? data?.countries.length
                        : option.key === 'world'
                          ? data?.worldEntries.length
                          : undefined
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSections((previous) => ({ ...previous, [option.key]: !previous[option.key] }))}
                    className={`${ROUND_ITEM} flex h-8 items-center justify-between gap-1 border px-2.5 text-[12px] transition-colors ${
                      on
                        ? 'border-line-hover bg-[var(--oc-hover)] font-medium text-ink'
                        : 'border-line text-ink-faint hover:text-ink'
                    }`}
                  >
                    <span>{option.label}</span>
                    {count !== undefined ? <span className="tabular-nums text-[11px] text-ink-faint">{count}</span> : null}
                  </button>
                )
              })}
            </div>
          </ExportSection>

          <ExportSection title="纸色">
            <Segmented
              value={themeChoice}
              ariaLabel="纸色"
              options={THEMES}
              onChange={setThemeChoice}
            />
          </ExportSection>

          <ExportSection title="预设">
            <div className="flex max-h-32 flex-col gap-px overflow-y-auto">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTitle(preset.config.title)
                      setSections(preset.config.sections)
                      setThemeChoice(preset.config.theme)
                      setInlineImages(preset.config.inlineImages)
                      setTemplate(preset.config.template ?? 'book')
                    }}
                    className={`${ROUND_ITEM} min-w-0 flex-1 truncate px-1.5 py-1 text-left text-[12px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink`}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSetting(
                        'defaultSitePresetId',
                        settings.defaultSitePresetId === preset.id ? '' : preset.id,
                      )
                    }
                    aria-label={`将${preset.name}设为默认`}
                    aria-pressed={settings.defaultSitePresetId === preset.id}
                    className={`${ICON_BTN} h-6 w-6`}
                  >
                    <Star
                      size={12}
                      strokeWidth={2}
                      className={settings.defaultSitePresetId === preset.id ? 'fill-current text-ink' : ''}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removePreset(preset.id)}
                    aria-label={`删除预设${preset.name}`}
                    className={`${ICON_BTN} h-6 w-6`}
                  >
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
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
                className={`${BTN_PRIMARY} h-7 px-2 text-[12px] ${presetName.trim() === '' ? 'opacity-50' : ''}`}
              >
                保存
              </button>
            </div>
          </ExportSection>
        </>
      }
      footer={
        <>
          {error !== '' ? (
            <p role="alert" className="min-w-0 flex-1 truncate text-[11px] text-error">
              {error}
            </p>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
              {activeTemplate.name} · 单文件 HTML
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!ready || busy}
            className={`${BTN_PRIMARY} ${!ready || busy ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            {busy ? '正在导出…' : '导出网站'}
          </button>
        </>
      }
    />
  )
}
