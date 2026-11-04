/**
 * 封面卡参数 —— 一个可以实时拖的调试面板的**唯一数据源**。
 *
 * 版式数字本来写死在 `scene.ts` / `ui-tokens.ts` 里，改一次要看一次效果。这里把它们
 * 摊成一份可持久化的参数：面板（`CoverTuningPanel`）负责改，卡片订阅后重画。
 * 视口之外的面板入口在「视图」菜单，快捷键 `Ctrl/Cmd + Shift + K`。
 *
 * 值一律用**百分比整数**（相对画布宽或高），只有字号用 px / cqw —— 这样面板上的
 * 数字和代码里的注释一眼能对上。
 */

import { useSyncExternalStore } from 'react'

export interface CoverTuning {
  /** 卡片比例：宽 / 高 */
  aspect: number
  /** 照片左右留边：画布宽 %（0 = 满幅） */
  inset: number
  /** 照片高度上限：画布高 %（照片按宽度铺满后的自然高度超了才裁上下） */
  photoHeight: number
  /** 模糊起点：画布高 % */
  blurStart: number
  /** 模糊强度：1080 宽下的 px */
  blur: number
  /** 混色起点：画布高 % */
  mixStart: number
  /** 混色完成：画布高 % */
  mixPoint: number
  /** 颗粒 0–100 */
  grain: number
  /** 文字块底边距：画布高 % */
  textBottom: number
  /** 文字块左边距：画布宽 % */
  textLeft: number
  /** 文字块右边距：画布宽 % */
  textRight: number
  /** 标题字号：卡片宽度的 %（cqw） */
  titleScale: number
  /** 标题字号上限：px */
  titleMax: number
  /** 简介字号：px */
  introSize: number
  /** 小字字号：px */
  metaSize: number
}

export interface CoverTuningRange {
  label: string
  min: number
  max: number
  step: number
  unit: string
}

/** 混色来源：自动取色（彩色）/ 跟随主题的纸色·墨色（黑白） */
export type CoverTintMode = 'auto' | 'mono'

export const COVER_TINT_MODE_OPTIONS: { label: string; value: CoverTintMode }[] = [
  { label: '彩色', value: 'auto' },
  { label: '黑白', value: 'mono' },
]

/** 老版本存过 `ink`，读到就当成 `mono`（黑白现在跟主题走，不再固定墨色） */
export function normalizeTintMode(value: unknown): CoverTintMode {
  if (value === 'auto' || value === 'mono') return value
  if (value === 'ink') return 'mono'
  return 'auto'
}

/**
 * 默认值 = 2026-11-04 定稿的参数，起点仍是参考实现 Simple_Cover。
 *
 * 比例 **7:6**（≈1.17）：头图基本都是横向的，卡片就按接近原图的比例来，**左右不裁**
 * —— 见 `scene.ts` 的 `photoPlateHeight`：照片只按宽度铺满，横图自己就矮，
 * 下面那段正好留给色块与文字。照片高度上限给到 100%，所以常见横图一点不裁。
 * 其余差别：混色更早开始（51%）也更晚收完（88%）、颗粒更重（57%）、
 * 字号更克制（标题上限 24px）。
 */
export const COVER_TUNING_DEFAULTS: CoverTuning = {
  aspect: 7 / 6,
  inset: 0,
  photoHeight: 100,
  blurStart: 47,
  blur: 30,
  mixStart: 51,
  mixPoint: 88,
  grain: 57,
  textBottom: 5,
  textLeft: 6.5,
  textRight: 6.5,
  titleScale: 8,
  titleMax: 24,
  introSize: 12,
  metaSize: 10,
}

/** 参数结构的版本：改默认值时 +1，老的面板数据直接作废（否则用户永远看不到新默认值） */
const COVER_TUNING_VERSION = 3

/** 滑杆的范围、步长与名字 —— 面板据此生成控件，`sanitize` 据此夹取 */
export type CoverSliderKey = Exclude<keyof CoverTuning, 'aspect'>

export const COVER_TUNING_RANGES: Record<CoverSliderKey, CoverTuningRange> = {
  inset: { label: '照片留边', min: 0, max: 12, step: 0.5, unit: '%' },
  photoHeight: { label: '照片高度上限', min: 40, max: 100, step: 1, unit: '%' },
  blurStart: { label: '模糊起点', min: 10, max: 85, step: 1, unit: '%' },
  blur: { label: '模糊强度', min: 0, max: 80, step: 1, unit: 'px' },
  mixStart: { label: '混色起点', min: 20, max: 90, step: 1, unit: '%' },
  mixPoint: { label: '混色完成', min: 40, max: 98, step: 1, unit: '%' },
  grain: { label: '颗粒', min: 0, max: 100, step: 1, unit: '%' },
  textBottom: { label: '文字底边距', min: 0, max: 40, step: 0.5, unit: '%' },
  textLeft: { label: '文字左边距', min: 0, max: 20, step: 0.5, unit: '%' },
  textRight: { label: '文字右边距', min: 0, max: 20, step: 0.5, unit: '%' },
  titleScale: { label: '标题字号', min: 3, max: 16, step: 0.1, unit: 'cqw' },
  titleMax: { label: '标题上限', min: 12, max: 52, step: 1, unit: 'px' },
  introSize: { label: '简介字号', min: 8, max: 22, step: 1, unit: 'px' },
  metaSize: { label: '小字字号', min: 7, max: 18, step: 1, unit: 'px' },
}

/** 卡片比例的可选项：按钮里显示的就是这个标签。全部是横的或方的 —— 竖起来会裁掉横图大半 */
export const COVER_ASPECT_OPTIONS: { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '7:6', value: 7 / 6 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
]

const STORAGE_KEY = 'oc-cover-tuning'
const PANEL_KEY = 'oc-cover-tuning-open'

let tuning: CoverTuning = COVER_TUNING_DEFAULTS
let panelOpen = false
let loaded = false
const listeners = new Set<() => void>()

function clampNumber(value: unknown, range: CoverTuningRange, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(range.max, Math.max(range.min, value))
}

/** 外部写入（老版本存的参数 / 手改过的 JSON）一律过一遍夹取 */
export function sanitizeCoverTuning(raw: unknown): CoverTuning {
  const next = { ...COVER_TUNING_DEFAULTS }
  if (typeof raw !== 'object' || raw === null) return next
  const record = raw as Record<string, unknown>
  const aspect = record.aspect
  if (typeof aspect === 'number' && aspect >= 0.5 && aspect <= 1.6) next.aspect = aspect
  for (const key of Object.keys(COVER_TUNING_RANGES) as (keyof typeof COVER_TUNING_RANGES)[]) {
    next[key] = clampNumber(record[key], COVER_TUNING_RANGES[key], next[key])
  }
  return next
}

function ensureLoaded(): void {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as { version?: number } & Record<string, unknown>
      // 老版本的面板数据作废：默认值改过一次，留着它用户就永远看不到定稿的版式
      if (parsed.version === COVER_TUNING_VERSION) tuning = sanitizeCoverTuning(parsed)
    }
    panelOpen = window.localStorage.getItem(PANEL_KEY) === '1'
  } catch {
    // 存的是坏数据就用默认值，不要因此打不开列表
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function persist(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: COVER_TUNING_VERSION, ...tuning }),
    )
    window.localStorage.setItem(PANEL_KEY, panelOpen ? '1' : '0')
  } catch {
    // 隐私模式写不进去：参数只在本次会话生效
  }
}

export function getCoverTuning(): CoverTuning {
  ensureLoaded()
  return tuning
}

/** 服务端渲染只有默认值：`useSyncExternalStore` 会在水合后切到真实值 */
export function getCoverTuningServerSnapshot(): CoverTuning {
  return COVER_TUNING_DEFAULTS
}

export function subscribeCoverTuning(listener: () => void): () => void {
  ensureLoaded()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function updateCoverTuning(patch: Partial<CoverTuning>): void {
  ensureLoaded()
  tuning = sanitizeCoverTuning({ ...tuning, ...patch })
  persist()
  emit()
}

export function resetCoverTuning(): void {
  tuning = COVER_TUNING_DEFAULTS
  persist()
  emit()
}

export function getCoverTuningPanelOpen(): boolean {
  ensureLoaded()
  return panelOpen
}

export function setCoverTuningPanelOpen(open: boolean): void {
  ensureLoaded()
  if (panelOpen === open) return
  panelOpen = open
  persist()
  emit()
}

export function toggleCoverTuningPanel(): void {
  setCoverTuningPanelOpen(!getCoverTuningPanelOpen())
}

/** 给用户复制的就是这段（面板里也能直接选中） */
export function coverTuningJson(): string {
  return JSON.stringify(tuning, null, 2)
}

export function useCoverTuning(): CoverTuning {
  return useSyncExternalStore(subscribeCoverTuning, getCoverTuning, getCoverTuningServerSnapshot)
}

export function useCoverTuningPanelOpen(): boolean {
  return useSyncExternalStore(
    subscribeCoverTuning,
    getCoverTuningPanelOpen,
    () => false,
  )
}
