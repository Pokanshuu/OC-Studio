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
      // 备份只有一种：完整备份（.ocbak，图片内联）。不再提供「不含图片的 JSON」
      // —— 那是个更弱、更容易丢东西的第二格式。
      const name = await downloadFullBackup()
      toast.success(`完整备份导出成功：${name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message !== '已取消') toast.error('导出失败')
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
    setImporting(true)
    try {
      const result = await importData(pendingJson, strategy, queryClient)
      notifyDataUpdated()

      const parts: string[] = []
      if (result.added > 0) parts.push(`新增 ${result.added} 条`)
      if (result.skipped > 0) parts.push(`跳过 ${result.skipped} 条`)
      if (result.overwritten > 0) parts.push(`覆盖 ${result.overwritten} 条`)

      toast.success(`导入完成：${parts.join('，')}`)
      setConfirmOpen(false)
      setPendingJson(null)
      setSummary(null)
      onImported?.(result, strategy)
    } catch {
      toast.error('导入失败')
    } finally {
      setImporting(false)
    }
  }, [pendingJson, strategy, queryClient, onImported])

  const handleCancel = useCallback(() => {
    setConfirmOpen(false)
    setPendingJson(null)
    setSummary(null)
  }, [])

  const summaryText = summary
    ? `角色 ${summary.characters} 条，事件 ${summary.events} 条，国家 ${summary.countries} 条，词条 ${summary.worldEntries} 条，标签 ${summary.tags} 条，时期 ${summary.periods} 条`
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

          <MergeStrategyPicker value={strategy} onChange={setStrategy} />

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
