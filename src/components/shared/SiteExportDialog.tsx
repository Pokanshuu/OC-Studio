'use client'

/**
 * 发布为静态网站 · 配置与预览。
 *
 * 之前「文件 › 发布为 › 静态网站」点一下就直接生成 `index.html`，用户看不到标题、
 * 分区、纸色这些会写进成品的东西。这里把配置收在一个弹窗里：
 * 左边改，右边用同一份 `buildSite()` 实时渲染预览（不是另画一张稿），
 * 导出时再走一次同一个函数 —— 所见即所得。
 *
 * 分区开关只在 `buildSite()` 的入口过滤一次数据；关掉的分区不生成页面、
 * 不生成导航，跨分区引用回落成纯文本。
 */
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  applySiteSections,
  buildSite,
  downloadText,
  loadSiteData,
  prepareSiteImages,
  type SiteData,
  type SiteSectionOptions,
  type SiteThemeTokens,
} from '@/lib/export'
import {
  deleteSitePreset,
  loadExportPresets,
  saveSitePreset,
  type SiteExportPreset,
  type SiteThemeChoice,
} from '@/lib/export/presets'
import { useSettings } from '@/lib/settings'
import { getThemePreset, type ThemePresetId } from '@/lib/theme/presets'
import { useIsDarkTheme } from '@/lib/use-theme'
import { SWITCH_CLASSES, SWITCH_DOT } from '@/components/settings/controls'
import {
  BTN_PRIMARY,
  BTN_QUIET,
  ICON_BTN,
  INPUT_LINE,
  PAGE_TITLE,
  PANEL,
  ROUND_CONTROL,
  ROUND_ITEM,
} from '@/lib/ui-tokens'

interface SiteExportDialogProps {
  onClose: () => void
}

type ThemeChoice = SiteThemeChoice

interface StoredConfig {
  title?: string
  sections?: Partial<SiteSectionOptions>
  theme?: ThemeChoice
  inlineImages?: boolean
}

const STORAGE_KEY = 'oc-site-export'

const SECTION_OPTIONS: Array<{ key: keyof SiteSectionOptions; label: string }> = [
  { key: 'timeline', label: '时间线' },
  { key: 'characters', label: '角色' },
  { key: 'events', label: '事件' },
  { key: 'countries', label: '国家' },
  { key: 'world', label: '词条' },
  { key: 'relations', label: '关系' },
]

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'current', label: '当前纸色' },
  { value: 'paper', label: '强制纸白' },
  { value: 'auto', label: '跟随读者系统' },
]

const DEFAULT_SECTIONS: SiteSectionOptions = {
  timeline: true,
  characters: true,
  events: true,
  countries: true,
  world: true,
  relations: true,
}

const EMPTY_IMAGES = new Map<string, string>()

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'current' || value === 'paper' || value === 'auto'
}

function loadStoredConfig(): StoredConfig {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredConfig
    const sections: Partial<SiteSectionOptions> = {}
    if (parsed.sections && typeof parsed.sections === 'object') {
      for (const option of SECTION_OPTIONS) {
        const value = parsed.sections[option.key]
        if (typeof value === 'boolean') sections[option.key] = value
      }
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      sections,
      theme: isThemeChoice(parsed.theme) ? parsed.theme : undefined,
      inlineImages: typeof parsed.inlineImages === 'boolean' ? parsed.inlineImages : undefined,
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

/** 把「当前纸色 / 强制纸白 / 跟随系统」解析成一组固定令牌。 */
function resolveTheme(choice: ThemeChoice, preset: ThemePresetId, isDark: boolean): SiteThemeTokens | undefined {
  if (choice === 'auto') return undefined
  const theme = getThemePreset(choice === 'paper' ? 'paper' : preset)
  return choice === 'current' && isDark ? theme.tokens.dark : theme.tokens.light
}

export function SiteExportDialog({ onClose }: SiteExportDialogProps) {
  const { settings, updateSetting } = useSettings()
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [stored] = useState<StoredConfig>(loadStoredConfig)

  const [title, setTitle] = useState(stored.title ?? '')
  const [sections, setSections] = useState<SiteSectionOptions>({
    ...DEFAULT_SECTIONS,
    ...stored.sections,
  })
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(stored.theme ?? 'current')
  const [inlineImages, setInlineImages] = useState(stored.inlineImages !== false)
  const [presets, setPresets] = useState<SiteExportPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [data, setData] = useState<SiteData | null>(null)
  const [images, setImages] = useState<Map<string, string>>(new Map())
  const [imagesReady, setImagesReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 打开时把焦点收进弹窗，关闭时还给触发按钮
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => previous?.focus()
  }, [])

  // Esc 关闭；Tab 在弹窗内循环（与地图库同一个口径）
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        onClose()
        return
      }
      if (event.key !== 'Tab' || panelRef.current === null) return
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // 数据只读一次；标题没存过就落到世界名
  useEffect(() => {
    let alive = true
    void loadSiteData()
      .then((next) => {
        if (!alive) return
        setData(next)
        setTitle((prev) => (prev.trim() !== '' ? prev : (next.meta?.worldName ?? '').trim() || 'OC Studio'))
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  // 图片只转一次：预览与导出共用；分区后再开关也不会缺图
  useEffect(() => {
    if (data === null) return
    let alive = true
    void prepareSiteImages(data)
      .then((map) => {
        if (!alive) return
        setImages(map)
        setImagesReady(true)
      })
      .catch(() => {
        if (alive) setImagesReady(true)
      })
    return () => {
      alive = false
    }
  }, [data])

  useEffect(() => {
    saveStoredConfig({ title, sections, theme: themeChoice, inlineImages })
  }, [title, sections, themeChoice, inlineImages])

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
        }
      })
      .catch(() => setPresets([]))
  }, [settings.defaultSitePresetId])

  const deferredTitle = useDeferredValue(title)
  const isDark = useIsDarkTheme()

  const previewHtml = useMemo(() => {
    if (data === null) return ''
    return buildSite(applySiteSections(data, sections), {
      images: inlineImages ? images : EMPTY_IMAGES,
      title: deferredTitle,
      sections,
      theme: resolveTheme(themeChoice, settings.themePreset, isDark),
    })
  }, [data, images, inlineImages, deferredTitle, sections, themeChoice, settings.themePreset, isDark])

  const ready = data !== null && (!inlineImages || imagesReady)

  const toggleSection = (key: keyof SiteSectionOptions): void => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const savePreset = async (): Promise<void> => {
    try {
      const next = await saveSitePreset(presetName, {
        title,
        sections,
        theme: themeChoice,
        inlineImages,
      })
      setPresets(next.site)
      setPresetName('')
      toast.success('预设已保存')
    } catch (err) {
      toast.error('保存预设失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const removePreset = async (id: string): Promise<void> => {
    try {
      const next = await deleteSitePreset(id)
      setPresets(next.site)
    } catch (err) {
      toast.error('删除预设失败', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  const applyPreset = (preset: SiteExportPreset): void => {
    setTitle(preset.config.title)
    setSections(preset.config.sections)
    setThemeChoice(preset.config.theme)
    setInlineImages(preset.config.inlineImages)
  }

  const handleExport = async (): Promise<void> => {
    if (data === null || busy || !ready) return
    setBusy(true)
    setError('')
    try {
      const html = buildSite(applySiteSections(data, sections), {
        images: inlineImages ? images : EMPTY_IMAGES,
        title,
        sections,
        theme: resolveTheme(themeChoice, settings.themePreset, isDark),
      })
      await downloadText(html, 'index.html', 'text/html')
      saveStoredConfig({ title, sections, theme: themeChoice, inlineImages })
      toast.success('静态网站已导出', { description: '单文件，改名 index.html 即可发布' })
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message !== '已取消') setError(message)
    } finally {
      setBusy(false)
    }
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')
  const sizeKb = previewHtml === '' ? 0 : Math.max(1, Math.round(previewHtml.length / 1024))

  const content = (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[var(--oc-scrim)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex flex-col overflow-hidden outline-none ${PANEL}`}
        style={{ width: 'min(960px, calc(100vw - 2rem))', height: 'min(720px, calc(100vh - 2rem))' }}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className={PAGE_TITLE}>
            发布为静态网站
          </h2>
          <button type="button" onClick={onClose} aria-label="关闭" className={`${ICON_BTN} -mr-2`}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col gap-2 bg-paper-alt p-4">
            <div className="flex items-center justify-between gap-3 text-[11px] text-ink-faint">
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
                      previewMode === mode
                        ? 'bg-[var(--oc-hover)] text-ink'
                        : 'text-ink-faint hover:text-ink'
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
                <iframe
                  title="静态站预览"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts"
                  tabIndex={-1}
                  className="absolute top-0 origin-top-left border-0"
                  style={{
                    left: '50%',
                    width: previewMode === 'desktop' ? 1120 : 390,
                    height: previewMode === 'desktop' ? 820 : 780,
                    transform:
                      previewMode === 'desktop'
                        ? 'scale(0.58) translateX(-50%)'
                        : 'scale(0.68) translateX(-50%)',
                  }}
                />
              )}
            </div>
          </div>

          <aside className="flex w-[264px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line p-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">站点标题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                placeholder="世界名"
                className={`${INPUT_LINE} h-8`}
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm text-ink">分区</span>
              <div className="grid grid-cols-2 gap-2">
                {SECTION_OPTIONS.map((option) => {
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
                      onClick={() => toggleSection(option.key)}
                      className={`flex h-8 items-center justify-between gap-1 border px-2.5 text-[12px] transition-colors ${ROUND_ITEM} ${
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
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm text-ink">纸色</span>
              {THEME_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2">
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                      themeChoice === option.value ? 'border-line-hover' : 'border-line'
                    }`}
                  >
                    {themeChoice === option.value ? <span className="h-1.5 w-1.5 rounded-full bg-ink" /> : null}
                  </span>
                  <input
                    type="radio"
                    name="site-theme"
                    value={option.value}
                    checked={themeChoice === option.value}
                    onChange={() => setThemeChoice(option.value)}
                    className="sr-only"
                  />
                  <span className="text-sm leading-none text-ink">{option.label}</span>
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <label className="flex items-center justify-between">
                <span className="text-sm text-ink">内联图片</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inlineImages}
                  onClick={() => setInlineImages((prev) => !prev)}
                  className={`${SWITCH_CLASSES.base} ${inlineImages ? SWITCH_CLASSES.on : SWITCH_CLASSES.off}`}
                >
                  <span
                    className={`${SWITCH_DOT} ${inlineImages ? 'translate-x-[18px] bg-paper' : 'translate-x-[2px]'}`}
                  />
                </button>
              </label>
              <span className="text-[11px] text-ink-faint">关闭后图片不随文件走</span>

              <div className="flex flex-col gap-1.5 border-t border-line pt-4">
                <span className="text-sm text-ink">预设</span>
                {presets.length > 0 ? (
                  <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto">
                    {presets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyPreset(preset)}
                          className="min-w-0 flex-1 truncate rounded-item px-1 py-0.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
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
                          aria-label={`将${preset.name}设为默认预设`}
                          aria-pressed={settings.defaultSitePresetId === preset.id}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
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
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-ink-faint transition-colors hover:bg-[var(--oc-hover)] hover:text-ink"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
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
          </aside>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3">
          {error !== '' ? (
            <p role="alert" className="min-w-0 flex-1 truncate text-[12px] text-error">
              {error}
            </p>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <button type="button" onClick={onClose} className={BTN_QUIET}>
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!ready || busy}
            className={`${BTN_PRIMARY} ${!ready || busy ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {busy ? '正在导出…' : '导出 index.html'}
          </button>
        </div>
      </div>
    </div>
  )

  return overlayRoot ? createPortal(content, overlayRoot) : content
}
