'use client'

import { useSyncExternalStore } from 'react'
import { useSettings } from './settings'
import { resolveEditorLayout } from './editor-layout'

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

function getSnapshot() {
  return window.innerWidth
}

function getServerSnapshot() {
  return 1920
}

/**
 * 当前应使用的编辑布局（跟随窗口宽度 + 设置）。
 *
 * 只负责「想要哪种布局」；是否马上切换由各编辑器决定：
 * 角色/事件/国家在正文未保存时先不切（切布局会重挂 TipTap），世界先 flush 草稿再切。
 */
export function useEditorLayout(): 'multi' | 'full' {
  const { settings } = useSettings()
  const width = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (width < 768) return 'full'
  return resolveEditorLayout(settings.editorLayout, width)
}
