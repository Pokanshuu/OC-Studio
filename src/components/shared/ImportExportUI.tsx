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
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

import { exportAllData, downloadJson } from '@/lib/export'
import { validateImportData, importData } from '@/lib/import'
import type { ImportSummary } from '@/lib/import'

export function useImportExport() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingJson, setPendingJson] = useState<unknown>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const data = await exportAllData()
      downloadJson(data)
      toast.success('导出成功')
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
      await importData(pendingJson, queryClient)
      toast.success('导入成功')
      setConfirmOpen(false)
      setPendingJson(null)
      setSummary(null)
    } catch {
      toast.error('导入失败')
    } finally {
      setImporting(false)
    }
  }, [pendingJson, queryClient])

  const handleCancel = useCallback(() => {
    setConfirmOpen(false)
    setPendingJson(null)
    setSummary(null)
  }, [])

  const summaryText = summary
    ? `角色 ${summary.characters} 条，事件 ${summary.events} 条，国家 ${summary.countries} 条，词条 ${summary.worldEntries} 条，标签 ${summary.tags} 条`
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
              此操作将<span className="text-error">覆盖现有数据</span>，当前数据库中的所有记录将被清除。
              {summaryText ? (
                <span className="mt-1 block">导入数据包含：{summaryText}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmImport}
              disabled={importing}
            >
              {importing ? '导入中...' : '确认导入'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { handleExport, handleImportClick, dialog }
}
