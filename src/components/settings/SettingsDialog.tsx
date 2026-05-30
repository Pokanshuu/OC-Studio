"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Database, Cpu, Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useSettings } from "@/lib/settings"
import { useImportExport } from "@/components/shared/ImportExportUI"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: string
}

const TAB_ITEMS = [
  { value: "general", label: "通用", icon: Cpu },
  { value: "data", label: "数据与同步", icon: Database },
  { value: "ai", label: "AI 与云", icon: Cpu },
  { value: "about", label: "关于", icon: Info },
] as const

const THEME_OPTIONS = [
  { value: "light", label: "白天模式" },
  { value: "dark", label: "夜间模式" },
  { value: "auto", label: "跟随系统" },
] as const

function ThemeRadio({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-3">
      {THEME_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2 cursor-pointer"
        >
          <div
            className={`relative flex items-center justify-center rounded-full border h-4 w-4 shrink-0 ${
              value === opt.value ? "border-line-hover" : "border-line"
            } bg-black/5 dark:bg-white/5`}
          >
            {value === opt.value && (
              <div className="h-2 w-2 rounded-full bg-ink-muted" />
            )}
          </div>
          <input
            type="radio"
            name="theme"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
          />
          <span className="text-sm text-ink">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

const SWITCH_CLASSES = {
  base: "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors",
  on: "border-line-hover bg-ink-muted",
  off: "border-line bg-black/5 dark:bg-white/5",
}

const SWITCH_DOT =
  "block h-3.5 w-3.5 rounded-full transition-transform bg-ink-muted"

export function SettingsDialog({
  open,
  onOpenChange,
  defaultTab = "general",
}: SettingsDialogProps) {
  const { settings, updateSetting } = useSettings()
  const { handleExport, handleImportClick, dialog: importExportDialog } =
    useImportExport()
  const [tab, setTab] = useState(defaultTab)

  const [blurEnabled, setBlurEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("blur-effect-enabled") === "true"
  })

  const [blurSupported, setBlurSupported] = useState(false)

  const isTauri =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)

  const toggleDisabled = !isTauri || !blurSupported

  useEffect(() => {
    if (!isTauri) return
    try {
      invoke<boolean>('init_blur', { enabled: false, isDark: false }).then((supported) => {
        if (supported === true) setBlurSupported(true)
      }).catch(() => {})
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlurToggle = () => {
    if (toggleDisabled) return
    const next = !blurEnabled
    setBlurEnabled(next)
    try { localStorage.setItem("blur-effect-enabled", String(next)) } catch {}
    try {
      invoke<boolean>("update_blur_effect", {
        enabled: next,
        isDark: document.documentElement.classList.contains("dark"),
      }).then((applied) => {
        document.documentElement.classList.toggle("tauri-mica", applied)
      }).catch(() => {})
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-md:max-w-[calc(100%-2rem)] p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="flex flex-row items-center gap-3 px-6 pt-6 pb-2">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-4">
              {TAB_ITEMS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="flex items-center justify-center gap-1.5 text-xs sm:text-sm"
                >
                  <item.icon size={14} strokeWidth={2} className="shrink-0 sm:hidden" />
                  <span className="hidden sm:inline">{item.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="px-6 pb-6">
            {/* ---- general ---- */}
            <TabsContent value="general">
              <div className="flex flex-col gap-5">
                <label className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">开机自启动</span>
                    <span className="text-xs text-ink-faint">
                      应用程序将在系统启动时自动运行
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.autoStart}
                    onClick={() =>
                      updateSetting("autoStart", !settings.autoStart)
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.autoStart ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                    }`}
                  >
                    <span
                      className={`${SWITCH_DOT} ${
                        settings.autoStart
                          ? "translate-x-[18px] bg-paper"
                          : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-sm text-ink">主题</span>
                  <ThemeRadio
                    value={settings.theme}
                    onChange={(v) =>
                      updateSetting("theme", v as "light" | "dark" | "auto")
                    }
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2 border-t border-line">
                  <label className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-ink">
                        启用窗口模糊效果
                      </span>
                      <span className="text-xs text-ink-faint">
                        仅在桌面环境下生效
                      </span>
                    </div>
                    <button
                      role="switch"
                      aria-checked={blurEnabled}
                      disabled={toggleDisabled}
                      onClick={handleBlurToggle}
                      className={`${SWITCH_CLASSES.base} ${
                        blurEnabled ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                      } ${toggleDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`${SWITCH_DOT} ${
                          blurEnabled
                            ? "translate-x-[18px] bg-paper"
                            : "translate-x-[2px]"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </TabsContent>

            {/* ---- data ---- */}
            <TabsContent value="data">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-ink-muted">
                  管理您的创作数据。可以导出为常用格式备份，或发布为独立页面。
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportClick}
                    className="touch-feedback inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
                  >
                    导入数据...
                  </button>
                  <button
                    onClick={handleExport}
                    className="touch-feedback inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
                  >
                    导出所有数据 (JSON)
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-black/5 dark:bg-white/5 text-ink-muted cursor-not-allowed"
                  >
                    发布为静态网站...
                  </button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">云同步</span>
                    <span className="text-xs text-ink-faint">
                      开启后将自动同步数据到云端
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.cloudSyncEnabled}
                    onClick={() =>
                      updateSetting(
                        "cloudSyncEnabled",
                        !settings.cloudSyncEnabled
                      )
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.cloudSyncEnabled
                        ? SWITCH_CLASSES.on
                        : SWITCH_CLASSES.off
                    }`}
                  >
                    <span
                      className={`${SWITCH_DOT} ${
                        settings.cloudSyncEnabled
                          ? "translate-x-[18px] bg-paper"
                          : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </TabsContent>

            {/* ---- ai ---- */}
            <TabsContent value="ai">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">API Key</label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => updateSetting("apiKey", e.target.value)}
                    placeholder="sk-..."
                    className="h-9 w-full rounded border border-line bg-black/5 dark:bg-white/5 px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                  <span className="text-xs text-ink-faint">
                    密钥仅存储在本地，不会上传到任何服务器
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">AI 模型</label>
                  <input
                    type="text"
                    value={settings.aiModel}
                    onChange={(e) => updateSetting("aiModel", e.target.value)}
                    placeholder="gpt-4o"
                    className="h-9 w-full rounded border border-line bg-black/5 dark:bg-white/5 px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">Base URL</label>
                  <input
                    type="text"
                    value={settings.aiBaseUrl}
                    onChange={(e) =>
                      updateSetting("aiBaseUrl", e.target.value)
                    }
                    placeholder="https://api.openai.com/v1"
                    className="h-9 w-full rounded border border-line bg-black/5 dark:bg-white/5 px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">同步服务端地址</label>
                  <input
                    type="text"
                    value={settings.syncServerUrl}
                    onChange={(e) =>
                      updateSetting("syncServerUrl", e.target.value)
                    }
                    placeholder="https://your-sync-server.com"
                    className="h-9 w-full rounded border border-line bg-black/5 dark:bg-white/5 px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ---- about ---- */}
            <TabsContent value="about">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">版本</span>
                  <span className="text-sm text-ink-muted font-mono">
                    v0.1.6-alpha
                  </span>
                </div>
                <button
                  disabled
                  className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-black/5 dark:bg-white/5 text-ink-muted cursor-not-allowed"
                >
                  检查更新
                </button>
                <a
                  href="https://github.com/Pokanshuu/OC-Studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-feedback inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
                >
                  访问 GitHub 项目
                </a>
                <p className="text-xs text-ink-faint pt-2 border-t border-line">
                  OC Studio — 原创角色与世界观创作工作台
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end border-t border-line px-6 py-4">
          <button
            onClick={() => onOpenChange(false)}
            className="touch-feedback inline-flex items-center justify-center h-9 px-3 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
          >
            关闭
          </button>
        </div>
      </DialogContent>
      {importExportDialog}
    </Dialog>
  )
}
