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
  /** 照片高度：画布高 % */
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

/** 混色来源：自动取色 / 墨色（黑白） */
export type CoverTintMode = 'auto' | 'ink'

export const COVER_TINT_MODE_OPTIONS: { label: string; value: CoverTintMode }[] = [
  { label: '彩色', value: 'auto' },
  { label: '黑白', value: 'ink' },
]

/** 默认值 = 参考实现（Simple_Cover）的参数，卡片比例按网格调整为 4:5 */
export const COVER_TUNING_DEFAULTS: CoverTuning = {
  aspect: 0.8,
  inset: 0,
  photoHeight: 66,
  blurStart: 48,
  blur: 42,
  mixStart: 54,
  mixPoint: 73,
  grain: 28,
  textBottom: 6.5,
  textLeft: 6.5,
  textRight: 6.5,
  titleScale: 8.6,
  titleMax: 28,
  introSize: 12,
  metaSize: 10,
}

/** 滑杆的范围、步长与名字 —— 面板据此生成控件，`sanitize` 据此夹取 */
export type CoverSliderKey = Exclude<keyof CoverTuning, 'aspect'>

export const COVER_TUNING_RANGES: Record<CoverSliderKey, CoverTuningRange> = {
  inset: { label: '照片留边', min: 0, max: 12, step: 0.5, unit: '%' },
  photoHeight: { label: '照片高度', min: 40, max: 95, step: 1, unit: '%' },
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

/** 卡片比例的可选项：按钮里显示的就是这个标签 */
export const COVER_ASPECT_OPTIONS: { label: string; value: number }[] = [
  { label: '3:4', value: 0.75 },
  { label: '4:5', value: 0.8 },
  { label: '1:1', value: 1 },
  { label: '5:4', value: 1.25 },
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
    if (stored) tuning = sanitizeCoverTuning(JSON.parse(stored))
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning))
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
