'use client'

import { useEffect, useRef } from 'react'
import { useMobileNavigation } from '@/components/layout/MobileNavigationContext'

export function useBackButton() {
  const { section, setSection, gallerySubTab, setGallerySubTab } = useMobileNavigation()

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

          // 2. 设置 / 历史这类带「关闭」的弹窗：先关它
          const openDialog = document.querySelector<HTMLElement>('[role="dialog"]')
          if (openDialog) {
            const close = [...openDialog.querySelectorAll('button')].find(
              (button) => (button.textContent ?? '').trim() === '关闭',
            )
            if (close) { close.click(); return }
          }

          // 3. 页面自带返回按钮时，先回上一级（分类编辑器 / 实体编辑器 / 地图 / 小说等）。
          //    弹窗开着时不点：背后那个返回按钮不可见，点了会「关掉编辑器」而不是关弹窗。
          if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) {
            const pageBack = document.querySelector('[data-mobile-back]') as HTMLButtonElement | null
            if (pageBack) {
              pageBack.click()
              return
            }
          }

          // 4. 确认框：取消（第一个按钮）
          const dialog = document.querySelector('[data-slot="alert-dialog-content"]') as HTMLElement | null
          if (dialog && dialog.closest('[data-state="open"]')) {
            const cancelBtn = dialog.querySelector('button') as HTMLButtonElement | null
            if (cancelBtn) { cancelBtn.click(); return }
          }

          // 还有别的模态浮层（没有「关闭」按钮可点的）：先别动背后的页面
          if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return

          // 5. 移动端层级返回：非首页 section → 回 gallery 首页
          if (sectionRef.current !== 'gallery') {
            setSection('gallery')
            return
          }

          // 6. gallery 内非默认子 tab → 回「角色」
          if (gallerySubTabRef.current !== 'characters') {
            setGallerySubTab('characters')
            return
          }

          // 7. 已在根级，退出应用
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
