'use client'

import { useState, useCallback } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { ActionItem } from '@/components/shared/MobileActionSheet'
import type { Period } from '@/types'
import { usePeriods } from '@/features/periods'

/**
 * 时期的增删改 + 移动端长按面板状态。
 * 弹窗（`PeriodDialog`）与删除确认（`AlertDialog`）的开关状态也在这里，
 * 调用方只负责渲染。
 */
export function usePeriodEditor() {
  const { periods, addPeriod, updatePeriod, removePeriod } = usePeriods()
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<Period | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Period | null>(null)
  const [actionSheet, setActionSheet] = useState<{ open: boolean; title: string; actions: ActionItem[] }>({
    open: false, title: '', actions: [],
  })

  const openNewPeriodDialog = useCallback(() => {
    setEditingPeriod(undefined)
    setPeriodDialogOpen(true)
  }, [])

  const openEditPeriodDialog = useCallback((period: Period) => {
    setEditingPeriod(period)
    setPeriodDialogOpen(true)
  }, [])

  const closePeriodDialog = useCallback(() => {
    setPeriodDialogOpen(false)
    setEditingPeriod(undefined)
  }, [])

  const handlePeriodSave = useCallback(async (data: { name: string; startTime: string; endTime: string; color: string }) => {
    if (editingPeriod?.id) {
      await updatePeriod(editingPeriod.id, data)
    } else {
      await addPeriod(data)
    }
  }, [editingPeriod, addPeriod, updatePeriod])

  const handlePeriodDelete = useCallback(async () => {
    if (deleteTarget?.id) {
      await removePeriod(deleteTarget.id)
    }
    setDeleteTarget(null)
  }, [deleteTarget, removePeriod])

  const openPeriodActionSheet = useCallback((period: Period) => {
    setActionSheet({
      open: true,
      title: period.name,
      actions: [
        { id: 'edit', label: '编辑', icon: <Pencil size={20} strokeWidth={2} />, onPress: () => openEditPeriodDialog(period) },
        { id: 'delete', label: '删除', icon: <Trash2 size={20} strokeWidth={2} />, destructive: true, onPress: () => setDeleteTarget(period) },
      ],
    })
  }, [openEditPeriodDialog])

  return {
    periods,
    periodDialogOpen,
    editingPeriod,
    deleteTarget,
    setDeleteTarget,
    actionSheet,
    setActionSheet,
    openNewPeriodDialog,
    openEditPeriodDialog,
    closePeriodDialog,
    handlePeriodSave,
    handlePeriodDelete,
    openPeriodActionSheet,
  }
}
