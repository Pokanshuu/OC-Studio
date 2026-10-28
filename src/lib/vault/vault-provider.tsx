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
import type { MergeStrategy } from '@/lib/import'
import { setVaultImageContext } from '@/lib/image-service'
import { exportLegacyToFolder } from './export-dir'
import { pickAssetsDir } from './vault-paths'
import { loadVault, type VaultLoadResult } from './vault-load'
import { isVaultSupported, vaultFs } from './vault-fs'
import {
  currentStatus,
  drainVaultWrites,
  installVaultPersist,
  subscribeVaultWriteStatus,
  type VaultWriteStatus,
} from './vault-persist'
import {
  lastVaultPath,
  listRecentVaults,
  rememberVault,
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
  pickFolder: () => Promise<string | null>
  openFolder: (path?: string) => Promise<void>
  createFolder: (path?: string) => Promise<void>
  rescan: () => Promise<void>
  flush: () => Promise<void>
  /**
   * 把应用内（Dexie）的数据写进一个文件夹，然后打开它。
   * 文件夹可以已有笔记：`strategy` 决定同名怎么处理，**由用户在对话框里选**，这里不给默认值。
   */
  migrateLegacy: (options?: { path?: string; strategy?: MergeStrategy }) => Promise<void>
  showReport: () => void
  hideReport: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext)
  if (value === null) {
    throw new Error('useVault 必须在 VaultProvider 内使用')
  }
  return value
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
        toast.error('打开笔记库失败', { description: message })
      }
    },
    [refreshLists],
  )

  // 启动时自动恢复上次的文件夹。没打开过就什么都不做，
  // status 会由 wantsVault 派生为 'idle'，显示欢迎引导。
  useEffect(() => {
    if (!supported) return
    // 中间件要在任何写入之前装好；装一次即可，幂等
    installVaultPersist()

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
      title: '选择笔记库文件夹',
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
        toast.error('新建笔记库失败', { description: message })
      }
    },
    [openVault, pickFolder],
  )

  const rescan = useCallback(async () => {
    if (root === null) return
    try {
      await drainVaultWrites()
      const result = await loadVault(root)
      setReport(result)
      refreshLists()
      toast.success('已重新载入', { description: countsSummary(result) })
    } catch (err) {
      toast.error('重新载入失败', { description: describeError(err) })
    }
  }, [root, refreshLists])

  const flush = useCallback(async () => {
    const result = await drainVaultWrites()
    if (result.errors.length > 0) {
      toast.error('保存失败', { description: result.errors[0].message })
    } else if (result.conflicts.length > 0) {
      toast.warning(`${result.conflicts.length} 个文件在磁盘上被外部修改，已跳过未覆盖`)
    }
  }, [])

  // 老数据迁移：把 Dexie 全量物化进一个**空文件夹**，然后打开它。
  //
  // 不在迁移前强制导 .ocbak：点了「搬到文件夹」却弹一个保存对话框，是在做另一件事。
  // 不需要那层保险也安全 —— 迁移只写不删，而清空 Dexie 发生在**写盘成功之后**
  // （loadVault 里），写盘失败就直接抛错停在这里，旧数据一个字节都没动。
  // 想自己备份的用户可以在下拉菜单里显式导出。
  const migrateLegacy = useCallback(async (options?: { path?: string; strategy?: MergeStrategy }) => {
    const target = options?.path ?? (await pickFolder())
    if (target === null) return

    setPhase('loading')
    setError(null)
    try {
      const result = await exportLegacyToFolder(target, { strategy: options?.strategy })
      await openVault(target, { boot: true, announce: false })

      const parts = [`新建 ${result.created} 篇`]
      if (result.overwritten > 0) parts.push(`更新 ${result.overwritten} 篇`)
      if (result.skippedExisting > 0) parts.push(`跳过同名 ${result.skippedExisting} 篇`)
      if (result.movedToTrash > 0) parts.push(`旧笔记挪进回收站 ${result.movedToTrash} 篇`)
      if (result.images > 0) parts.push(`图片 ${result.images} 张`)
      if (result.missingImages.length > 0) {
        parts.push(`${result.missingImages.length} 张图片找不到原件`)
      }
      toast.success('已写进文件夹', { description: parts.join(' · ') })
    } catch (err) {
      const message = describeError(err)
      setError(message)
      setPhase('error')
      toast.error('导入失败', { description: message })
    }
  }, [openVault, pickFolder])


  // 是否该去装载：只看「上次打开过哪个文件夹」，不再额外要求一个开关位。
  // 没有内置库模式了，路径存在 = 该恢复；多一个 flag 就多一种「莫名回到欢迎页」。
  const wantsVault = supported && phase === 'unresolved' && lastVaultPath() !== null

  const status: VaultStatus = !supported
    ? 'unsupported'
    : phase === 'unresolved'
      ? wantsVault
        ? 'booting'
        : 'idle'
      : phase

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
      pickFolder,
      openFolder,
      createFolder,
      rescan,
      flush,
      migrateLegacy,
      showReport: () => setReportOpen(true),
      hideReport: () => setReportOpen(false),
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
      pickFolder,
      openFolder,
      createFolder,
      rescan,
      flush,
      migrateLegacy,
    ],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
