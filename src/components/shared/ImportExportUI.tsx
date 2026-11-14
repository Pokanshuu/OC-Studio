'use client'

import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

import { downloadFullBackup } from '@/lib/export'
import { validateImportData, importData } from '@/lib/import'
import { importIntoOpenVault } from '@/lib/vault/import-live'
import { useVault } from '@/lib/vault/vault-provider'
import { describeReloadBlock } from '@/lib/vault/vault-reload'
import { runSaveBarrier } from '@/lib/save-barrier'
import { reportSaveBarrierFailures } from '@/lib/save-feedback'
import type { ImportResult, ImportSummary, MergeStrategy } from '@/lib/import'
import { notifyDataUpdated } from '@/lib/data-events'
import { BTN_DANGER, BTN_PRIMARY } from '@/lib/ui-tokens'
import { MergeStrategyPicker } from './merge-strategy'

/** 导入导出。备份格式只有一种：`.ocbak`（可被 `.json` 后缀兼容），版本字段由 `validateImportData` 判定 */
export function useImportExport(options?: {
  /** 导入成功后的回调：启动闸门用它接着把数据落到文件夹里 */
  onImported?: (result: ImportResult, strategy: MergeStrategy) => void
}) {
  const onImported = options?.onImported
  const queryClient = useQueryClient()
  const vault = useVault()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingJson, setPendingJson] = useState<unknown>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [strategy, setStrategy] = useState<MergeStrategy>('skip')

  const handleExport = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      // 备份只有一种：.ocbak（图片内联）。不再提供「不含图片的 JSON」——那是更弱、更容易丢东西的第二格式
      // —— 那是个更弱、更容易丢东西的第二格式。
      const { fileName, missingImages, skippedImages, configWarnings, complete } = await downloadFullBackup()
      const issues: string[] = []
      if (missingImages.length > 0) issues.push(`${missingImages.length} 张图片找不到原件（备份里只有路径）`)
      if (skippedImages.length > 0) issues.push(`${skippedImages.length} 个 blob: 素材只在当前会话有效，未写入`)
      if (configWarnings.length > 0) issues.push(`部分设置没读出来：${configWarnings.join('；')}`)
      // 有遗漏时不能用 success：导出成功不等于内容齐全（与备份页签同一口径）
      if (issues.length > 0 || complete === false) {
        toast.warning('数据备份已导出，但不完整', {
          description: `${fileName}；${issues.join('；')}`,
        })
      } else {
        toast.success('数据备份已导出', { description: fileName })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message !== '已取消') {
        toast.error('导出失败', { description: message || undefined })
      }
    } finally {
      setExporting(false)
    }
  }, [exporting])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)
        const s = validateImportData(json)
        setPendingJson(json)
        setSummary(s)
        setStrategy('skip')
        setConfirmOpen(true)
      } catch (err) {
        const message = err instanceof Error ? err.message : '无效的数据格式'
        toast.error(message)
      }
    }
    reader.onerror = () => {
      toast.error('文件读取失败')
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  const handleConfirmImport = useCallback(async () => {
    if (!pendingJson) return
    // 「替换」= 清空整库。开着笔记库时这条路只说清一半（Dexie 被清空、文件还在），
    // 刷新之后旧笔记又全回来 —— 与其给出一个假替换，不如当场拒绝并说清楚。
    if (vault.status === 'ready' && vault.root !== null && strategy === 'replace') {
      toast.error('笔记库开着时不能用「替换」导入', {
        description: '替换会清空当前库。请改用「跳过」或「覆盖」，或换个文件夹后从欢迎页导入。',
      })
      return
    }
    setImporting(true)
    try {
      /*
       * 导入前必须走**完整保存屏障**，不能只 drain 队列：表单 / 词条草稿还在
       * 防抖计时器里时，只清队列等于没清 —— 它们在导入之后才写进 Dexie，
       * 随后 rescan 又把导入的内容盖掉。屏障失败就中止，库保持原样。
       */
      const failures = await runSaveBarrier()
      if (failures.length > 0) {
        reportSaveBarrierFailures(failures)
        return
      }
      const liveImport = vault.status === 'ready' && vault.root !== null
        ? await importIntoOpenVault(vault.root, pendingJson, strategy, queryClient)
        : null
      const result = liveImport?.result ?? await importData(pendingJson, strategy, queryClient)
      notifyDataUpdated()

      /**
       * **开着笔记库时，导入必须落到文件夹里。**
       *
       * `importData` 只写 Dexie；而这个库的真相是文件夹 —— 下次载入（重启 / 刷新）
       * 会用磁盘整库替换 Dexie，刚导进来的东西就这样消失了。以前主界面的
       * 「文件 › 导入…」与「设置 › 数据 › 导入」正是这样：导入成功、看不到、重启没。
       *
       * 只通过 vault-persist 队列落盘；图片在落库后单独准备并回写图片字段。
       * 不能再并行调用整库 exportLegacyToFolder：它会与队列争写同一批文件，
       * 产生 createOnly / mtime 自冲突，keep-both 还会把已有条目复制一次。
       */
      if (liveImport !== null) {
        const reload = await vault.rescan()
        /**
         * 重载可能被保存屏障拦下（磁盘冲突 / 写入失败）。`rescan` 现在返回结果而不是
         * 只 toast，这里必须检查：否则导入页会在界面仍是旧数据时报告“导入完成”。
         */
        const reloadBlock = describeReloadBlock(reload)
        if (reloadBlock !== null) {
          toast.error('导入数据已合并，但保存或重新载入未完成', { description: reloadBlock })
          setConfirmOpen(false)
          setPendingJson(null)
          setSummary(null)
          return
        }
        // rescan 之后 Dexie 才真正变成新数据。`importData` 里的那次 invalidate
        // 发生在 rescan 之前，查询已经用旧缓存刷过一轮；这里必须再来一次，
        // 否则列表 / 相册 / 计数要等到重启才更新（2026-11-14 实测）。
        await queryClient.invalidateQueries()
        notifyDataUpdated()
      }

      const parts: string[] = []
      if (result.added > 0) parts.push(`新增 ${result.added} 条`)
      if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条`)
      if (result.overwritten > 0) parts.push(`覆盖 ${result.overwritten} 条`)
      if (liveImport !== null) {
        if (liveImport.images > 0) parts.push(`写入图片 ${liveImport.images} 张`)
        if (liveImport.missingImages.length > 0) {
          parts.push(`${liveImport.missingImages.length} 张图片找不到原件`)
        }
        if (liveImport.skippedImages.length > 0) parts.push(`${liveImport.skippedImages.length} 个临时图片未写入`)
      }
      if (result.config !== undefined) {
        if (result.config.restored.length > 0) parts.push(`恢复设置 ${result.config.restored.join('/')}`)
        if (result.config.kept.length > 0) parts.push(`保留当前设置 ${result.config.kept.join('/')}`)
        // 灵感是内容不是设置：即使设置整段保留，它也会按条合并；冲突副本要说清
        const inspirations = result.config.inspirations
        if (inspirations !== undefined) {
          if (inspirations.conflicts > 0) {
            parts.push(`灵感冲突另存 ${inspirations.conflicts} 条（本地原文未动）`)
          } else if (inspirations.added > 0) {
            parts.push(`灵感 +${inspirations.added} 条`)
          }
        }
      }
      // 指向「本库不存在」的引用会被清掉（不然会指到同号的另一条）。清了几条要说出来 ——
      // 静默清理等于「导进来少了两个关系，没人知道」。
      if (result.droppedRefs !== undefined && result.droppedRefs > 0) {
        parts.push(`清掉 ${result.droppedRefs} 条指向不存在目标的引用`)
      }
      if (result.namedRefsKept !== undefined && result.namedRefsKept > 0) {
        parts.push(`保留 ${result.namedRefsKept} 条命名关系原文（只解除失效跳转）`)
      }
      if (result.bodyRefsUnlinked !== undefined && result.bodyRefsUnlinked > 0) {
        parts.push(`${result.bodyRefsUnlinked} 处正文引用保留文字、解除跳转`)
      }
      if (result.conflicts !== undefined && result.conflicts.length > 0) {
        parts.push(`${result.conflicts.length} 条同名歧义未导入`)
      }
      if (result.ignored !== undefined && result.ignored.length > 0) {
        parts.push(`规范化 / 忽略 ${result.ignored.length} 条`)
      }
      // 创作时间线是从备份并进来的（去重之后）：说一声，用户才知道「证据」也跟过来了
      if (result.journalAdded !== undefined && result.journalAdded > 0) {
        parts.push(`历史记录 +${result.journalAdded} 条`)
      }

      // 冲突 / 被忽略的条目不能只给一个数字：至少把前两条的「谁、为什么」摆出来
      const details: string[] = []
      if (result.conflicts && result.conflicts.length > 0) {
        details.push(
          ...result.conflicts
            .slice(0, 2)
            .map((conflict) => `${conflict.table}「${conflict.title}」：${conflict.reason}`),
        )
      }
      if (result.ignored && result.ignored.length > 0) {
        details.push(...result.ignored.slice(0, 2).map((issue) => `${issue.path}：${issue.message}`))
      }

      if (result.incomplete !== undefined) {
        details.unshift(`原备份缺少：${result.incomplete.join('、')}`)
      }
      const hasMediaIssues = liveImport !== null && (liveImport.missingImages.length > 0 || liveImport.skippedImages.length > 0)
      const announce = result.incomplete !== undefined || hasMediaIssues ? toast.warning : toast.success
      announce(`导入完成：${parts.join('，')}`, {
        description: details.length > 0 ? details.join('；') : undefined,
      })
      setConfirmOpen(false)
      setPendingJson(null)
      setSummary(null)
      onImported?.(result, strategy)
    } catch (error) {
      // 以前只有一句「导入失败」：既不知道是备份坏了、还是写盘坏了，也没法照着修
      toast.error('导入失败', {
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setImporting(false)
    }
  }, [pendingJson, strategy, queryClient, onImported, vault])

  const handleCancel = useCallback(() => {
    setConfirmOpen(false)
    setPendingJson(null)
    setSummary(null)
  }, [])

  const summaryText = summary
    ? (() => {
        const parts = [
          `角色 ${summary.characters} 条`,
          `事件 ${summary.events} 条`,
          `国家 ${summary.countries} 条`,
          `词条 ${summary.worldEntries} 条`,
          `标签 ${summary.tags} 条`,
          `时期 ${summary.periods} 条`,
        ]
        // fork 版备份里的地图：我们有锚点模型，暂不导入，只如实告诉用户
        if (summary.maps) parts.push(`地图 ${summary.maps} 张（暂不导入）`)
        // 设置只在「目标还没配过」时恢复；灵感是内容，永远按条合并 —— 两句话必须分开
        const configLabels = summary.config?.filter((label) => label !== '灵感') ?? []
        if (configLabels.length > 0) {
          parts.push(`设置 ${configLabels.join('/')}（目标还没配过时才会恢复）`)
        }
        if (summary.config?.includes('灵感')) {
          parts.push('灵感（按条合并，不受设置开关限制）')
        }
        if (summary.issues && summary.issues.length > 0) {
          parts.push(`载荷问题 ${summary.issues.length} 条（按规范化结果导入）`)
        }
        return parts.join('，')
      })()
    : ''

  const dialog = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ocbak,.json"
        className="hidden"
        onChange={handleFileSelected}
      />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认导入数据</AlertDialogTitle>
            <AlertDialogDescription>
              {summaryText ? (
                <span className="mt-1 block">导入数据包含：{summaryText}</span>
              ) : null}
              {summary?.incomplete !== undefined ? (
                <span className="mt-1 block text-warning">备份不完整，缺少：{summary.incomplete.join('、')}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <MergeStrategyPicker
            value={strategy}
            onChange={setStrategy}
            disabled={
              // 笔记库开着时「替换」做不到（清 Dexie 清不掉磁盘），当场灰掉并说明，
              // 不让人选了、点确认、再吃一个错误提示
              vault.status === 'ready' && vault.root !== null
                ? { replace: '笔记库开着时不可用：替换会清空当前库，先换个文件夹再从欢迎页导入' }
                : undefined
            }
          />

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>取消</AlertDialogCancel>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className={strategy === 'replace' ? BTN_DANGER : BTN_PRIMARY}
            >
              {importing ? '导入中...' : '确认导入'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { handleExport, handleImportClick, dialog }
}
