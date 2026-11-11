"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { invoke } from "@tauri-apps/api/core"
import { isTauri } from "./env"
import { readBlurPreference } from "./blur-preference"
import { DEFAULT_SIDEBAR_WIDTH, clampSidebarWidth } from "./sidebar-width"
import type { EditorLayout } from "./editor-layout"
import type { CoverTintMode } from "./cover/tuning"
import { normalizeTintMode } from "./cover/tuning"
import { normalizeEdgeStyle, type EdgeStyle } from "./edge-style"
import { normalizeThemePreset, type ThemePresetId } from "./theme/presets"
import { applyThemePreset } from "./theme/apply"
import { applyAppBackground, normalizeBackgroundMode, normalizeBackgroundScrim, type BackgroundMode } from "./theme/background"

const STORAGE_KEY = "oc-studio-settings"

export interface Settings {
  theme: "light" | "dark" | "auto"
  /** 官方主题（只换纸色 / 墨色 / 线色，见 `lib/theme/presets.ts` 与 `docs/主题.md`） */
  themePreset: ThemePresetId
  /** 应用级背景图（压缩后的 data URL；空 = 无背景） */
  backgroundImage: string
  backgroundMode: BackgroundMode
  /** 背景遮罩强度：0.15–0.75，越高越能读字 */
  backgroundScrim: number
  cloudSyncEnabled: boolean
  syncServerUrl: string
  autoStart: boolean
  sidebarVisible: boolean
  sidebarWidth: number
  /** 编辑界面样式；默认「自动」（≥1280 多栏，否则全屏） */
  editorLayout: EditorLayout
  /**
   * 关系图鼠标模式（docs/关系图.md §6.1，来自 PR #5 的框选能力）
   * - `left-pan`：左键拖动画布平移，Shift + 拖动框选（默认，和大多数画布一致）
   * - `right-pan`：右键拖动画布平移，左键直接框选
   */
  mouseMode: 'left-pan' | 'right-pan'
  /** 关系图边型：正交（默认）/ 曲线，见 `EdgeStyle` */
  edgeStyle: EdgeStyle
  /** 时间线密度：简 = 只有标题；详 = 标题 + 时间 + 参与者数量 */
  timelineDetail: "simple" | "detailed"
  /** 时间线是否显示参与者轨道（窄屏 / 只看事件时可以关掉） */
  timelineShowTracks: boolean
  /**
   * 封面卡（角色 / 国家 / 事件网格）的混色来源：
   * - `auto` 从封面图里取色（有彩度跟着图走，无彩度转中性）
   * - `ink`  固定用设计令牌的墨色，即黑白封面
   */
  coverTintMode: CoverTintMode
  /** 默认海报预设 id（`.ocstudio/exports.json` 的 image 段） */
  defaultImagePresetId: string
  /** 默认网站预设 id（`.ocstudio/exports.json` 的 site 段） */
  defaultSitePresetId: string
  /** 默认导出中心海报预设 id（`.ocstudio/exports.json` 的 poster 段） */
  defaultPosterPresetId: string
  /**
   * 回收站自动清理周期（天）：`7` / `30` / `0`（从不）。
   *
   * 删掉的笔记会被移到 `.ocstudio/trash/<批次>/`，**清理只由这个设置驱动**：
   * 打开笔记库 / 改这个值时会删掉过期批次，其余时候不动手。
   */
  trashRetentionDays: number
}

const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  themePreset: "paper",
  backgroundImage: "",
  backgroundMode: "cover",
  backgroundScrim: 0.35,
  cloudSyncEnabled: false,
  syncServerUrl: "",
  autoStart: false,
  sidebarVisible: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  editorLayout: "auto",
  mouseMode: "left-pan",
  edgeStyle: "orthogonal",
  timelineDetail: "simple",
  timelineShowTracks: true,
  coverTintMode: "auto",
  defaultImagePresetId: "",
  defaultSitePresetId: "",
  defaultPosterPresetId: "",
  // 默认 30 天：跟以前界面上写的「可在 30 天内恢复」对上，只是现在真的会清
  trashRetentionDays: 30,
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      const merged = { ...DEFAULT_SETTINGS, ...parsed }
      return {
        ...merged,
        sidebarWidth: clampSidebarWidth(merged.sidebarWidth),
        // 手改过 localStorage 的旧值不让它把「边型」带到非法状态（非法一律回正交）
        edgeStyle: normalizeEdgeStyle(merged.edgeStyle),
        // 时间线密度只认两档，旧值 / 坏值回「简」
        timelineDetail: merged.timelineDetail === "detailed" ? "detailed" : "simple",
        timelineShowTracks: merged.timelineShowTracks !== false,
        // 老版本存的是 ink（固定墨色），现在黑白跟主题走
        coverTintMode: normalizeTintMode(merged.coverTintMode),
        // 手删过主题 / 导入坏值时不要留一个没有令牌的界面
        themePreset: normalizeThemePreset(merged.themePreset),
        backgroundImage: typeof merged.backgroundImage === "string" ? merged.backgroundImage : "",
        backgroundMode: normalizeBackgroundMode(merged.backgroundMode),
        backgroundScrim: normalizeBackgroundScrim(merged.backgroundScrim),
        defaultImagePresetId: typeof merged.defaultImagePresetId === 'string' ? merged.defaultImagePresetId : '',
        defaultSitePresetId: typeof merged.defaultSitePresetId === 'string' ? merged.defaultSitePresetId : '',
        defaultPosterPresetId:
          typeof merged.defaultPosterPresetId === 'string' ? merged.defaultPosterPresetId : '',
        // 只认 7 / 30 / 0（从不）；坏值回落 30
        trashRetentionDays: [7, 30, 0].includes(merged.trashRetentionDays) ? merged.trashRetentionDays : 30,
      }
    }
  } catch {
    // corrupted data, fall through
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // storage full or unavailable
  }
}

interface SettingsContextValue {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
})

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      const isDark = settings.theme === "auto" ? prefersDark : settings.theme === "dark"

      root.classList.toggle("dark", isDark)
      root.setAttribute("data-theme", isDark ? "dark" : "light")
      applyThemePreset(settings.themePreset, isDark)
      applyAppBackground(
        settings.backgroundImage,
        settings.backgroundMode,
        settings.backgroundScrim,
        isDark,
      )

      if (isTauri()) {
        try {
          const enabled = readBlurPreference()
          invoke<boolean>("update_blur_effect", { enabled, isDark })
            .then((applied) => {
              root.classList.toggle("tauri-mica", applied)
            })
            .catch(() => {})
        } catch {}
      }
    }
    applyTheme()

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (settings.theme === "auto") applyTheme()
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [
    settings.theme,
    settings.themePreset,
    settings.backgroundImage,
    settings.backgroundMode,
    settings.backgroundScrim,
  ])

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}
