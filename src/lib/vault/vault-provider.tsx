'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'

import { notifyDataUpdated } from '@/lib/data-events'
import { setVaultImageContext } from '@/lib/image-service'
import { migrateImagesIntoVault } from './vault-migrate'
import { pickAssetsDir } from './vault-paths'
import { closeVaultSession, loadVault, type VaultLoadResult } from './vault-load'
import { isVaultSupported, vaultFs } from './vault-fs'
import {
  currentStatus,
  drainVaultWrites,
  installVaultPersist,
  subscribeVaultWriteStatus,
  type VaultWriteStatus,
} from './vault-persist'
import {
  isVaultEnabled,
  lastVaultPath,
  listRecentVaults,
  rememberVault,
  setVaultEnabled,
  vaultNameFromPath,
  type VaultRegistryEntry,
} from './vault-registry'
import { MARKER_REL_PATH, buildMarkerContent } from './vault-marker'

// ── Vault 上下文 ────────────────────────────────────────────────────────
// 负责「打开哪个文件夹、装到哪一步、写盘是否顺利」这三件事。
// 具体的读盘/写盘在 vault-load / vault-persist；这里只管状态与交互编排。
//
// 状态为什么是「派生」而不是直接 setState：
// `isVaultSupported()` 在服务端为 false、客户端为 true，直接用它做 useState 初值
// 会造成水合不一致（服务端渲染出主界面、客户端渲染出加载页）。
// 因此用 useSyncExternalStore 读环境（服务端快照固定为 false，水合后 React 自己
// 重渲染，且发生在浏览器绘制之前，看不到闪烁），`status` 再由它与持久配置派生。

export type VaultStatus = 'unsupported' | 'idle' | 'booting' | 'loading' | 'ready' | 'error'

/** 装载阶段；'unresolved' 表示还没决定要不要装 */
type VaultPhase = 'unresolved' | 'loading' | 'ready' | 'error'

type WelcomeState = 'auto' | 'open' | 'closed'

interface VaultContextValue {
  supported: boolean
  status: VaultStatus
  root: string | null
  name: string | null
  report: VaultLoadResult | null
  error: string | null
  writeStatus: VaultWriteStatus
  recent: VaultRegistryEntry[]
  reportOpen: boolean
  welcomeOpen: boolean
  pickFolder: () => Promise<string | null>
  openFolder: (path?: string) => Promise<void>
  createFolder: (path?: string) => Promise<void>
  close: () => Promise<void>
  rescan: () => Promise<void>
  flush: () => Promise<void>
  /** 把应用数据目录里的存量图片迁进 vault 并改写引用 */
  migrateImages: () => Promise<void>
  showReport: () => void
  hideReport: () => void
  showWelcome: () => void
  dismissWelcome: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext)
  if (value === null) {
    throw new Error('useVault 必须在 VaultProvider 内使用')
  }
  return value
}

/** 用户选择「继续用内置数据库」后不再自动弹欢迎浮层 */
const WELCOME_DISMISSED_KEY = 'oc-studio-vault-welcome-dismissed'

function isWelcomeDismissed(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(WELCOME_DISMISSED_KEY) === 'true'
  } catch {
    return true
  }
}

function markWelcomeDismissed(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WELCOME_DISMISSED_KEY, 'true')
  } catch {
    // 存储不可用：下次启动会再弹一次，可接受
  }
}

// 环境能力不会在运行中变化，订阅函数保持恒等即可（useSyncExternalStore 要求稳定引用）
function subscribeEnvironment(): () => void {
  return () => {}
}

function getSupportedSnapshot(): boolean {
  return isVaultSupported()
}

function getSupportedServerSnapshot(): boolean {
  return false
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function countsSummary(report: VaultLoadResult): string {
  const { counts } = report
  return [
    `${counts.characters} 角色`,
    `${counts.countries} 国家`,
    `${counts.events} 事件`,
    `${counts.worldEntries} 词条`,
  ].join(' / ')
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const supported = useSyncExternalStore(
    subscribeEnvironment,
    getSupportedSnapshot,
    getSupportedServerSnapshot,
  )

  const [phase, setPhase] = useState<VaultPhase>('unresolved')
  const [root, setRoot] = useState<string | null>(null)
  const [report, setReport] = useState<VaultLoadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<VaultRegistryEntry[]>([])
  const [writeStatus, setWriteStatus] = useState<VaultWriteStatus>(() => currentStatus())
  const [reportOpen, setReportOpen] = useState(false)
  const [welcomeState, setWelcomeState] = useState<WelcomeState>('auto')

  useEffect(() => subscribeVaultWriteStatus(setWriteStatus), [])

  // 最近打开列表只影响菜单内容，晚一帧载入即可（也能避开 effect 里同步 setState）
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRecent(listRecentVaults()))
    return () => cancelAnimationFrame(frame)
  }, [])

  const refreshLists = useCallback(() => {
    notifyDataUpdated()
    void queryClient.invalidateQueries()
  }, [queryClient])

  const openVault = useCallback(
    async (path: string, options?: { boot?: boolean; announce?: boolean }) => {
      try {
        const probe = await vaultFs.probe(path)
        if (!probe.exists) throw new Error('文件夹不存在，可能已被移动或删除')
        if (!probe.isDir) throw new Error('选择的路径不是文件夹')

        const result = await loadVault(path)
        const loadedRoot = result.session.root

        // 素材目录沿用 vault 里已有的（如 `99.附件`），没有才用默认名
        setVaultImageContext(loadedRoot, pickAssetsDir(result.dirs))

        setRoot(loadedRoot)
        setReport(result)
        rememberVault(loadedRoot)
        setRecent(listRecentVaults())
        refreshLists()
        setPhase('ready')

        if (options?.boot !== true) setReportOpen(true)
        if (options?.announce !== false) {
          toast.success(`已载入 ${vaultNameFromPath(loadedRoot)}`, {
            description: countsSummary(result),
          })
        }
      } catch (err) {
        const message = describeError(err)
        setError(message)
        setPhase('error')
        toast.error('打开仓库失败', { description: message })
      }
    },
    [refreshLists],
  )

  // 启动时自动恢复上次的 vault。没配置过就什么都不做，
  // status 会由 wantsVault 派生为 'idle'，完全走原来的内置数据库路径。
  useEffect(() => {
    if (!supported) return
    // 中间件要在任何写入之前装好；装一次即可，幂等
    installVaultPersist()

    if (!isVaultEnabled()) return
    const path = lastVaultPath()
    if (path === null) return
    // 放进 rAF：装载会在过程中改状态，直接同步调用会在 effect 里触发级联渲染
    const frame = requestAnimationFrame(() => {
      void openVault(path, { boot: true, announce: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [supported, openVault])

  const pickFolder = useCallback(async (): Promise<string | null> => {
    if (!supported) return null
    const picked = await openFolderDialog({
      directory: true,
      multiple: false,
      title: '选择仓库文件夹',
    })
    if (picked === null) return null
    return typeof picked === 'string' ? picked : null
  }, [supported])

  const openFolder = useCallback(
    async (path?: string) => {
      const target = path ?? (await pickFolder())
      if (target === null) return
      setPhase('loading')
      setError(null)
      await openVault(target)
    },
    [openVault, pickFolder],
  )

  const createFolder = useCallback(
    async (path?: string) => {
      const target = path ?? (await pickFolder())
      if (target === null) return
      setPhase('loading')
      setError(null)
      try {
        const probe = await vaultFs.probe(target)
        if (!probe.isDir) throw new Error('选择的路径不是文件夹')

        // 已有标记就是现成 vault，按打开处理，不覆盖
        if (!probe.hasMarker) {
          await vaultFs.writeTexts(target, [
            { relPath: MARKER_REL_PATH, content: buildMarkerContent(vaultNameFromPath(target)) },
          ])
        }
        await openVault(target, { boot: true })
        setPhase('ready')
      } catch (err) {
        const message = describeError(err)
        setError(message)
        setPhase('error')
        toast.error('创建仓库失败', { description: message })
      }
    },
    [openVault, pickFolder],
  )

  const close = useCallback(async () => {
    await drainVaultWrites()
    closeVaultSession()
    setVaultImageContext(null)
    setVaultEnabled(false)
    setRoot(null)
    setReport(null)
    setError(null)
    setPhase('unresolved')
    toast('已关闭仓库', {
      description: '数据仍在应用内数据库中，但后续修改不再写回文件夹。',
    })
  }, [])

  const rescan = useCallback(async () => {
    if (root === null) return
    try {
      await drainVaultWrites()
      const result = await loadVault(root)
      setReport(result)
      refreshLists()
      toast.success('已重新扫描磁盘', { description: countsSummary(result) })
    } catch (err) {
      toast.error('重新扫描失败', { description: describeError(err) })
    }
  }, [root, refreshLists])

  const flush = useCallback(async () => {
    const result = await drainVaultWrites()
    if (result.errors.length > 0) {
      toast.error('写盘失败', { description: result.errors[0].message })
    } else if (result.conflicts.length > 0) {
      toast.warning(`${result.conflicts.length} 个文件在磁盘上被外部修改，已跳过未覆盖`)
    }
  }, [])

  const dismissWelcome = useCallback(() => {
    markWelcomeDismissed()
    setWelcomeState('closed')
  }, [])

  const migrateImages = useCallback(async () => {
    try {
      const report = await migrateImagesIntoVault()
      if (report.candidates === 0) {
        toast('没有需要迁移的图片', { description: '所有图片引用都已经在仓库内。' })
        return
      }
      const parts = [`已迁入 ${report.migrated} 张`]
      if (report.rewrittenRows > 0) parts.push(`改写 ${report.rewrittenRows} 个实体的引用`)
      if (report.skippedMissing.length > 0) {
        parts.push(`${report.skippedMissing.length} 张在应用数据目录里找不到`)
      }
      if (report.failed.length > 0) parts.push(`${report.failed.length} 张失败`)

      if (report.failed.length > 0 || report.migrated === 0) {
        toast.error('图片迁移未完成', { description: parts.join('，') })
      } else {
        toast.success('图片迁移完成', { description: parts.join('，') })
      }
      refreshLists()
    } catch (err) {
      toast.error('图片迁移失败', { description: describeError(err) })
    }
  }, [refreshLists])

  // 是否该去装载：由持久配置派生，而不是存一个状态位
  const wantsVault =
    supported && phase === 'unresolved' && isVaultEnabled() && lastVaultPath() !== null

  const status: VaultStatus = !supported
    ? 'unsupported'
    : phase === 'unresolved'
      ? wantsVault
        ? 'booting'
        : 'idle'
      : phase

  const welcomeOpen =
    welcomeState === 'open' ||
    (welcomeState === 'auto' && supported && !isVaultEnabled() && !isWelcomeDismissed())

  const value = useMemo<VaultContextValue>(
    () => ({
      supported,
      status,
      root,
      name: root === null ? null : vaultNameFromPath(root),
      report,
      error,
      writeStatus,
      recent,
      reportOpen,
      welcomeOpen,
      pickFolder,
      openFolder,
      createFolder,
      close,
      rescan,
      flush,
      migrateImages,
      showReport: () => setReportOpen(true),
      hideReport: () => setReportOpen(false),
      showWelcome: () => setWelcomeState('open'),
      dismissWelcome,
    }),
    [
      supported,
      status,
      root,
      report,
      error,
      writeStatus,
      recent,
      reportOpen,
      welcomeOpen,
      pickFolder,
      openFolder,
      createFolder,
      close,
      rescan,
      flush,
      migrateImages,
      dismissWelcome,
    ],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
