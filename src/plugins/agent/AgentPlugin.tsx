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

import { useEffect, useRef, useState } from 'react'
import { Wrench } from 'lucide-react'
import { ToastProvider } from '@/plugins/agent/components/ui/primitives'
import { Sidebar } from '@/plugins/agent/components/chat/Sidebar'
import { ChatView } from '@/plugins/agent/components/chat/ChatView'
import { SettingsView } from '@/plugins/agent/components/chat/SettingsView'
import { flushSettings, useSettingsStore } from '@/plugins/agent/state/settings'
import { useChatStore } from '@/plugins/agent/state/chat'
import { agentContextOpener, agentContextTitle, takeAgentContext } from '@/lib/plugins/agent-bridge'
import {
  clearPendingAgentSessionContext,
  emptyAgentSessionContext,
  setAgentSessionContext,
} from '@/lib/plugins/agent-session'
import { addNewLibraryTools } from '@/plugins/agent/host/library-tools'
import { isTauri } from '@/lib/env'
import { useVault } from '@/lib/vault/vault-provider'
import { CENTER_STATE } from '@/lib/ui-tokens'

type SettingsTab = 'api' | 'agent' | 'appearance' | 'data' | 'about'

/**
 * 会话列表的宽度。宿主的侧栏是 112–168，这里放的是会话标题（更长），
 * 所以另给一档 180–340；宽度只活在这个组件里，不落盘 —— 助手是插件，
 * 不给它再开一个 localStorage 键。
 */
const SIDEBAR_DEFAULT = 232
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 340

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
  const conversations = useChatStore((s) => s.conversations)
  const currentId = useChatStore((s) => s.currentId)
  const workspace = useSettingsStore((s) => s.settings.agent.workspace)
  // 工作目录固定为当前笔记库：不做选择、不落用户偏好。
  const { root: vaultRoot } = useVault()

  // 插件的库在网络另一端：Tauri 命令 + 系统 app data 下的 SQLite。浏览器里
  // 没有这些命令，硬渲染只会得到一块空面板（每个 invoke 都 reject）。
  // 先把「有没有后端」问清楚，再决定画什么。
  const [native, setNative] = useState<boolean | null>(null)

  // 会话列表默认展开：上游窗口壳的默认值也是展开，收起后只剩一条「新对话」，
  // 第一次进来会以为这里没有历史会话。
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('api')

  const rootRef = useRef<HTMLDivElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const resizing = useRef(false)

  useEffect(() => {
    const clamp = (value: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, value))
    const onMove = (event: PointerEvent) => {
      if (!resizing.current) return
      // clientX 是视口坐标：宿主侧栏 / 菜单栏都在左边，得先减去内容区的左边界
      const left = rootRef.current?.getBoundingClientRect().left ?? 0
      setSidebarWidth(clamp(event.clientX - left))
    }
    const onUp = () => {
      resizing.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  useEffect(() => {
    // 必须等挂载后再问：`isTauri()` 读 window，服务端渲染时它不存在。
    // 首帧先画空壳，拿到答案再换成真界面，避免水合不一致。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 环境探测只能发生在客户端
    setNative(isTauri())
  }, [])

  useEffect(() => {
    // 必须在设置装载之后再写：`load()` 会用 SQLite 里的旧值整体覆盖一次。
    if (!loaded || !vaultRoot || workspace === vaultRoot) return
    useSettingsStore.getState().patch((current) => ({
      ...current,
      agent: { ...current.agent, workspace: vaultRoot },
    }))
  }, [loaded, vaultRoot, workspace])

  useEffect(() => {
    // 新版补进来的库工具（如 library_delete）对旧安装默认不可见：只在默认全开时补
    if (!loaded) return
    const enabled = useSettingsStore.getState().settings.agent.enabledTools
    const next = addNewLibraryTools(enabled)
    if (next === enabled) return
    useSettingsStore.getState().patch((current) => ({
      ...current,
      agent: { ...current.agent, enabledTools: next },
    }))
  }, [loaded])

  useEffect(() => {
    // 切换笔记库：会话是**按库绑定**的（conversation.workspace 就是建会话时的库根）。
    // 当前会话属于旧库时，先回到「新会话」；旧会话仍留在它自己的库下，
    // 列表里由 Sidebar 按库过滤，不会串到另一个世界。
    if (!vaultRoot || !currentId) return
    const current = conversations.find((conversation) => conversation.id === currentId)
    if (!current?.workspace || current.workspace === vaultRoot) return
    clearPendingAgentSessionContext()
    void useChatStore.getState().newConversation()
  }, [vaultRoot, currentId, conversations])

  useEffect(() => {
    if (native !== true) return
    let cancelled = false
    void (async () => {
      await loadSettings()
      await initChat()
      if (cancelled) return

      // 「和助手聊聊」留下的一次性请求：开一个新会话，「聊谁」挂进会话资料
      // （系统提示词里的一段只读数据），输入框只留一句用户会说的话。
      // 不自动发送 —— 花 token 的动作由用户按发送。
      const request = takeAgentContext()
      if (!request) return
      const chat = useChatStore.getState()
      await chat.newConversation()
      // 标题跟着这条请求走；会话是首次发送时才落库的，所以写在这里有效。
      useChatStore.setState({ pendingTitle: agentContextTitle(request) })
      // 还没落库的新会话：`setAgentSessionContext(null, …)` 先放进 pending，
      // 等建出 id 由 `bindPendingAgentSessionContext` 绑过去。
      setAgentSessionContext(null, {
        ...emptyAgentSessionContext(),
        focus: { kind: request.kind, id: request.id },
      })
      chat.setDraft(agentContextOpener(request))
    })()
    return () => {
      cancelled = true
    }
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
    <div
      ref={rootRef}
      className="oc-agent-root flex h-full min-h-0"
      data-theme={dark ? 'dark' : 'light'}
      style={{ ['--oc-sidebar-w' as string]: `${sidebarWidth}px` }}
    >
      <ToastProvider>
        <div className="shell-body">
          {!collapsed && (
            <Sidebar
              onToggle={() => setCollapsed(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onStartResize={() => {
                resizing.current = true
              }}
              onResetWidth={() => setSidebarWidth(SIDEBAR_DEFAULT)}
            />
          )}
          {/* ChatView 是一组 fragment（页头 / 消息区 / 输入区），必须包一层
              纵向容器；直接放进 `.shell-body`（flex row）会变成三列，输入框跑到右上角。 */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <ChatView collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />
          </div>
          <SettingsView open={settingsOpen} tab={settingsTab} onClose={() => setSettingsOpen(false)} />
        </div>
      </ToastProvider>
      {!loaded && <span className="sr-only">正在装载助手</span>}
    </div>
  )
}
