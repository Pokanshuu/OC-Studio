'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { downloadMediaFile } from './media-download'

// ── 「保存到…」的唯一调用口 ─────────────────────────────────────────────
// 界面只调这个 hook，不直接碰 `downloadMediaFile`：
// - `saving` 防连点（双击不会弹出两个系统保存对话框）
// - 失败一律 `toast.error` 带上真实 message（读不到字节 / 写盘失败 / 权限）
// - 成功不打扰；用户取消也不算失败，同样不打扰

export interface MediaDownloadHandle {
  /** 保存一个媒体文件；返回是否真的保存成功（取消 = false） */
  save: (path: string, fallbackName?: string) => Promise<boolean>
  /** 正在保存（用来禁按钮 / 防连点） */
  saving: boolean
}

export function useMediaDownload(): MediaDownloadHandle {
  const [saving, setSaving] = useState(false)
  // state 在同一次点击里读不到最新值，防连点靠 ref
  const busy = useRef(false)

  const save = useCallback(async (path: string, fallbackName?: string): Promise<boolean> => {
    if (busy.current) return false
    busy.current = true
    setSaving(true)
    try {
      const saved = await downloadMediaFile(path, fallbackName)
      // null = 用户在保存对话框里取消了：调用方不提示
      return saved !== null
    } catch (err) {
      toast.error('保存失败', {
        description: err instanceof Error ? err.message : String(err),
      })
      return false
    } finally {
      busy.current = false
      setSaving(false)
    }
  }, [])

  return { save, saving }
}
