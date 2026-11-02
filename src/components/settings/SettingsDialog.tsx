"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  Database,
  Cpu,
  Info,
  Lock,
  ShieldCheck,
  HardDrive,
  FileArchive,
  Copy,
  Music2,
  Tv,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useSettings } from "@/lib/settings"
import { useDevice } from "@/lib/use-device"
import { useImportExport } from "@/components/shared/ImportExportUI"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: string
}

const TAB_ITEMS = [
  { value: "general", label: "通用", icon: Cpu },
  { value: "data", label: "数据", icon: Database },
  { value: "privacy", label: "隐私", icon: Lock },
  { value: "about", label: "关于", icon: Info },
] as const

const THEME_OPTIONS = [
  { value: "light", label: "白天模式" },
  { value: "dark", label: "夜间模式" },
  { value: "auto", label: "跟随系统" },
] as const

const MOUSE_MODE_OPTIONS = [
  {
    value: "right-pan",
    label: "右键平移 · 左键框选",
    hint: "按住右键拖动画布，按住左键拖出选框",
  },
  {
    value: "left-pan",
    label: "左键平移 · Shift 框选",
    hint: "按住左键拖动画布，按住 Shift 再拖出选框",
  },
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
  const { isMobile } = useDevice()
  const {
    handleExport,
    handleExportZip,
    handleImportClick,
    dialog: importExportDialog,
  } = useImportExport()

  const copyAccount = (value: string, label: string): void => {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`已复制${label}`))
      .catch(() => toast.error('复制失败，请手动选择'))
  }
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
                      {isMobile ? '桌面端支持开机自启动' : '应用程序将在系统启动时自动运行'}
                    </span>
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

                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <span className="text-sm text-ink">关系图鼠标模式</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MOUSE_MODE_OPTIONS.map((option) => {
                      const active = (settings.mouseMode ?? 'left-pan') === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateSetting('mouseMode', option.value)}
                          aria-pressed={active}
                          className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                            active
                              ? 'border-line-hover bg-black/5 dark:bg-white/5'
                              : 'border-line hover:border-line-hover'
                          }`}
                        >
                          <span className="text-sm text-ink">{option.label}</span>
                          <span className="text-[11px] leading-4 text-ink-faint">{option.hint}</span>
                        </button>
                      )
                    })}
                  </div>
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
                  所有条目、关系、标签与地图种子都保存在本机。导出文件可用于手动迁移或备份，不会上传任何内容。
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportClick}
                    className="touch-feedback inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
                  >
                    导入 JSON / ZIP...
                  </button>
                  <button
                    onClick={handleExport}
                    className="touch-feedback inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
                  >
                    导出所有数据 (JSON)
                  </button>
                  <button
                    onClick={handleExportZip}
                    className="touch-feedback inline-flex items-center justify-center gap-2 h-9 px-4 rounded text-sm border border-line bg-white/60 dark:bg-white/[0.06] text-ink transition-colors hover:border-line-hover hover:bg-white/40 dark:hover:bg-white/[0.10]"
                  >
                    <FileArchive size={14} strokeWidth={2} />
                    导出 ZIP 备份
                  </button>
                  <p className="text-xs text-ink-faint mt-1">
                    备份包含角色、事件、国家、词条、关系、标签与地图参数/种子；图片二进制保留在本地数据目录。
                  </p>
                </div>
                <div className="flex items-start gap-2 rounded border border-line bg-paper-card/50 p-3 text-xs leading-5 text-ink-muted">
                  <HardDrive size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-faint" />
                  <span>
                    条目数据：IndexedDB（OCStudioDB）<br />
                    图片：桌面端 AppData/images，浏览器端仅当前会话 blob
                  </span>
                </div>
              </div>
            </TabsContent>

            {/* ---- privacy ---- */}
            <TabsContent value="privacy">
              <div className="flex flex-col gap-4">
                <div className="rounded border border-line bg-paper-card/50 p-4">
                  <p className="flex items-center gap-2 text-sm text-ink">
                    <ShieldCheck size={16} strokeWidth={2} className="text-ink-muted" />
                    完全离线
                  </p>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">
                    OC Studio 运行时不需要账号、不包含云同步、遥测、崩溃上报、分析埋点或自动更新。
                    地图生成、编辑器、关系图谱与导出都在本机完成。
                  </p>
                </div>
                <ul className="flex flex-col gap-2 text-xs text-ink-muted">
                  <li className="flex items-start gap-2">
                    <Lock size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-faint" />
                    Tauri CSP 默认 <code className="font-mono text-[10px]">default-src 'self'</code>，禁止任意远程脚本与网络请求。
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-faint" />
                    不包含 CDN、外部字体、在线地图瓦片或第三方统计脚本；所有图标与依赖随安装包打包。
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-faint" />
                    导入时会剥离外部图片 URL；远程图片不会发起请求。
                  </li>
                  <li className="flex items-start gap-2">
                    <Lock size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-faint" />
                    自动更新未启用；未来移动端同步将默认关闭，仅手动导入/导出。
                  </li>
                </ul>
                <p className="border-t border-line pt-3 text-[11px] text-ink-faint">
                  更多细节见安装包内 PRIVACY.md。
                </p>
              </div>
            </TabsContent>

            {/* ---- about ---- */}
            <TabsContent value="about">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">版本</span>
                  <span className="text-sm text-ink-muted font-mono">
                    v0.18.1-alpha · local-first
                  </span>
                </div>
                <div className="rounded border border-line p-3 text-xs leading-5 text-ink-muted">
                  <p className="text-ink">OC Studio — 原创角色与世界观创作工作台</p>
                  <p className="mt-1">
                    角色档案 · 世界观词条 · 关系图谱 · 树形表格 · 程序化世界地图
                  </p>
                  <p className="mt-2 text-ink-faint">
                    Tauri v2 + Next.js + TypeScript + Dexie.js · MIT License
                  </p>
                </div>

                <div className="rounded-xl border border-line bg-paper-card/40 p-3">
                  <p className="mb-2 text-xs font-medium text-ink">作者账号</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/5 text-ink-muted dark:bg-white/5">
                        <Music2 size={14} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-ink">抖音 · nekibud</p>
                        <p className="text-[10px] text-ink-faint">抖音号 1940329644</p>
                      </div>
                      <button
                        onClick={() => copyAccount('1940329644', '抖音号')}
                        className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                        title="复制抖音号"
                      >
                        <Copy size={11} strokeWidth={2} />
                        复制
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/5 text-ink-muted dark:bg-white/5">
                        <Tv size={14} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-ink">哔哩哔哩 · nekibud</p>
                        <p className="text-[10px] text-ink-faint">B站账号</p>
                      </div>
                      <button
                        onClick={() => copyAccount('nekibud', 'B站账号')}
                        className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                        title="复制 B 站账号"
                      >
                        <Copy size={11} strokeWidth={2} />
                        复制
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-ink-faint">
                    点击复制账号名，可在对应平台搜索关注。
                  </p>
                </div>
                <p className="text-[11px] text-ink-faint">
                  本构建不包含检查更新与外部项目链接，以避免运行时网络访问。
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
