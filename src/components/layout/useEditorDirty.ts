'use client'

import { useEffect } from 'react'
import { useEditor } from '@/components/layout/EditorContext'
import { useSaveStatus, type EditorEntityType } from '@/components/layout/SaveStatusContext'

/**
 * 把一个表单的 dirty 推给全局保存状态（StatusBar / 未保存守卫 / Ctrl+S）。
 *
 * 只有**当前打开的那个编辑器**有资格上报：切换分区后旧编辑器只是被 CSS 隐藏、仍挂在树上，
 * 让它继续上报会把「另一个编辑器」的状态盖到正在编辑的这个上。
 * 还没登记编辑器（`entityId === null`）时不做拦截 —— 宁可多报一次，也不能漏报导致丢改动。
 */
export function useEditorDirty(
  type: EditorEntityType,
  id: number,
  dirty: boolean,
  saving: boolean,
): void {
  const { entityType, entityId } = useEditor()
  const { reportDirty } = useSaveStatus()
  const active = entityId === null || (entityType === type && entityId === id)

  useEffect(() => {
    if (!active || saving) return
    reportDirty(dirty)
  }, [active, dirty, saving, reportDirty])
}
