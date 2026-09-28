"use client"

import { useState, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Database, Cpu, Info, BookOpen } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useSettings } from "@/lib/settings"
import { useDevice } from "@/lib/use-device"
import { isTauri as isTauriEnv } from "@/lib/env"
import { APP_VERSION } from "@/lib/version"
import { useImportExport } from "@/components/shared/ImportExportUI"
import { useInputContextMenu } from "@/lib/use-input-context-menu"
import { useProjectMeta } from "@/features/project"
import { ImageUploader } from "@/components/shared/ImageUploader"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: string
  onTabChange: (tab: string) => void
}

const TAB_ITEMS = [
  { value: "world", label: "世界", icon: BookOpen },
  { value: "general", label: "通用", icon: Cpu },
  { value: "data", label: "数据", icon: Database },
  { value: "ai", label: "AI", icon: Cpu },
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
            className={`relative flex h-4 w-4 shrink-0 items-center justify-center border ${
              value === opt.value ? "border-line-hover" : "border-line"
            } bg-black/5 dark:bg-white/5`}
          >
            {value === opt.value && (
              <div className="h-2 w-2 bg-ink-muted" />
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
  base: "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border transition-colors",
  on: "border-line-hover bg-ink-muted",
  off: "border-line bg-black/5 dark:bg-white/5",
}

const SWITCH_DOT =
  "block h-3.5 w-3.5 transition-transform bg-ink-muted"

export function SettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: SettingsDialogProps) {
  const { settings, updateSetting } = useSettings()
  const { isMobile } = useDevice()
  const { handleExport, handleImportClick, dialog: importExportDialog } =
    useImportExport()

  const [blurEnabled, setBlurEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("blur-effect-enabled") === "true"
  })

  const [blurSupported, setBlurSupported] = useState(false)

  const isTauri = isTauriEnv()

  const toggleDisabled = !isTauri || !blurSupported

  const apiKeyRef = useInputContextMenu()
  const aiModelRef = useInputContextMenu()
  const aiBaseUrlRef = useInputContextMenu()
  const syncServerUrlRef = useInputContextMenu()
  const worldNameRef = useInputContextMenu()
  const taglineRef = useInputContextMenu()

  const { meta, loading: metaLoading, save: saveMeta } = useProjectMeta()
  const [worldName, setWorldName] = useState('')
  const [tagline, setTagline] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const touchedRef = useRef(false)

  // 打开对话框时回填；用户一旦编辑过就不再回写，避免打字过程中被异步结果覆盖
  useEffect(() => {
    if (!open || metaLoading || touchedRef.current) return
    setWorldName(meta.worldName)
    setTagline(meta.tagline)
    setCoverUrl(meta.coverUrl)
  }, [open, metaLoading, meta])

  // 关闭后重置「已编辑」标记，下次打开重新同步
  useEffect(() => {
    if (!open) touchedRef.current = false
  }, [open])

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

        <Tabs value={tab} onValueChange={onTabChange}>
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-5">
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
            {/* ---- world ---- */}
            <TabsContent value="world">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">世界名称</label>
                  <input
                    ref={worldNameRef}
                    type="text"
                    value={worldName}
                    onChange={(e) => {
                      touchedRef.current = true
                      setWorldName(e.target.value)
                      void saveMeta({ worldName: e.target.value })
                    }}
                    placeholder="例如：灰烬纪元"
                    className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">一句话简介</label>
                  <input
                    ref={taglineRef}
                    type="text"
                    value={tagline}
                    onChange={(e) => {
                      touchedRef.current = true
                      setTagline(e.target.value)
                      void saveMeta({ tagline: e.target.value })
                    }}
                    placeholder="例如：当最后一座浮空城坠落，大地只剩下灰与余烬。"
                    className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-ink">封面</span>
                  <ImageUploader
                    value={coverUrl}
                    onChange={(path) => {
                      touchedRef.current = true
                      setCoverUrl(path)
                      void saveMeta({ coverUrl: path })
                    }}
                    onRemove={() => {
                      touchedRef.current = true
                      setCoverUrl('')
                      void saveMeta({ coverUrl: '' })
                    }}
                    aspectRatio="3:2"
                    placeholderText="上传封面"
                    size="lg"
                  />
                </div>
              </div>
            </TabsContent>

            {/* ---- general ---- */}
            <TabsContent value="general">
              <div className="flex flex-col gap-5">
                <label className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">开机自启动</span>
                    {isMobile ? (
                      <span className="text-xs text-ink-faint">桌面端支持</span>
                    ) : null}
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.autoStart}
                    disabled={isMobile}
                    onClick={() =>
                      updateSetting("autoStart", !settings.autoStart)
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.autoStart ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                    } ${isMobile ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                      {isMobile ? (
                        <span className="text-xs text-ink-faint">桌面端支持</span>
                      ) : null}
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
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportClick}
                    className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                  >
                    导入数据...
                  </button>
                  <button
                    onClick={handleExport}
                    className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
                  >
                    导出所有数据 (JSON)
                  </button>
                  <button
                    disabled
                    className="inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink-faint cursor-not-allowed"
                  >
                    发布为静态网站...
                  </button>
                  <p className="text-xs text-ink-faint mt-1">注：导出不含图片文件，仅包含文本数据</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <span className="text-sm text-ink">云同步</span>
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
                <label className="flex items-center justify-between">
                  <span className="text-sm text-ink">启用AI概括功能</span>
                  <button
                    role="switch"
                    aria-checked={settings.aiEnabled}
                    onClick={() =>
                      updateSetting("aiEnabled", !settings.aiEnabled)
                    }
                    className={`${SWITCH_CLASSES.base} ${
                      settings.aiEnabled ? SWITCH_CLASSES.on : SWITCH_CLASSES.off
                    }`}
                  >
                    <span
                      className={`${SWITCH_DOT} ${
                        settings.aiEnabled
                          ? "translate-x-[18px] bg-paper"
                          : "translate-x-[2px]"
                      }`}
                    />
                  </button>
                </label>

                {settings.aiEnabled ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-ink">API Key</label>
                      <input
                        ref={apiKeyRef}
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => updateSetting("apiKey", e.target.value)}
                        placeholder="sk-...（从 platform.deepseek.com 获取）"
                        className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                      />
                      <span className="text-xs text-ink-faint">
                        密钥仅存储在本地，不会上传到任何服务器
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-ink">AI 模型</label>
                      <input
                        ref={aiModelRef}
                        type="text"
                        value={settings.aiModel}
                        onChange={(e) => updateSetting("aiModel", e.target.value)}
                        placeholder="deepseek-v4-flash"
                        className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm text-ink">Base URL</label>
                      <input
                        ref={aiBaseUrlRef}
                        type="text"
                        value={settings.aiBaseUrl}
                        onChange={(e) =>
                          updateSetting("aiBaseUrl", e.target.value)
                        }
                        placeholder="https://api.deepseek.com"
                        className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                      />
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">同步服务端地址（开发中...）</label>
                  <input
                    ref={syncServerUrlRef}
                    type="text"
                    value={settings.syncServerUrl}
                    onChange={(e) =>
                      updateSetting("syncServerUrl", e.target.value)
                    }
                    placeholder="https://your-sync-server.com"
                    className="h-8 w-full border-b border-line bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
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
                    v{APP_VERSION}
                  </span>
                </div>
                <button
                  disabled
                  className="inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink-faint cursor-not-allowed"
                >
                  检查更新
                </button>
                <a
                  href="https://github.com/Pokanshuu/OC-Studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink transition-colors hover:bg-[var(--oc-hover)]"
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
            className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink-muted transition-colors hover:text-ink"
          >
            关闭
          </button>
        </div>
      </DialogContent>
      {importExportDialog}
    </Dialog>
  )
}
