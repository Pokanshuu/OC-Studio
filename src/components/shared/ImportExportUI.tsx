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

import { exportAllData, downloadJson } from '@/lib/export'
import { validateImportData, importData } from '@/lib/import'
import type { ImportSummary, MergeStrategy } from '@/lib/import'
import { notifyDataUpdated } from '@/lib/data-events'

const MERGE_OPTIONS: { value: MergeStrategy; label: string; description: string }[] = [
  { value: 'skip', label: '跳过重复', description: '仅添加不重名的数据，已有记录保持不变' },
  { value: 'overwrite', label: '覆盖重复', description: '用导入数据替换本地同名记录' },
  { value: 'keep-both', label: '保留两者', description: '导入数据作为新条目，生成新 ID' },
  { value: 'replace', label: '清空并导入', description: '清除所有数据后导入，等同于覆盖替换' },
]

export function useImportExport() {
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
      const data = await exportAllData()
      const name = await downloadJson(data)
      toast.success(`导出成功：${name}`)
    } catch {
      toast.error('导出失败')
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
    } catch {
      toast.error('导入失败')
    } finally {
      setImporting(false)
    }
  }, [pendingJson, strategy, queryClient])

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

          <div className="flex flex-col gap-2 py-2">
            <span className="text-sm text-ink-muted">重复记录处理策略</span>
            {MERGE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  strategy === opt.value
                    ? 'border-line-hover bg-paper-card'
                    : 'border-line hover:border-line-hover'
                }`}
              >
                <input
                  type="radio"
                  name="merge-strategy"
                  value={opt.value}
                  checked={strategy === opt.value}
                  onChange={() => setStrategy(opt.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-line bg-paper-card text-ink accent-ink"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-ink">{opt.label}</span>
                  <span className="text-xs text-ink-muted">{opt.description}</span>
                  {opt.value === 'keep-both' && strategy === 'keep-both' ? (
                    <span className="text-xs text-error pt-0.5">
                      注意：关联关系（如 relatedCharacters）可能需要手动修复
                    </span>
                  ) : null}
                </div>
              </label>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>取消</AlertDialogCancel>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              className="touch-feedback inline-flex h-9 items-center justify-center rounded px-3 text-sm font-normal transition-colors border border-error bg-transparent text-error hover:bg-error/10 dark:hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
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
