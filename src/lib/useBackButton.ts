'use client'

import { useEffect, useRef } from 'react'
import { useEditor } from '@/components/layout/EditorContext'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'

export function useBackButton() {
  const { isEditing } = useEditor()
  const { section, setSection, gallerySubTab, setGallerySubTab } = useMobileNavigation()

  const isEditingRef = useRef(isEditing)
  isEditingRef.current = isEditing
  const sectionRef = useRef(section)
  sectionRef.current = section
  const gallerySubTabRef = useRef(gallerySubTab)
  gallerySubTabRef.current = gallerySubTab

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const setup = async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handler = await App.addListener('backButton', () => {
          // 1. 全屏看图优先——点返回退出浏览，不回到上一级
          const fullscreenClose = document.querySelector<HTMLButtonElement>('[data-fullscreen-close]')
          if (fullscreenClose) { fullscreenClose.click(); return }

          // 2. 编辑器打开时，返回列表
          if (isEditingRef.current) {
            const backBtn = document.querySelector('[data-mobile-back]') as HTMLButtonElement | null
            if (backBtn) { backBtn.click(); return }
          }

          // 3. 弹窗打开时，先关弹窗
          const dialog = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement | null
          if (dialog && dialog.closest('[data-state="open"]')) {
            const cancelBtn = dialog.querySelector('button') as HTMLButtonElement | null
            if (cancelBtn) { cancelBtn.click(); return }
          }

          // 4. 移动端层级返回：非首页 section → 回 gallery 首页
          if (sectionRef.current !== 'gallery') {
            setSection('gallery')
            return
          }

          // 5. gallery 内非默认子 tab → 回「角色」
          if (gallerySubTabRef.current !== 'characters') {
            setGallerySubTab('characters')
            return
          }

          // 6. 已在根级，退出应用
          App.exitApp()
        })
        cleanup = () => { handler.remove() }
      } catch {
        // 非 Capacitor 环境（浏览器 / Tauri）静默跳过
      }
    }

    void setup()
    return () => { cleanup?.() }
  }, [setSection, setGallerySubTab])
}
