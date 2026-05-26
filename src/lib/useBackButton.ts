'use client'

import { useEffect } from 'react'
import { useEditor } from '@/components/layout/EditorContext'
import { useNavigation } from '@/components/layout/NavigationContext'

export function useBackButton() {
  const { isEditing } = useEditor()
  const { activeItem, setActiveItem } = useNavigation()

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const setup = async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handler = await App.addListener('backButton', () => {
          if (isEditing) {
            const backBtn = document.querySelector('[data-mobile-back]') as HTMLButtonElement | null
            if (backBtn) { backBtn.click(); return }
          }
          const dialog = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement | null
          if (dialog && dialog.closest('[data-state="open"]')) {
            const cancelBtn = dialog.querySelector('button') as HTMLButtonElement | null
            if (cancelBtn) { cancelBtn.click(); return }
          }
          if (activeItem !== null) {
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
  }, [isEditing, activeItem, setActiveItem])
}
