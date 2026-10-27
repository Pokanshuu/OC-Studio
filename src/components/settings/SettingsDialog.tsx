"use client"

import { Database, Cpu, Info, BookOpen } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { WorldTab } from "./tabs/WorldTab"
import { GeneralTab } from "./tabs/GeneralTab"
import { DataTab } from "./tabs/DataTab"
import { AiTab } from "./tabs/AiTab"
import { AboutTab } from "./tabs/AboutTab"

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
  { value: "ai", label: "云", icon: Cpu },
  { value: "about", label: "关于", icon: Info },
] as const

export function SettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
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
                  className="flex items-center justify-center gap-1.5 text-xs sm:text-sm"
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
              <WorldTab open={open} />
            </TabsContent>

            <TabsContent value="general">
              <GeneralTab />
            </TabsContent>

            <TabsContent value="data">
              <DataTab />
            </TabsContent>

            <TabsContent value="ai">
              <AiTab />
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


