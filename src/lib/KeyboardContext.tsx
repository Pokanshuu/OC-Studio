'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface KeyboardState {
  visible: boolean
  viewportHeight: number
}

const KeyboardContext = createContext<KeyboardState>({ visible: false, viewportHeight: 0 })

function scrollElementIntoView(el: HTMLElement) {
  const vvH = document.documentElement.clientHeight
  const rect = el.getBoundingClientRect()
  if (rect.bottom <= vvH) return

  const scroller = el.closest('.section-fade') as HTMLElement | null
  if (scroller) {
    scroller.scrollTop += rect.bottom - vvH + 8
  }
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KeyboardState>({ visible: false, viewportHeight: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!c?.isNativePlatform?.()) return

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.addListener('keyboardWillShow', () => {
        setState(prev => ({ visible: true, viewportHeight: prev.viewportHeight }))
      })
      Keyboard.addListener('keyboardDidShow', () => {
        const vvH = window.visualViewport?.height ?? window.innerHeight
        setState({ visible: true, viewportHeight: Math.max(0, window.innerHeight - vvH) })
      })
      Keyboard.addListener('keyboardWillHide', () => {
        setState({ visible: false, viewportHeight: 0 })
      })
    }).catch(() => { /* not available on web */ })

    return () => {
      import('@capacitor/keyboard').then(({ Keyboard }) => {
        Keyboard.removeAllListeners()
      }).catch(() => {})
    }
  }, [])

  // 移动端 input/textarea 键盘跟随滚动（原生 + 网页均覆盖）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isNative = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

    const isInput = (el: Element | null) => el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)

    const handleViewportResize = () => {
      if (isNative) return
      const el = document.activeElement as HTMLElement | null
      if (!el || !isInput(el)) return
      if (window.visualViewport) {
        scrollElementIntoView(el)
      }
    }

    const handleFocusIn = () => {
      if (isNative) return
      setTimeout(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || !isInput(el)) return
        scrollElementIntoView(el)
      }, 180)
    }

    window.visualViewport?.addEventListener('resize', handleViewportResize)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [])

  // 原生端键盘弹出后，滚动活跃的 input/textarea/select 到可见区域
  useEffect(() => {
    if (!state.visible) return
    const id = setTimeout(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      scrollElementIntoView(el)
    }, 30)
    return () => clearTimeout(id)
  }, [state.visible])

  return (
    <KeyboardContext.Provider value={state}>
      {children}
    </KeyboardContext.Provider>
  )
}

export function useKeyboard() {
  return useContext(KeyboardContext)
}
