/**
 * Shell: sidebar + content panel + status bar.
 *
 * Per the design system the three shell blocks share one surface and are separated
 * by **no lines at all**; the only rule in the window is the border around the
 * content panel. Theme, locale and font scale are applied as attributes on
 * `<html>` so CSS owns presentation.
 */

import { useEffect, useRef, useState } from 'react'
import { Sidebar } from '@/plugins/agent/components/chat/Sidebar'
import { ChatView } from '@/plugins/agent/components/chat/ChatView'
import { SettingsView } from '@/plugins/agent/components/chat/SettingsView'
import { flushSettings, useSettingsStore } from '@/plugins/agent/state/settings'
import { useChatStore } from '@/plugins/agent/state/chat'
import { resolveLang } from '@/plugins/agent/i18n'

type Tab = 'api' | 'agent' | 'appearance' | 'data' | 'about'

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 340
const SIDEBAR_DEFAULT = 232

/** Resolve `system` against the OS preference and keep following it. */
function useResolvedTheme(preference: 'system' | 'light' | 'dark'): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemDark ? 'dark' : 'light'
}

export function App() {
  const settings = useSettingsStore((s) => s.settings)
  const loaded = useSettingsStore((s) => s.loaded)
  const loadSettings = useSettingsStore((s) => s.load)
  const initChat = useChatStore((s) => s.init)

  const [collapsed, setCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<Tab>('api')
  const dragging = useRef(false)

  const theme = useResolvedTheme(settings.ui.theme)
  const lang = resolveLang(settings.ui.language)

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

  // Persist any debounced settings write when the window goes away.
  useEffect(() => {
    const handler = () => flushSettings()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.lang = lang
    root.dataset.density = settings.ui.density
    root.style.setProperty('--font-scale', String(settings.ui.fontScale))
    root.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [theme, lang, settings.ui.density, settings.ui.fontScale])

  // Sidebar drag: 6px hit area on the right edge, clamped, double-click resets.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, event.clientX)))
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  if (!loaded) {
    return <div className="app" />
  }

  return (
    <div className="app" style={{ ['--oc-sidebar-w' as string]: `${sidebarWidth}px` }}>
      <div className="shell-body">
        {!collapsed && (
          <Sidebar
            onToggle={() => setCollapsed(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onStartResize={() => {
              dragging.current = true
            }}
            onResetWidth={() => setSidebarWidth(SIDEBAR_DEFAULT)}
          />
        )}

        <div className={`workspace${collapsed ? ' full' : ''}`}>
          <main className="panel">
            <ChatView collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />
          </main>
        </div>
      </div>

      <SettingsView open={settingsOpen} tab={settingsTab} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
