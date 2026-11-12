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
import { exportLegacyToFolder } from '@/lib/vault/export-dir'
import { useVault } from '@/lib/vault/vault-provider'
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
      const name = await downloadFullBackup()
      toast.success('数据备份已导出', { description: name })
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
      // 先把待写队列清干净：否则它在导入之后才落盘，会把导入前的旧内容写回文件，
      // 紧跟着的 rescan 又用这份旧内容盖掉刚导入的行
      if (vault.status === 'ready' && vault.root !== null) await vault.flush()
      const result = await importData(pendingJson, strategy, queryClient)
      notifyDataUpdated()

      /**
       * **开着笔记库时，导入必须落到文件夹里。**
       *
       * `importData` 只写 Dexie；而这个库的真相是文件夹 —— 下次载入（重启 / 刷新）
       * 会用磁盘整库替换 Dexie，刚导进来的东西就这样消失了。以前主界面的
       * 「文件 › 导入…」与「设置 › 数据 › 导入」正是这样：导入成功、看不到、重启没。
       *
       * 落地用和「旧版本数据迁移」同一个函数（同名策略也照抄）：`skip` 时已有文件
       * 一个字都不动，只写这次新进来的那些。
       */
      const materialize =
        vault.status === 'ready' && vault.root !== null
          ? await exportLegacyToFolder(vault.root, { strategy })
          : null
      if (materialize !== null) {
        await vault.rescan()
      }

      const parts: string[] = []
      if (result.added > 0) parts.push(`新增 ${result.added} 条`)
      if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条`)
      if (result.overwritten > 0) parts.push(`覆盖 ${result.overwritten} 条`)
      if (materialize !== null) {
        parts.push(`写进文件夹 ${materialize.created} 篇`)
        if (materialize.skippedExisting > 0) parts.push(`同名跳过 ${materialize.skippedExisting} 篇`)
        if (materialize.missingImages.length > 0) {
          parts.push(`${materialize.missingImages.length} 张图片找不到原件`)
        }
      }
      if (result.config !== undefined) {
        if (result.config.restored.length > 0) parts.push(`恢复设置 ${result.config.restored.join('/')}`)
        if (result.config.kept.length > 0) parts.push(`保留当前设置 ${result.config.kept.join('/')}`)
      }
      // 指向「本库不存在」的引用会被清掉（不然会指到同号的另一条）。清了几条要说出来 ——
      // 静默清理等于「导进来少了两个关系，没人知道」。
      if (result.droppedRefs !== undefined && result.droppedRefs > 0) {
        parts.push(`清掉 ${result.droppedRefs} 条指向不存在目标的引用`)
      }
      // 创作时间线是从备份并进来的（去重之后）：说一声，用户才知道「证据」也跟过来了
      if (result.journalAdded !== undefined && result.journalAdded > 0) {
        parts.push(`历史记录 +${result.journalAdded} 条`)
      }

      toast.success(`导入完成：${parts.join('，')}`, {
        description:
          materialize !== null && materialize.created === 0 && result.added > 0
            ? '没有新文件写到磁盘：选「同名跳过」时已存在的笔记不会被覆盖，换个策略再试'
            : undefined,
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
    ? [
        `角色 ${summary.characters} 条`,
        `事件 ${summary.events} 条`,
        `国家 ${summary.countries} 条`,
        `词条 ${summary.worldEntries} 条`,
        `标签 ${summary.tags} 条`,
        `时期 ${summary.periods} 条`,
        // fork 版备份里的地图：我们有锚点模型，暂不导入，只如实告诉用户
        summary.maps ? `地图 ${summary.maps} 张（暂不导入）` : '',
        // 设置只在「目标还没配过」时恢复；这里先如实说明备份里带了什么
        summary.config ? `设置 ${summary.config.join('/')}（目标还没配过时才会恢复）` : '',
      ]
        .filter(Boolean)
        .join('，')
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
