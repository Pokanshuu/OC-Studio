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
import { flushPendingSaves } from '@/lib/pending-saves'
import type { MergeStrategy } from '@/lib/import'
import { setVaultImageContext } from '@/lib/image-service'
import {
  failuresFromVaultReport,
  runGuardedTransition,
  runSaveBarrier,
  type SaveBarrierFailure,
} from '@/lib/save-barrier'
import { reportSaveBarrierFailures } from '@/lib/save-feedback'
import { createConflictConfirmation, type ConflictConfirmationRequest } from './conflict-confirmation'
import { exportLegacyToFolder } from './export-dir'
import { backupLegacyData } from './legacy-backup'
import { pickAssetsDir } from './vault-paths'
import { loadVault, type VaultLoadResult } from './vault-load'
import { isVaultSupported, vaultFs } from './vault-fs'
import {
  currentStatus,
  discardConflict,
  drainVaultWrites,
  installVaultPersist,
  subscribeVaultWriteStatus,
  type VaultFlushReport,
  type VaultWriteStatus,
} from './vault-persist'
import {
  adoptDiskAndReload,
  reloadAfterSaveBarrier,
  type VaultReloadResult,
} from './vault-reload'
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
  /**
   * 普通刷新：保存屏障全绿才按磁盘内容重载。
   * 返回结果让调用方（导入页等）能区分「重载成功 / 被拦下 / 失败」，不要只 toast。
   */
  rescan: () => Promise<VaultReloadResult>
  /**
   * 明确「采用磁盘版本」：先确认放弃指定本地冲突，再排干其它写入、重新读盘。
   * 不传 `paths` 时从当前未解决冲突里取；**不会**先覆盖外部文件。
   */
  adoptDiskVersion: (paths?: string[]) => Promise<VaultReloadResult>
  /** 等待用户确认的冲突列表；非空时 `VaultConflictDialog` 会弹出 */
  conflictChoice: ConflictConfirmationRequest | null
  answerConflictChoice: (confirmed: boolean) => void
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
  /** 等待用户确认「采用磁盘版本」的冲突文件；null = 没有对话框 */
  const [conflictChoice, setConflictChoice] = useState<ConflictConfirmationRequest | null>(null)
  const [conflictConfirmation] = useState(() => createConflictConfirmation(setConflictChoice))

  const answerConflictChoice = useCallback(
    (confirmed: boolean) => {
      conflictConfirmation.answer(confirmed)
    },
    [conflictConfirmation],
  )

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

  /**
   * 真正的开库动作：读盘 → 整库替换 → 建立会话。
   *
   * **不在这里做保存屏障**：屏障必须在调用方、在 `setPhase('loading')` **之前**完成，
   * 否则 VaultGate 会先撤下编辑器，那些还没提交的草稿就没有人来写了。
   *
   * `previousRoot` 用来区分「换库失败」与「首次开库失败」：前者保留原库与原界面，
   * 后者才显示错误页。
   */
  const openVault = useCallback(
    async (
      path: string,
      options?: { boot?: boolean; announce?: boolean; backupLegacy?: boolean; previousRoot?: string | null },
    ): Promise<boolean> => {
      try {
        const probe = await vaultFs.probe(path)
        if (!probe.exists) throw new Error('文件夹不存在，可能已被移动或删除')
        if (!probe.isDir) throw new Error('选择的路径不是文件夹')

        // 首次绑定笔记库：这次开库会整库替换 Dexie，内置库里那份旧数据就此消失
        // （「新建文件夹」尤其危险，空文件夹进去，旧的换不回来）。
        // 所以先导一份 .ocbak 落进目标文件夹；写不出来就中止 —— 宁可打不开，也不能白清。
        // 从旧数据主动落地（migrateLegacy）时跳过：数据本来就已经写进那个文件夹了。
        if (options?.backupLegacy !== false && lastVaultPath() === null) {
          try {
            const backup = await backupLegacyData(path)
            if (backup !== null) {
              toast.info('旧版本数据已备份到笔记库', { description: backup })
            }
          } catch (err) {
            throw new Error(`旧版本数据备份失败，已取消打开：${describeError(err)}`)
          }
        }

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
        return true
      } catch (err) {
        const message = describeError(err)
        const keepCurrent = options?.previousRoot != null
        // 换库失败：原库、原界面、原草稿都留着（用户还能继续编辑 / 重试）
        setError(keepCurrent ? null : message)
        setPhase(keepCurrent ? 'ready' : 'error')
        toast.error('打开笔记库失败', { description: message })
        return false
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

  /**
   * 明确「采用磁盘版本」：恢复 Q08 被堵住的出口。
   *
   * 与普通刷新不同，它允许用户**放弃指定本地冲突**去采纳外部文件；但必须：
   * 1. 先弹出确认（取消 = 两边都不动）；
   * 2. 确认后只 `discardConflict`，不调用 `overwriteConflicts` —— 绝不先覆盖外部文件；
   * 3. 排干其它普通写入后再读盘，失败/取消原样返回给调用方。
   */
  const adoptDiskVersion = useCallback(
    async (paths?: string[]): Promise<VaultReloadResult> => {
      if (root === null) return { status: 'failed', error: '当前没有打开的笔记库' }

      // Submit every editor draft before discovering conflicts; unrelated drafts
      // must reach the queue before a full-cache reload can replace their rows.
      try {
        await flushPendingSaves()
      } catch (error) {
        const failures: SaveBarrierFailure[] = [{ stage: 'draft', message: describeError(error) }]
        reportSaveBarrierFailures(failures)
        return { status: 'blocked', failures }
      }

      let targets = [
        ...new Set((paths ?? []).map((path) => path.trim()).filter((path) => path !== '')),
      ]

      if (targets.length === 0) {
        // 从当前队列里找真正未解决的冲突。这里只做普通 drain，不带 overwriteConflicts。
        let preview: VaultFlushReport
        try {
          preview = await drainVaultWrites()
        } catch (error) {
          return { status: 'failed', error: describeError(error) }
        }
        targets = [...new Set(preview.conflicts)]
        if (targets.length === 0) {
          const failures = failuresFromVaultReport(preview)
          if (failures.length > 0) {
            reportSaveBarrierFailures(failures)
            return { status: 'blocked', failures }
          }
          toast.info('没有需要采用的磁盘冲突')
          return { status: 'cancelled' }
        }
      }

      const confirmed = await conflictConfirmation.request(targets)
      if (!confirmed) return { status: 'cancelled' }

      // The confirmation may have stayed open while an editor submitted more text.
      try {
        await flushPendingSaves()
      } catch (error) {
        const failures: SaveBarrierFailure[] = [{ stage: 'draft', message: describeError(error) }]
        reportSaveBarrierFailures(failures)
        return { status: 'blocked', failures }
      }

      setPhase('loading')
      const result = await adoptDiskAndReload(targets, {
        discard: (relPath) => discardConflict(relPath),
        drain: () => drainVaultWrites(),
        status: () => currentStatus(),
        reload: async () => {
          const data = await loadVault(root)
          setReport(data)
          refreshLists()
        },
      })
      setPhase('ready')

      if (result.status === 'reloaded') {
        toast.success('已采用磁盘版本', {
          description: '未写入的本地冲突已放弃；磁盘上的文件没有被改写',
        })
      } else if (result.status === 'failed') {
        toast.error('采用磁盘版本失败', { description: result.error })
      } else if (result.status === 'blocked') {
        reportSaveBarrierFailures(result.failures)
      }
      return result
    },
    [conflictConfirmation, refreshLists, root],
  )

  /** 屏障被冲突拦下时的统一回执：给「采用磁盘版本」和「覆盖磁盘」两个明确方向 */
  const reportBlocked = useCallback(
    (failures: SaveBarrierFailure[]) => {
      reportSaveBarrierFailures(failures, {
        adoptDisk: (paths) => {
          void adoptDiskVersion(paths)
        },
      })
    },
    [adoptDiskVersion],
  )

  /**
   * 换库的统一入口：**先保存屏障，再进入 loading**。
   *
   * 以前这里先 `setPhase('loading')`，VaultGate 立刻撤下主界面、编辑器卸载，
   * 随后才 drain 队列 —— 那些还在表单/防抖计时器里的草稿根本不在队列里，直接丢。
   * 现在屏障失败就原地不动：原库、原草稿、原界面都保留。
   */
  const openFolder = useCallback(
    async (path?: string) => {
      const target = path ?? (await pickFolder())
      if (target === null) return

      const previousRoot = root
      await runGuardedTransition(
        runSaveBarrier,
        reportBlocked,
        async () => {
          setPhase('loading')
          setError(null)
          await openVault(target, { previousRoot })
        },
      )
    },
    [openVault, pickFolder, reportBlocked, root],
  )

  const createFolder = useCallback(
    async (path?: string) => {
      const target = path ?? (await pickFolder())
      if (target === null) return

      const previousRoot = root
      await runGuardedTransition(
        runSaveBarrier,
        reportBlocked,
        async () => {
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
            await openVault(target, { boot: true, previousRoot })
          } catch (err) {
            const message = describeError(err)
            const keepCurrent = previousRoot !== null
            setError(keepCurrent ? null : message)
            setPhase(keepCurrent ? 'ready' : 'error')
            toast.error('新建笔记库失败', { description: message })
          }
        },
      )
    },
    [openVault, pickFolder, reportBlocked, root],
  )

  /**
   * 普通刷新：「以文件夹为准重载」。
   *
   * 语义（明确，不含糊）：先把所有草稿保存到磁盘、落盘队列全绿，才用磁盘内容
   * 整库覆盖内存；有失败或冲突就**不重载**，返回 `blocked` 让调用方不要报成功。
   * 想放弃本地冲突、采纳磁盘版本，必须走显式的 `adoptDiskVersion()`（会再确认）。
   */
  const rescan = useCallback(async (): Promise<VaultReloadResult> => {
    if (root === null) return { status: 'failed', error: '当前没有打开的笔记库' }

    const result = await reloadAfterSaveBarrier({
      barrier: runSaveBarrier,
      reload: () => loadVault(root),
      onBlocked: reportBlocked,
    })

    if (result.status === 'reloaded') {
      setReport(result.value)
      refreshLists()
      toast.success('已按文件夹内容重新载入', { description: countsSummary(result.value) })
      return { status: 'reloaded' }
    }
    if (result.status === 'failed') {
      toast.error('重新载入失败', { description: result.error })
      return result
    }
    return result
  }, [refreshLists, reportBlocked, root])

  /**
   * 只重试落盘队列（顶部「保存异常」提示条的「重试保存」用它）。
   *
   * 关窗 / 换库不走这里 —— 它们必须连同草稿一起走 `runSaveBarrier()`。这里不抛错，
   * 因为按钮的 onClick 是 `void flush()`；失败统一交给 `reportBlocked` 展示，
   * 冲突时给出「采用磁盘版本 / 覆盖磁盘」两个明确方向。
   */
  const flush = useCallback(async () => {
    try {
      const result = await drainVaultWrites()
      const failures = failuresFromVaultReport(result)
      if (failures.length > 0) reportBlocked(failures)
    } catch (err) {
      reportSaveBarrierFailures([{ stage: 'disk', message: describeError(err) }])
    }
  }, [reportBlocked])

  // 老数据迁移：把 Dexie 全量物化进一个**空文件夹**，然后打开它。
  //
  // 不在迁移前强制导 .ocbak：点了「搬到文件夹」却弹一个保存对话框，是在做另一件事。
  // 不需要那层保险也安全 —— 迁移只写不删，而清空 Dexie 发生在**写盘成功之后**
  // （loadVault 里），写盘失败就直接抛错停在这里，旧数据一个字节都没动。
  // 想自己备份的用户可以在下拉菜单里显式导出。
  const migrateLegacy = useCallback(async (options?: { path?: string; strategy?: MergeStrategy }) => {
    const target = options?.path ?? (await pickFolder())
    if (target === null) return

    // 先把当前库的草稿与队列写完，再往目标文件夹物化；屏障失败就原地不动
    const previousRoot = root
    await runGuardedTransition(
      runSaveBarrier,
      reportBlocked,
      async () => {
        setPhase('loading')
        setError(null)
        try {
          const result = await exportLegacyToFolder(target, { strategy: options?.strategy })
          const loaded = await openVault(target, {
            boot: true,
            announce: false,
            backupLegacy: false,
            previousRoot,
          })
          if (!loaded) return

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
          const keepCurrent = previousRoot !== null
          setError(keepCurrent ? null : message)
          setPhase(keepCurrent ? 'ready' : 'error')
          toast.error('导入失败', { description: message })
        }
      },
    )
  }, [openVault, pickFolder, reportBlocked, root])


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
      adoptDiskVersion,
      conflictChoice,
      answerConflictChoice,
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
      adoptDiskVersion,
      conflictChoice,
      answerConflictChoice,
      flush,
      migrateLegacy,
    ],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}
