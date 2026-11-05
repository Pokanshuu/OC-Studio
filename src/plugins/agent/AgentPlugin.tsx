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
import { ToastProvider } from '@/plugins/agent/components/ui/primitives'
import { Sidebar } from '@/plugins/agent/components/chat/Sidebar'
import { ChatView } from '@/plugins/agent/components/chat/ChatView'
import { SettingsView } from '@/plugins/agent/components/chat/SettingsView'
import { flushSettings, useSettingsStore } from '@/plugins/agent/state/settings'
import { useChatStore } from '@/plugins/agent/state/chat'

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

  const [collapsed, setCollapsed] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('api')

  useEffect(() => {
    void loadSettings().then(() => initChat())
  }, [loadSettings, initChat])

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
