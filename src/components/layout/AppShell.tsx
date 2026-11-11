"use client"

import { useState, useCallback, useEffect, type ReactNode } from "react"
import { MenuBar } from "@/components/layout/MenuBar"
import { Sidebar } from "@/components/layout/Sidebar"
import { StatusBar } from "@/components/layout/StatusBar"
import { MobileTopBar } from "@/components/layout/MobileTopBar"
import { MobileTabBar } from "@/components/layout/MobileTabBar"
import { GlobalContextMenu } from "@/components/shared/GlobalContextMenu"
import { ExportCenterProvider } from "@/components/shared/export/ExportCenterHost"
import { MobileTextSelectionBar } from "@/components/shared/mobile-text-selection/MobileTextSelectionBar"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { CoverTuningPanel } from "@/components/shared/cover/CoverTuningPanel"
import { SettingsTriggerContext, type SettingsSection } from "@/components/layout/SettingsTriggerContext"
import { EditorProvider, useEditor } from "@/components/layout/EditorContext"
import { MobileNavigationProvider } from "@/components/layout/MobileNavigationContext"
import { TrashOverlayProvider, useTrashOverlay } from "@/components/layout/TrashOverlayContext"
import { MobilePageHeaderProvider } from "@/components/layout/MobilePageHeaderContext"
import { SaveStatusProvider, useSaveStatus } from "@/components/layout/SaveStatusContext"
import { TrashView } from "@/features/trash/components/TrashView"
import { purgeExpiredTrash } from "@/features/trash/retention"
import { loadInspirations, resetInspirations } from "@/features/inspirations/store"
import { loadFieldConfig } from "@/lib/fields"
import { loadCategories } from "@/lib/categories/store"
import { loadTemplates } from "@/lib/templates/store"
import { loadInfoGroups } from "@/lib/templates/info-groups"
import { loadBodyGroups } from "@/lib/templates/body-groups"
import { loadFolderRegistry } from "@/features/characters/folders"
import { VaultSurfaces, VaultWriteBanner } from "@/features/vault"
import { useVault } from "@/lib/vault/vault-provider"
import { useSettings } from "@/lib/settings"
import { useKeyboard } from "@/lib/KeyboardContext"
import { useBackButton } from "@/lib/useBackButton"
import { getChromiumVersion, isBelowTargetVersion, isHarmonyOS, getHarmonyOSVersion, isSafeAreaEnvAvailable, estimateSafeAreaInsets, getSafeAreaBottomCorrection, isMobilePlatform } from "@/lib/browser-compat"
import { toast } from 'sonner'

/**
 * 分类表随库走：**不能挂在 Sidebar 上**（关闭侧栏 / 手机上 Sidebar 不渲染时，
 * 分类页、移动端「更多」和世界目录过滤都会拿到空表）。
 *
 * 为什么单独抽成一个组件：`useVault()` 的 value 里还有写盘状态，每次落盘都会变 ——
 * 挂在 AppShell 本体上会让整个外壳跟着重渲染。这里只订阅库根，换了库才重读。
 * 依赖 root 也是必需的：启动那一下可能早于会话就绪（root 还是 null），
 * 少了这一条就会出现「刷新后侧栏的分类没了」。
 */
function VaultConfigSync() {
  const { root } = useVault()
  const { settings } = useSettings()
  const retentionDays = settings.trashRetentionDays
  useEffect(() => {
    // 这四份都随库走、都存在 `.ocstudio/` 下。启动那一下可能早于会话就绪
    // （root 还是 null），少了这一条就会出现「重启后模板 / 分类 / 字段组回到默认」。
    void loadCategories()
    void loadTemplates()
    void loadInfoGroups()
    void loadBodyGroups()
    void loadFolderRegistry()
  }, [root])

  /**
   * 回收站按设置自动清理：打开笔记库时跑一次，改保留天数时也跑（TrashView 里改完会自己清，
   * 这里兜住「换库后」与「重启后」两种情况）。`0` = 从不，函数自己会直接返回。
   */
  useEffect(() => {
    if (root === null) return
    void purgeExpiredTrash(retentionDays)
  }, [root, retentionDays])

  return null
}

/**
 * 灵感表随库走，理由同上。这里必须**开机就读**：顶栏便签挂在 MenuBar 上，
 * 没人会先点开一个页面再去按灯泡 —— 等页面去加载的话，小窗永远是空的。
 * `resetInspirations` 只在换库时用，否则切换文件夹后会留着上一个库的草稿。
 */
function VaultInspirationsSync() {
  const { root } = useVault()
  useEffect(() => {
    resetInspirations()
    void loadInspirations()
  }, [root])
  return null
}

function TrashOverlayRenderer() {
  const { trashOpen, closeTrash } = useTrashOverlay()
  if (!trashOpen) return null
  return <TrashView onClose={closeTrash} />
}

function AppShellChrome({ settings, children }: { settings: ReturnType<typeof useSettings>['settings'], children: ReactNode }) {
  useBackButton()
  const { isEditing } = useEditor()
  const { visible: keyboardVisible } = useKeyboard()
  const { requestSave, status } = useSaveStatus()
  const vault = useVault()
  const hideMobileShell = isEditing
  const hideTabBar = isEditing || keyboardVisible

  /**
   * Ctrl/Cmd+S：显式保存。
   *
   * 两件事都要做：
   * 1. `requestSave()` —— 让当前实体表单走它自己的保存（含校验）；
   * 2. `vault.flush()` —— 把落盘队列立刻排干。
   *
   * 只做 1 的话，**笔记 / 小说 / 分类条目按 Ctrl+S 是没反应的**（它们没有注册
   * 保存处理器，`requestSave` 找不到人），而浏览器默认的「保存网页」又被
   * `preventDefault` 挡掉了 —— 用户按下去像按了个空键。
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        requestSave()
        if (vault.supported && vault.status === 'ready') void vault.flush()
        // 没有脏表单时（笔记 / 章节都是自动保存）给一句回执：以前按下去毫无反应，
        // 用户只会以为快捷键失效了
        if (status !== 'dirty' && status !== 'saving') {
          toast('没有需要保存的改动', { description: '笔记与章节是自动保存的' })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestSave, status, vault])

  // 未保存时关闭标签页/刷新浏览器 → 原生确认
  useEffect(() => {
    if (status !== 'dirty') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  // 外壳容器**不写底色**：chrome 的底色由 globals.css 的
  // `html:not(.tauri-mica) [data-menubar|data-sidebar|data-statusbar]` 给成 paper-alt，
  // Mica 下保持 transparent。在父级铺一层 bg 会把毛玻璃整个盖死（已踩过）。
  return (
    <div data-app-shell className="flex h-full min-h-0 flex-1 flex-col">
      <MenuBar />
      <VaultWriteBanner />
      {!hideMobileShell && <MobileTopBar />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {settings.sidebarVisible ? <Sidebar /> : null}
        {/*
          内容区是一块「浮起来的纸」：圆角 + 一条边界线，与 chrome（顶栏 / 侧栏 / 底栏）分开。
          chrome 三块共用同一个底色、彼此之间不画线；**不额外加内外边距**，内容仍然贴到原来的位置。
          圆角取中档 6px（8px 在整窗尺寸上偏软，看着像被「包」住了）。
        */}
        <main className="min-w-0 flex-1 overflow-x-auto main-scroll bg-paper md:rounded-control md:border md:border-line">
          {children}
          <MobileTextSelectionBar />
        </main>
      </div>
      <StatusBar />
      {!hideTabBar && <MobileTabBar />}
      {/* 封面卡参数面板（调试用）：挂在 SettingsProvider 里面，
          因为它要读「设置 → 封面卡混色」 */}
      <CoverTuningPanel />
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState("general")
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined)
  const [settingsTarget, setSettingsTarget] = useState<string | undefined>(undefined)

  const openSettings = useCallback((tab?: string, section?: SettingsSection, target?: string) => {
    setSettingsTab(tab ?? "general")
    setSettingsSection(section)
    setSettingsTarget(target)
    setSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  useEffect(() => {
    const v = getChromiumVersion()
    if (v) document.documentElement.dataset.chromiumVersion = String(v)
    if (isBelowTargetVersion()) document.documentElement.dataset.belowTargetVersion = 'true'
  }, [])

  // 移动端：HarmonyOS 检测 + 安全区域 polyfill
  useEffect(() => {
    void loadFieldConfig()
  }, [])

  useEffect(() => {
    if (!isMobilePlatform()) return
    const root = document.documentElement

    // HarmonyOS 标记
    if (isHarmonyOS()) {
      root.dataset.harmonyos = 'true'
      const version = getHarmonyOSVersion()
      if (version) root.dataset.harmonyosVersion = String(version)
    }

    // 安全区域回退：仅在 env() 确实返回 0 时才注入估算值
    // 不设强制兜底 — 否则会覆盖 env() 的正确值
    let fallbackActive = false
    let resizeCleanup: (() => void) | null = null

    const enableResizeListener = () => {
      if (resizeCleanup) return
      const onResize = () => {
        if (isSafeAreaEnvAvailable()) {
          // 模拟器修正模式：env() 非零但值不对，仅修正 bottom
          const correction = getSafeAreaBottomCorrection()
          if (correction !== null) {
            root.style.setProperty('--safe-bottom-estimated', `${correction}px`)
          }
        } else {
          // 完整 fallback 模式：env() 返回 0，重新估算 top + bottom
          const { top, bottom } = estimateSafeAreaInsets()
          if (top > 0) root.style.setProperty('--safe-top-estimated', `${top}px`)
          if (bottom > 0) root.style.setProperty('--safe-bottom-estimated', `${bottom}px`)
        }
      }
      window.addEventListener('resize', onResize)
      resizeCleanup = () => window.removeEventListener('resize', onResize)
    }

    const applyFallback = () => {
      if (fallbackActive) return
      const { top, bottom } = estimateSafeAreaInsets()
      if (top > 0) root.style.setProperty('--safe-top-estimated', `${top}px`)
      if (bottom > 0) root.style.setProperty('--safe-bottom-estimated', `${bottom}px`)
      root.dataset.safeAreaFallback = 'true'
      fallbackActive = true
      enableResizeListener()
    }

    const applyCorrection = (bottom: number) => {
      root.style.setProperty('--safe-bottom-estimated', `${bottom}px`)
      root.dataset.safeAreaFallback = 'true'
      fallbackActive = true
      enableResizeListener()
    }

    const check = () => {
      // 现代设备：env() 返回非零值，检查是否为模拟器异常（env 值偏离屏幕差值估算）
      if (isSafeAreaEnvAvailable()) {
        const correction = getSafeAreaBottomCorrection()
        if (correction !== null) {
          applyCorrection(correction)
        }
        return
      }
      // 兼容设备：env() 返回 0，启用完整 fallback
      applyFallback()
    }

    // 100ms / 500ms / 1s 三次检测，处理 env() 延迟返回的竞态
    const t1 = setTimeout(check, 100)
    const t2 = setTimeout(check, 500)
    const t3 = setTimeout(check, 1000)
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      if (resizeCleanup) resizeCleanup()
    }
  }, [])

  return (
    <GlobalContextMenu>
      <ExportCenterProvider>
      <SettingsTriggerContext.Provider value={{ openSettings, closeSettings }}>
        <TrashOverlayProvider>
          <EditorProvider>
            <SaveStatusProvider>
              <MobileNavigationProvider>
                <MobilePageHeaderProvider>
                  <AppShellChrome settings={settings}>
                    {children}
                  </AppShellChrome>
                  <TrashOverlayRenderer />
                  <VaultSurfaces />
                  <VaultConfigSync />
                  <VaultInspirationsSync />
                  <DevMockBadge />
                </MobilePageHeaderProvider>
              </MobileNavigationProvider>
            </SaveStatusProvider>
          </EditorProvider>
        </TrashOverlayProvider>
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          tab={settingsTab}
          onTabChange={setSettingsTab}
          section={settingsSection}
          target={settingsTarget}
        />
      </SettingsTriggerContext.Provider>
      </ExportCenterProvider>
    </GlobalContextMenu>
  )
}

/**
 * 浏览器预览标记。
 *
 * 桌面版永远绑定一个本地文件夹；浏览器里没有文件系统，走的是 Mock（数据只落在 IndexedDB）。
 * 这个标只在「开发时用浏览器看界面」时出现，提醒你现在改的东西不会落盘。
 */
function DevMockBadge() {
  const { supported } = useVault()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || supported) return null

  return (
    <div data-dev-mock className="pointer-events-none fixed right-2 bottom-8 z-50 rounded-item bg-paper-card/80 px-1.5 py-0.5 text-[10px] text-ink-faint backdrop-blur">
      DEV · Mock（数据只在浏览器里）
    </div>
  )
}
