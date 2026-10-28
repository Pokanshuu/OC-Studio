'use client'

import { useState } from 'react'
import { useSettings } from './settings'
import { resolveEditorLayout } from './editor-layout'

/**
 * 编辑器挂载时解析一次布局。
 *
 * 不跟随设置/窗口实时重排：切换多栏 ↔ 全屏会重挂 TipTap，未保存正文会丢。
 * 各实体编辑器的 inner 以实体 id 为 key，换人/重新打开时重新解析。
 */
export function useInitialEditorLayout(): 'multi' | 'full' {
  const { settings } = useSettings()
  const [layout] = useState<'multi' | 'full'>(() => {
    if (typeof window === 'undefined') return 'full'
    if (window.innerWidth < 768) return 'full'
    return resolveEditorLayout(settings.editorLayout, window.innerWidth)
  })
  return layout
}
