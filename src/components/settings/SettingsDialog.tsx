"use client"

import { Database, Palette, Info, BookOpen, Blocks } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { SettingsSection } from "@/components/layout/SettingsTriggerContext"
import { WorldTab } from "./tabs/WorldTab"
import { GeneralTab } from "./tabs/GeneralTab"
import { DataTab } from "./tabs/DataTab"
import { PluginsTab } from "./tabs/PluginsTab"
import { AboutTab } from "./tabs/AboutTab"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: string
  onTabChange: (tab: string) => void
  /** 从别处跳进来时直接落到「世界」的二级页面（模板 / 分类 / 组件 / 标签） */
  section?: SettingsSection
  /** 二级页里的具体对象：目前是模板 id，用来直接打开某套模板 */
  target?: string
}

const TAB_ITEMS = [
  { value: "world", label: "世界", icon: BookOpen },
  { value: "general", label: "个性化", icon: Palette },
  // 插件 = 功能 / 主题 / 技能三类扩展的统一管理面（开关 + 权限 + 安装）
  { value: "plugins", label: "插件", icon: Blocks },
  // 「数据」= 原来的「数据」+「云」两个页签合并（本地数据 / 同步 按类别分区）
  { value: "data", label: "数据", icon: Database },
  { value: "about", label: "关于", icon: Info },
] as const

export function SettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  section,
  target,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-4rem)] max-w-lg flex-col overflow-hidden p-0 max-md:max-w-[calc(100%-2rem)]" showCloseButton={false}>
        <DialogHeader className="flex shrink-0 flex-row items-center gap-3 px-6 pt-6 pb-2">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-6">
            <TabsList className="grid w-full grid-cols-5">
              {TAB_ITEMS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="gap-1.5 text-xs sm:text-sm"
                >
                  <item.icon size={14} strokeWidth={2} className="shrink-0 sm:hidden" />
                  <span className="hidden sm:inline">{item.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* 内容区自己滚：窗口矮的时候（或「关于」里那一长串致谢）不会把弹窗撑出屏幕 */}
          <div className="main-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {/* ---- world ---- */}
            <TabsContent value="world">
              {/* key 让「从别处跳到某个二级页 / 某套模板」时重新挂载，panel 与 activeId 直接初始化 */}
              <WorldTab
                key={`${open ? 'open' : 'closed'}:${section ?? 'root'}:${target ?? ''}`}
                open={open}
                section={section}
                target={target}
              />
            </TabsContent>

            <TabsContent value="general">
              <GeneralTab />
            </TabsContent>

            <TabsContent value="plugins">
              <PluginsTab />
            </TabsContent>

            <TabsContent value="data">
              <DataTab />
            </TabsContent>

            <TabsContent value="about">
              <AboutTab />
            </TabsContent>

          </div>
        </Tabs>

        <div className="flex shrink-0 justify-end border-t border-line px-6 py-4">
          <button
            onClick={() => onOpenChange(false)}
            className="touch-feedback inline-flex h-8 items-center justify-center px-3 text-[13px] text-ink-muted transition-colors hover:text-ink"
          >
            关闭
          </button>
        </div>
      </DialogContent>

    </Dialog>
  )
}


