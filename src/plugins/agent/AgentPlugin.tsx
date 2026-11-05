'use client'

/**
 * 助手插件（`official.agent`）的挂载点。
 *
 * 插件是**自带存储与状态的独立单元**：会话库、设置、工具循环、审批、会话树
 * 全在 `src/plugins/agent/` 里面，宿主不管它数据放哪。宿主只提供三样东西 ——
 * 一块容器、一道权限闸、一份只读能力注入。
 *
 * 这个文件是宿主与插件之间**唯一**的接缝：
 * - 把宿主的亮暗送进 `data-theme`（插件样式表按 `[data-theme='dark']` 取令牌）
 * - 起插件的引导（读设置 → 拉会话列表）
 * - 按宿主的容器尺寸排它自己的侧栏与对话面板（插件原本的窗口外壳不再出现）
 *
 * 除这里以外，插件目录里的代码一律不改 —— 上游更新直接覆盖。
 */

import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { ToastProvider } from '@/plugins/agent/components/ui/primitives'
import { Sidebar } from '@/plugins/agent/components/chat/Sidebar'
import { ChatView } from '@/plugins/agent/components/chat/ChatView'
import { SettingsView } from '@/plugins/agent/components/chat/SettingsView'
import { flushSettings, useSettingsStore } from '@/plugins/agent/state/settings'
import { useChatStore } from '@/plugins/agent/state/chat'
import { isTauri } from '@/lib/env'
import { CENTER_STATE } from '@/lib/ui-tokens'

type SettingsTab = 'api' | 'agent' | 'appearance' | 'data' | 'about'

/** 跟着宿主的 `.dark` 走，插件不自己决定主题 */
function useHostDark(): boolean {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.classList.contains('dark'))
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return dark
}

export function AgentPlugin() {
  const dark = useHostDark()
  const loaded = useSettingsStore((s) => s.loaded)
  const loadSettings = useSettingsStore((s) => s.load)
  const initChat = useChatStore((s) => s.init)

  // 插件的库在网络另一端：Tauri 命令 + 系统 app data 下的 SQLite。浏览器里
  // 没有这些命令，硬渲染只会得到一块空面板（每个 invoke 都 reject）。
  // 先把「有没有后端」问清楚，再决定画什么。
  const [native, setNative] = useState<boolean | null>(null)

  const [collapsed, setCollapsed] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('api')

  useEffect(() => {
    // 必须等挂载后再问：`isTauri()` 读 window，服务端渲染时它不存在。
    // 首帧先画空壳，拿到答案再换成真界面，避免水合不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 环境探测只能发生在客户端
    setNative(isTauri())
  }, [])

  useEffect(() => {
    if (native !== true) return
    void loadSettings().then(() => initChat())
  }, [native, loadSettings, initChat])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail === 'api' || detail === 'agent' || detail === 'appearance' || detail === 'data' || detail === 'about') {
        setSettingsTab(detail)
      }
      setSettingsOpen(true)
    }
    window.addEventListener('simple-agent:open-settings', handler)
    return () => window.removeEventListener('simple-agent:open-settings', handler)
  }, [])

  useEffect(() => {
    const handler = () => flushSettings()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  if (native === false) {
    return (
      <div className={CENTER_STATE}>
        <Wrench size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">桌面版才能用</p>
      </div>
    )
  }

  if (native === null) return <div className="h-full" />

  return (
    <div className="oc-agent-root flex h-full min-h-0" data-theme={dark ? 'dark' : 'light'}>
      <ToastProvider>
        <div className="shell-body">
          {!collapsed && (
            <Sidebar
              onToggle={() => setCollapsed(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onStartResize={() => undefined}
              onResetWidth={() => undefined}
            />
          )}
          <ChatView collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />
          <SettingsView open={settingsOpen} tab={settingsTab} onClose={() => setSettingsOpen(false)} />
        </div>
      </ToastProvider>
      {!loaded && <span className="sr-only">正在装载助手</span>}
    </div>
  )
}
