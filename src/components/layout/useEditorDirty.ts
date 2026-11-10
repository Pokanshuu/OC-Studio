'use client'

import { useEffect, useRef } from 'react'
import { useEditor } from '@/components/layout/EditorContext'
import { useSaveStatus, type EditorEntityType } from '@/components/layout/SaveStatusContext'

/**
 * 把一个表单的 dirty 推给全局保存状态（StatusBar / 未保存守卫 / Ctrl+S）。
 *
 * 只有**当前打开的那个编辑器**有资格上报：切换分区后旧编辑器只是被 CSS 隐藏、仍挂在树上，
 * 让它继续上报会把「另一个编辑器」的状态盖到正在编辑的这个上。
 * 还没登记编辑器（`entityId === null`）时不做拦截 —— 宁可多报一次，也不能漏报导致丢改动。
 *
 * `detail` 只用于诊断：脏的**原因**（哪些键变了 / 还是正文）会打进 console，
 * Next dev 会把浏览器 console 转发到终端日志，出现「没改却提示未保存」时据此定位。
 */
export function useEditorDirty(
  type: EditorEntityType,
  id: number,
  dirty: boolean,
  saving: boolean,
  detail?: string,
): void {
  const { entityType, entityId } = useEditor()
  const { reportDirty, resetStatus } = useSaveStatus()
  const active = entityId === null || (entityType === type && entityId === id)
  const wasDirtyRef = useRef(false)

  /**
   * 卸载（切分区 / 关编辑器）时把全局状态收回 idle。
   *
   * 实体编辑器只是被 CSS 隐藏、或直接卸载时，`reportDirty(true)` 留下的「未保存」
   * 会挂到**下一个页面**上：切到世界观看笔记，状态栏却写着未保存，离开时还会弹
   * 「有未保存的更改吗」—— 而那个页面什么都没改。
   */
  useEffect(() => {
    return () => resetStatus()
  }, [resetStatus])

  useEffect(() => {
    if (!active || saving) return

    if (process.env.NODE_ENV !== 'production') {
      if (dirty && !wasDirtyRef.current) {
        console.warn(`[dirty] ${type}#${id} 变脏 —— ${detail || '(未提供原因)'}`)
      } else if (!dirty && wasDirtyRef.current) {
        console.warn(`[dirty] ${type}#${id} 回到干净`)
      }
    }
    wasDirtyRef.current = dirty

    reportDirty(dirty)
  }, [active, dirty, detail, saving, reportDirty, type, id])
}
