"use client"

import { useState } from "react"
import { Settings, Database, Cpu, Info } from "lucide-react"
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
  { value: "general", label: "通用", icon: Settings },
  { value: "data", label: "数据与同步", icon: Database },
  { value: "ai", label: "AI 与云", icon: Cpu },
  { value: "about", label: "关于", icon: Info },
] as const

export function SettingsDialog({ open, onOpenChange, defaultTab = "general" }: SettingsDialogProps) {
  const { settings, updateSetting } = useSettings()
  const { handleExport, handleImportClick, dialog: importExportDialog } = useImportExport()
  const [tab, setTab] = useState(defaultTab)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0" showCloseButton={false}>
        <DialogHeader className="flex flex-row items-center gap-3 px-6 pt-6 pb-2">
          <Settings size={18} strokeWidth={2} className="text-ink-muted" />
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <div className="px-6">
            <TabsList className="w-full justify-start gap-0">
              {TAB_ITEMS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="flex items-center gap-1.5">
                  <item.icon size={14} strokeWidth={2} />
                  <span className="hidden sm:inline">{item.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="px-6 pb-6">
            <TabsContent value="general">
              <div className="flex flex-col gap-5">
                <label className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">开机自启动</span>
                    <span className="text-xs text-ink-faint">应用程序将在系统启动时自动运行</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.autoStart}
                    onClick={() => updateSetting("autoStart", !settings.autoStart)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      settings.autoStart
                        ? "border-ink bg-ink"
                        : "border-line bg-paper-card"
                    }`}
                  >
                    <span
                      className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                        settings.autoStart ? "translate-x-[18px] bg-paper" : "translate-x-[2px] bg-ink-muted"
                      }`}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">自动切换暗黑模式</span>
                    <span className="text-xs text-ink-faint">根据系统主题自动切换</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.autoDarkMode}
                    onClick={() => updateSetting("autoDarkMode", !settings.autoDarkMode)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      settings.autoDarkMode
                        ? "border-ink bg-ink"
                        : "border-line bg-paper-card"
                    }`}
                  >
                    <span
                      className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                        settings.autoDarkMode ? "translate-x-[18px] bg-paper" : "translate-x-[2px] bg-ink-muted"
                      }`}
                    />
                  </button>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="data">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-ink-muted">
                  管理您的创作数据。可以导出为常用格式备份，或发布为独立页面。
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleImportClick}
                    className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-paper-card text-ink transition-colors hover:border-line-hover hover:bg-paper-alt"
                  >
                    导入数据...
                  </button>
                  <button
                    onClick={handleExport}
                    className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-paper-card text-ink transition-colors hover:border-line-hover hover:bg-paper-alt"
                  >
                    导出所有数据 (JSON)
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-paper-card text-ink-muted cursor-not-allowed"
                  >
                    发布为静态网站...
                  </button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-line">
                  <div className="flex flex-col">
                    <span className="text-sm text-ink">云同步</span>
                    <span className="text-xs text-ink-faint">开启后将自动同步数据到云端</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.cloudSyncEnabled}
                    onClick={() => updateSetting("cloudSyncEnabled", !settings.cloudSyncEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
                      settings.cloudSyncEnabled
                        ? "border-ink bg-ink"
                        : "border-line bg-paper-card"
                    }`}
                  >
                    <span
                      className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                        settings.cloudSyncEnabled ? "translate-x-[18px] bg-paper" : "translate-x-[2px] bg-ink-muted"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ai">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">API Key</label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => updateSetting("apiKey", e.target.value)}
                    placeholder="sk-..."
                    className="h-9 w-full rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                  <span className="text-xs text-ink-faint">密钥仅存储在本地，不会上传到任何服务器</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">AI 模型</label>
                  <input
                    type="text"
                    value={settings.aiModel}
                    onChange={(e) => updateSetting("aiModel", e.target.value)}
                    placeholder="gpt-4o"
                    className="h-9 w-full rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">Base URL</label>
                  <input
                    type="text"
                    value={settings.aiBaseUrl}
                    onChange={(e) => updateSetting("aiBaseUrl", e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="h-9 w-full rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm text-ink">同步服务端地址</label>
                  <input
                    type="text"
                    value={settings.syncServerUrl}
                    onChange={(e) => updateSetting("syncServerUrl", e.target.value)}
                    placeholder="https://your-sync-server.com"
                    className="h-9 w-full rounded border border-line bg-paper-card px-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-line-hover"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="about">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">版本</span>
                  <span className="text-sm text-ink-muted font-mono">0.1.0</span>
                </div>
                <button
                  disabled
                  className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-paper-card text-ink-muted cursor-not-allowed"
                >
                  检查更新
                </button>
                <a
                  href="https://github.com/anomalyco/oc-studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-9 px-4 rounded text-sm border border-line bg-paper-card text-ink transition-colors hover:border-line-hover hover:bg-paper-alt"
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
            className="inline-flex items-center justify-center h-9 px-3 rounded text-sm border border-line bg-paper-alt text-ink transition-colors hover:border-line-hover hover:bg-paper-card"
          >
            关闭
          </button>
        </div>
      </DialogContent>
      {importExportDialog}
    </Dialog>
  )
}
