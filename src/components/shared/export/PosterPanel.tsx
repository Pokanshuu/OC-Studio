'use client'

/**
 * 导出中心 · 海报页签。
 *
 * 左预览 / 右配置：对象 → 版式 → 画布 → 封面与图片 → 正文内容（勾选 + 排序）
 * → 排版参数 → 预设。所有选项即时生效，预览与导出用同一个 `PosterCanvas`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCcw, Search } from 'lucide-react'
import { DragHandle, SortableList, moveId, useSortableItem } from '@/components/shared/list-dnd'
import { toPng } from 'html-to-image'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { PosterCanvas } from '@/components/shared/poster/PosterCanvas'
import { POSTER_TEMPLATES } from '@/components/shared/poster/registry'
import {
  BUILTIN_POSTER_PRESETS,
  deletePosterPreset,
  loadExportPresets,
  savePosterPreset,
  type PosterExportPreset,
} from '@/lib/export/presets'
import {
  POSTER_BACKGROUND_LABELS,
  POSTER_BLOCK_LABELS,
  POSTER_BLOCK_SWITCH,
  POSTER_COVER_POSITION_CENTER,
  POSTER_COVER_ZOOM_MAX,
  POSTER_COVER_ZOOM_MIN,
  POSTER_PADDING_IDS,
  POSTER_RATIO_IDS,
  POSTER_RATIOS,
  enabledPosterBlocks,
  hasCustomCoverFraming,
  type PosterBackground,
  type PosterBlockId,
  type PosterCoverPlacement,
  type PosterOptions,
} from '@/lib/export/poster/types'
import {
  normalizePosterOptions,
  optionsForTemplate,
  posterTemplateDefaults,
  type PosterInfoHints,
} from '@/lib/export/poster/options'
import { getTemplates } from '@/lib/templates/store'
import { getFieldConfig } from '@/lib/fields/store'
import { templateFieldTypes } from '@/lib/templates/fields'
import {
  listPosterSubjects,
  loadPosterSubject,
  POSTER_SUBJECT_KINDS,
  POSTER_SUBJECT_LABELS,
  type PosterSubject,
  type PosterSubjectBundle,
  type PosterSubjectKind,
} from '@/lib/export/poster/subjects'
import { downloadMediaFile } from '@/lib/media-download'
import { useSettings } from '@/lib/settings'
import { BTN_PRIMARY, INPUT_LINE, ROUND_CONTROL, ROUND_ITEM } from '@/lib/ui-tokens'
import {
  ExportRow,
  ExportSection,
  PresetRow,
  Segmented,
  Slider,
  Swatch,
} from './controls'
import { ExportPanelLayout } from './ExportPanelLayout'

const STORAGE_KEY = 'oc-poster-export'

const COVER_PLACEMENT_LABELS: Record<PosterCoverPlacement, string> = {
  auto: '自动',
  top: '顶部',
  left: '左侧',
  right: '右侧',
  background: '满幅',
  hidden: '不显示',
}

const PADDING_LABELS: Record<(typeof POSTER_PADDING_IDS)[number], string> = {
  compact: '紧凑',
  standard: '标准',
  loose: '宽松',
}

const ALIGN_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
] as const

const COLUMN_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 1, label: '1 列' },
  { value: 2, label: '2 列' },
] as const

const BACKGROUND_SWATCH: Record<PosterBackground, string> = {
  paper: 'bg-paper',
  transparent: 'bg-paper',
  ink: 'bg-ink',
  grid: 'bg-paper',
  gradient: 'bg-paper',
  cover: 'bg-paper-card',
}

/** 内容块的一行：手柄 + 勾选 + 名称（顺序拖动改，和设置里的字段表同一套手感）。 */
function PosterBlockRow({
  block,
  checked,
  onToggle,
}: {
  block: PosterBlockId
  checked: boolean
  onToggle: () => void
}) {
  const { setNodeRef, style, attributes, listeners } = useSortableItem(block, false)
  return (
    <div ref={setNodeRef} style={style} className="flex h-7 items-center gap-1">
      <DragHandle handleProps={{ attributes, listeners }} className="-ml-1" />
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className={`min-w-0 flex-1 truncate text-[12px] ${checked ? 'text-ink' : 'text-ink-faint'}`}>
        {POSTER_BLOCK_LABELS[block]}
      </span>
    </div>
  )
}

function swatchStyle(background: PosterBackground): React.CSSProperties {
  if (background === 'transparent') {
    return {
      backgroundImage:
        'linear-gradient(45deg, var(--oc-line) 25%, transparent 25%, transparent 75%, var(--oc-line) 75%), linear-gradient(45deg, var(--oc-line) 25%, transparent 25%, transparent 75%, var(--oc-line) 75%)',
      backgroundSize: '10px 10px',
      backgroundPosition: '0 0, 5px 5px',
    }
  }
  if (background === 'grid') {
    return {
      backgroundImage:
        'linear-gradient(to right, var(--oc-line) 1px, transparent 1px), linear-gradient(to bottom, var(--oc-line) 1px, transparent 1px)',
      backgroundSize: '7px 7px',
    }
  }
  if (background === 'gradient') {
    return {
      backgroundImage:
        'radial-gradient(90% 80% at 20% 10%, color-mix(in srgb, var(--oc-ink) 16%, transparent), transparent 60%)',
    }
  }
  if (background === 'cover') {
    return {
      backgroundImage:
        'linear-gradient(135deg, color-mix(in srgb, var(--oc-ink) 22%, transparent), transparent 70%)',
    }
  }
  return {}
}

/**
 * 海报选项：存过就用存的；**第一次打开**时把默认值跟编辑器模板对齐
 * （组件开关 / 正文块顺序），之后一切以导出面板为准。
 */
function loadStoredOptions(kind: PosterSubjectKind): PosterOptions {
  if (typeof window === 'undefined') return normalizePosterOptions(null)
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) return normalizePosterOptions(JSON.parse(raw) as unknown)
  } catch {
    return normalizePosterOptions(null)
  }
  return normalizePosterOptions({
    ...normalizePosterOptions(null),
    ...posterTemplateDefaults(kind, getTemplates(), posterInfoHints(kind)),
  })
}

/**
 * 海报的「时间 / 地点」开关默认值：跟编辑器的基本信息走。
 * 事件读字段表，词条读内置词条模板选中的基本信息组件（海报本来也只认内置模板）。
 */
function posterInfoHints(kind: PosterSubjectKind): PosterInfoHints {
  if (kind === 'event') {
    const ids = new Set(getFieldConfig().event.map((field) => field.id))
    return { time: ids.has('time') || ids.has('endTime'), location: ids.has('location') }
  }
  if (kind === 'world') {
    const doc = getTemplates().find((item) => item.id === 'entry')
    const types = doc === undefined ? {} : templateFieldTypes(doc) ?? {}
    const used = new Set(Object.values(types))
    return { time: used.has('time') || used.has('timeEnd'), location: used.has('place') }
  }
  return { time: false, location: false }
}

function safeFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 48)
  return cleaned === '' ? 'poster' : cleaned
}

/** 预览容器：按容器大小等比缩放 1080 宽的真实画布。 */
function PosterPreview({
  width,
  height,
  children,
}: {
  width: number
  height: number
  children: (scale: number) => React.ReactNode
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.3)

  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const measure = (): void => {
      const rect = element.getBoundingClientRect()
      setScale(Math.max(0.08, Math.min((rect.width - 56) / width, (rect.height - 56) / height, 0.62)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [width, height])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: 'center center' }}
      >
        {children(scale)}
      </div>
    </div>
  )
}

/** 预设高亮：整份选项一致才算「正在用这个预设」（只比版式 + 比例会让几个预设同时亮） */
function samePosterOptions(a: PosterOptions, b: PosterOptions): boolean {
  return JSON.stringify(normalizePosterOptions(a)) === JSON.stringify(normalizePosterOptions(b))
}

export function PosterPanel({
  initialSubject,
}: {
  initialSubject?: { kind: PosterSubjectKind; id: number }
}) {
  const { settings, updateSetting } = useSettings()
  const posterRef = useRef<HTMLDivElement | null>(null)

  const [kind, setKind] = useState<PosterSubjectKind>(initialSubject?.kind ?? 'character')
  const [options, setOptions] = useState<PosterOptions>(() => loadStoredOptions(kind))
  const [subjects, setSubjects] = useState<Record<PosterSubjectKind, PosterSubject[]> | null>(null)
  const [subjectId, setSubjectId] = useState<number | null>(initialSubject?.id ?? null)
  const [bundle, setBundle] = useState<PosterSubjectBundle | null>(null)
  const [search, setSearch] = useState('')
  const [presets, setPresets] = useState<PosterExportPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [busy, setBusy] = useState(false)
  const [subjectLoading, setSubjectLoading] = useState(false)

  const meta = POSTER_TEMPLATES.find((item) => item.id === options.template) ?? POSTER_TEMPLATES[0]
  const ratio = POSTER_RATIOS[options.ratio]

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
    } catch {
      // 隐私模式写不进去：选项只在本次会话生效
    }
  }, [options])

  useEffect(() => {
    let alive = true
    void listPosterSubjects()
      .then((next) => {
        if (!alive) return
        setSubjects(next)
        // 首屏默认落在第一个有内容的分类；有 initialSubject 就不动
        if (subjectId === null && initialSubject === undefined) {
          const firstKind = POSTER_SUBJECT_KINDS.find((item) => next[item].length > 0)
          if (firstKind) {
            setKind(firstKind)
            setSubjectId(next[firstKind][0].id)
          }
        }
      })
      .catch(() => {
        if (alive) setSubjects({ character: [], event: [], country: [], world: [] })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在挂载时读一次；后续选择由用户驱动
  }, [])

  // 默认预设只在打开面板时落一次。它挂在 `defaultImagePresetId` 上，但点「设为默认」
  // 也会改这个值 —— 每变一次就重新套用，会把用户刚调好的取景 / 字号当场抹掉。
  const defaultAppliedRef = useRef(false)
  useEffect(() => {
    void loadExportPresets()
      .then((file) => {
        setPresets(file.poster)
        if (defaultAppliedRef.current) return
        defaultAppliedRef.current = true
        const preset = [...BUILTIN_POSTER_PRESETS, ...file.poster].find(
          (item) => item.id === settings.defaultImagePresetId,
        )
        if (preset) setOptions(normalizePosterOptions(preset.options))
      })
      .catch(() => setPresets([]))
  }, [settings.defaultImagePresetId])

  useEffect(() => {
    if (subjectId === null) return
    let alive = true
    // 读一条对象是异步 IO；这里只是把「正在读取」告诉预览区
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubjectLoading(true)
    void loadPosterSubject(kind, subjectId)
      .then((next) => {
        if (!alive) return
        setBundle(next)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setBundle(null)
        toast.error('读取海报数据失败', {
          description: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        if (alive) setSubjectLoading(false)
      })
    return () => {
      alive = false
    }
  }, [kind, subjectId])

  const changeKind = (next: PosterSubjectKind): void => {
    setKind(next)
    setSearch('')
    const list = subjects?.[next] ?? []
    if (!list.some((item) => item.id === subjectId)) setSubjectId(list[0]?.id ?? null)
  }

  const list = useMemo(() => {
    const rows = subjects?.[kind] ?? []
    const keyword = search.trim().toLowerCase()
    if (keyword === '') return rows
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(keyword) || row.subtitle.toLowerCase().includes(keyword),
    )
  }, [subjects, kind, search])

  const setOption = <K extends keyof PosterOptions>(key: K, value: PosterOptions[K]): void => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const toggleBlock = (block: PosterBlockId): void => {
    const key = POSTER_BLOCK_SWITCH[block]
    setOptions((current) => ({ ...current, [key]: current[key] === false }))
  }

  const savePreset = async (): Promise<void> => {
    try {
      const next = await savePosterPreset(presetName, options)
      setPresets(next.poster)
      setPresetName('')
      toast.success('预设已保存')
    } catch (error) {
      toast.error('保存预设失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const removePreset = async (id: string): Promise<void> => {
    try {
      const next = await deletePosterPreset(id)
      setPresets(next.poster)
    } catch (error) {
      toast.error('删除预设失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const exportPng = useCallback(async (): Promise<void> => {
    if (bundle === null || posterRef.current === null || busy) return
    setBusy(true)
    try {
      await document.fonts.ready
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: 'transparent',
      })
      const name = `${safeFileName(bundle.data.title)}-${meta.name}.png`
      const saved = await downloadMediaFile(dataUrl, name)
      // 用户取消保存对话框：不弹「已导出」，那会让人以为文件已经在了
      if (saved === null) return
      toast.success('图片已导出', { description: saved })
    } catch (error) {
      toast.error('图片导出失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }, [bundle, busy, meta.name])

  const allPresets = [...BUILTIN_POSTER_PRESETS, ...presets]
  const activeBlockCount = enabledPosterBlocks(options).length
  const customFraming = hasCustomCoverFraming(options)
  const data = subjectId === null ? undefined : bundle?.data

  return (
    <ExportPanelLayout
      previewClassName="p-4"
      preview={
        <>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 text-[11px] text-ink-faint">
            <span className="truncate">
              {subjectLoading
                ? '正在读取…'
                : data
                  ? `${data.title} · ${meta.name}`
                  : '还没有可导出的内容'}
            </span>
            <span className="shrink-0 tabular-nums">
              {ratio.width} × {ratio.height}
            </span>
          </div>
          {/* 框底用 alt 表面：海报自身铺的是 `bg-paper`，同色时候纸的边界会看不见 */}
          <div
            className={`relative min-h-0 flex-1 overflow-hidden border border-line bg-paper-alt ${ROUND_CONTROL}`}
          >
            {data ? (
              <PosterPreview width={ratio.width} height={ratio.height}>
                {() => (
                  <PosterCanvas
                    data={data}
                    options={options}
                    onCoverAdjust={(patch) => setOptions((current) => ({ ...current, ...patch }))}
                  />
                )}
              </PosterPreview>
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-ink-faint">
                {subjectLoading ? '正在读取…' : '选一个角色 / 事件 / 国家 / 词条'}
              </div>
            )}
          </div>

          {/* 出图解用的画布离屏挂在预览里：和预览共用同一份选项，不另存一份状态 */}
          {data ? (
            <div style={{ position: 'fixed', left: -12000, top: 0, pointerEvents: 'none' }} aria-hidden>
              <PosterCanvas ref={posterRef} data={data} options={options} />
            </div>
          ) : null}
        </>
      }
      config={
        <>
          <ExportSection title="对象">
            <Segmented
              value={kind}
              ariaLabel="对象类型"
              options={POSTER_SUBJECT_KINDS.map((item) => ({
                value: item,
                label: `${POSTER_SUBJECT_LABELS[item]}${subjects ? ` ${subjects[item].length}` : ''}`,
              }))}
              onChange={changeKind}
            />
            <div className="relative">
              <Search size={13} strokeWidth={2} className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索"
                className={`${INPUT_LINE} h-7 pl-5`}
              />
            </div>
            <div className="flex max-h-44 flex-col gap-px overflow-y-auto">
              {list.length === 0 ? (
                <span className="px-1 py-1 text-[12px] text-ink-faint">没有匹配</span>
              ) : (
                list.map((subject) => {
                  const active = subject.id === subjectId && subject.kind === kind
                  return (
                    <button
                      key={`${subject.kind}-${subject.id}`}
                      type="button"
                      onClick={() => setSubjectId(subject.id)}
                      className={`${ROUND_ITEM} flex items-center gap-2 px-1.5 py-1 text-left transition-colors ${
                        active ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{subject.title}</span>
                      <span className="max-w-[45%] shrink-0 truncate text-[11px] text-ink-faint">
                        {subject.subtitle}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </ExportSection>

          <ExportSection title="版式">
            <div className="grid grid-cols-2 gap-1">
              {POSTER_TEMPLATES.map((template) => {
                const active = template.id === options.template
                return (
                  <button
                    key={template.id}
                    type="button"
                    data-poster-template={template.id}
                    aria-pressed={active}
                    onClick={() => setOptions((current) => optionsForTemplate(current, template.id))}
                    className={`${ROUND_ITEM} flex flex-col items-start gap-0.5 border px-2 py-1.5 text-left transition-colors ${
                      active
                        ? 'border-line-hover bg-[var(--oc-hover)]'
                        : 'border-line hover:bg-[var(--oc-hover)]'
                    }`}
                  >
                    <span className={`text-[12px] ${active ? 'font-medium text-ink' : 'text-ink'}`}>
                      {template.name}
                    </span>
                    <span className="text-[10px] text-ink-faint">{template.hint}</span>
                  </button>
                )
              })}
            </div>
          </ExportSection>

          <ExportSection title="画布">
            <ExportRow label="尺寸">
              <Segmented
                value={options.ratio}
                ariaLabel="画布尺寸"
                options={POSTER_RATIO_IDS.map((value) => ({
                  value,
                  label: POSTER_RATIOS[value].label,
                  title: POSTER_RATIOS[value].hint,
                }))}
                onChange={(value) => setOption('ratio', value)}
              />
            </ExportRow>
            <ExportRow label="留白">
              <Segmented
                value={options.padding}
                ariaLabel="留白"
                options={POSTER_PADDING_IDS.map((value) => ({ value, label: PADDING_LABELS[value] }))}
                onChange={(value) => setOption('padding', value)}
              />
            </ExportRow>
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[12px] text-ink-muted">背景</span>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(POSTER_BACKGROUND_LABELS) as PosterBackground[]).map((value) => (
                  <Swatch
                    key={value}
                    label={POSTER_BACKGROUND_LABELS[value]}
                    selected={options.background === value}
                    onSelect={() => setOption('background', value)}
                    swatchClass={BACKGROUND_SWATCH[value]}
                    swatchStyle={swatchStyle(value)}
                  />
                ))}
              </div>
            </div>
          </ExportSection>

          <ExportSection title="封面与图片">
            <ExportRow label="显示封面">
              <Checkbox checked={options.showCover} onCheckedChange={(checked) => setOption('showCover', checked === true)} />
            </ExportRow>
            <ExportRow label="位置">
              <Segmented
                value={options.coverPlacement}
                ariaLabel="封面位置"
                options={meta.coverPlacements.map((value) => ({ value, label: COVER_PLACEMENT_LABELS[value] }))}
                onChange={(value) => setOption('coverPlacement', value)}
              />
            </ExportRow>
            <ExportRow label="封面大小">
              <div className="w-40">
                <Slider
                  value={options.coverScale}
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  ariaLabel="封面大小"
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => setOption('coverScale', value)}
                />
              </div>
            </ExportRow>
            <ExportRow label="图片缩放">
              <div className="flex w-40 items-center gap-1.5">
                <Slider
                  value={options.coverZoom}
                  min={POSTER_COVER_ZOOM_MIN}
                  max={POSTER_COVER_ZOOM_MAX}
                  step={0.05}
                  ariaLabel="封面缩放"
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => setOption('coverZoom', value)}
                />
                {/* 复位占位固定：出现 / 消失时不把滑杆挤来挤去 */}
                <button
                  type="button"
                  aria-label="复位取景"
                  title="复位取景"
                  disabled={!customFraming}
                  aria-hidden={!customFraming}
                  tabIndex={customFraming ? 0 : -1}
                  onClick={() =>
                    setOptions((current) => ({
                      ...current,
                      coverZoom: 1,
                      coverX: POSTER_COVER_POSITION_CENTER,
                      coverY: POSTER_COVER_POSITION_CENTER,
                    }))
                  }
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-item text-ink-faint transition-colors hover:text-ink ${
                    customFraming ? '' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <RotateCcw size={12} strokeWidth={2} />
                </button>
              </div>
            </ExportRow>
            <ExportRow label="标题字号">
              <div className="w-40">
                <Slider
                  value={options.titleScale}
                  min={0.8}
                  max={1.4}
                  step={0.05}
                  ariaLabel="标题字号"
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => setOption('titleScale', value)}
                />
              </div>
            </ExportRow>
            <ExportRow label="整版字号">
              <div className="w-40">
                <Slider
                  value={options.fontScale}
                  min={0.7}
                  max={1.5}
                  step={0.05}
                  ariaLabel="整版字号"
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => setOption('fontScale', value)}
                />
              </div>
            </ExportRow>
          </ExportSection>

          <ExportSection title="文字排版">
            <ExportRow label="对齐">
              <Segmented
                value={options.align}
                ariaLabel="文字对齐"
                options={ALIGN_OPTIONS}
                onChange={(value) => setOption('align', value)}
              />
            </ExportRow>
            <ExportRow label="字段列数">
              <Segmented
                value={options.fieldColumns}
                ariaLabel="字段列数"
                options={COLUMN_OPTIONS}
                onChange={(value) => setOption('fieldColumns', value)}
              />
            </ExportRow>
          </ExportSection>

          <ExportSection title={`内容 · ${activeBlockCount}`}>
            <ExportRow label="别名">
              <Checkbox checked={options.showAliases} onCheckedChange={(checked) => setOption('showAliases', checked === true)} />
            </ExportRow>
            <SortableList
              ids={options.blockOrder}
              layout="list"
              onReorder={(activeId, overId) =>
                setOptions((current) => ({
                  ...current,
                  blockOrder: moveId(
                    current.blockOrder,
                    activeId as PosterBlockId,
                    overId as PosterBlockId,
                  ),
                }))
              }
            >
              {options.blockOrder.map((block) => (
                <PosterBlockRow
                  key={block}
                  block={block}
                  checked={options[POSTER_BLOCK_SWITCH[block]] !== false}
                  onToggle={() => toggleBlock(block)}
                />
              ))}
            </SortableList>
            <ExportRow label="署名">
              <Checkbox checked={options.showSignature} onCheckedChange={(checked) => setOption('showSignature', checked === true)} />
            </ExportRow>
            {options.showSignature ? (
              <input
                value={options.signature}
                onChange={(event) => setOption('signature', event.target.value)}
                maxLength={40}
                placeholder="OC Studio"
                className={`${INPUT_LINE} h-7`}
              />
            ) : null}
          </ExportSection>

          <ExportSection title="预设">
            <div className="flex max-h-32 flex-col gap-px overflow-y-auto">
              {allPresets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  name={preset.name}
                  builtin={preset.builtin}
                  isDefault={settings.defaultImagePresetId === preset.id}
                  active={samePosterOptions(preset.options, options)}
                  onApply={() => setOptions(normalizePosterOptions(preset.options))}
                  onSetDefault={() =>
                    updateSetting(
                      'defaultImagePresetId',
                      settings.defaultImagePresetId === preset.id ? '' : preset.id,
                    )
                  }
                  onDelete={() => void removePreset(preset.id)}
                />
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
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
            PNG · 2× · {ratio.width} × {ratio.height}
          </span>
          <button
            type="button"
            onClick={() => void exportPng()}
            disabled={data === undefined || busy}
            className={`${BTN_PRIMARY} ${data === undefined || busy ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Download size={14} strokeWidth={2} />
            {busy ? '正在生成…' : '导出 PNG'}
          </button>
        </>
      }
    />
  )
}
