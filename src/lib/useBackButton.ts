'use client'

import { useEffect, useRef } from 'react'
import { useEditor } from '@/components/layout/EditorContext'
import { useNavigation } from '@/components/layout/NavigationContext'

export function useBackButton() {
  const { isEditing } = useEditor()
  const { activeItem, setActiveItem } = useNavigation()

  const isEditingRef = useRef(isEditing)
  isEditingRef.current = isEditing
  const activeItemRef = useRef(activeItem)
  activeItemRef.current = activeItem

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const setup = async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handler = await App.addListener('backButton', () => {
          // 全屏看图优先——点返回退出浏览，不回到上一级
          const fullscreenClose = document.querySelector<HTMLButtonElement>('[data-fullscreen-close]')
          if (fullscreenClose) { fullscreenClose.click(); return }
          if (isEditingRef.current) {
            const backBtn = document.querySelector('[data-mobile-back]') as HTMLButtonElement | null
            if (backBtn) { backBtn.click(); return }
          }
          const dialog = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement | null
          if (dialog && dialog.closest('[data-state="open"]')) {
            const cancelBtn = dialog.querySelector('button') as HTMLButtonElement | null
            if (cancelBtn) { cancelBtn.click(); return }
          }
          if (activeItemRef.current !== null) {
            setActiveItem(null)
            return
          }
          App.exitApp()
        })
        cleanup = () => { handler.remove() }
      } catch {
        // 非 Capacitor 环境（浏览器 / Tauri）静默跳过
      }
    }

    void setup()
    return () => { cleanup?.() }
  }, [setActiveItem])
}
