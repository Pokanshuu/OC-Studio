'use client'

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'

interface KeyboardState {
  visible: boolean
  height: number
}

const KeyboardContext = createContext<KeyboardState>({ visible: false, height: 0 })

function scrollElementIntoView(el: HTMLElement) {
  const vvH = window.visualViewport?.height ?? window.innerHeight
  const rect = el.getBoundingClientRect()
  if (rect.bottom <= vvH) return

  const scroller = el.closest('.section-fade') as HTMLElement | null
  if (scroller) {
    scroller.scrollTop += rect.bottom - vvH + 8
  }
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KeyboardState>({ visible: false, height: 0 })
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (typeof window === 'undefined') return
    const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!c?.isNativePlatform?.()) return

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.addListener('keyboardWillShow', () => {
        setState(prev => ({ visible: true, height: prev.height }))
      })
      Keyboard.addListener('keyboardDidShow', () => {
        const vvH = window.visualViewport?.height ?? window.innerHeight
        setState({ visible: true, height: Math.max(0, window.innerHeight - vvH) })
      })
      Keyboard.addListener('keyboardWillHide', () => {
        setState({ visible: false, height: 0 })
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

    const handleViewportResize = () => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      // 用 ref 覆盖 Capacitor 原生场景，visualViewport 覆盖网页场景
      if (stateRef.current.visible || window.visualViewport) {
        scrollElementIntoView(el)
      }
    }

    const handleFocusIn = () => {
      setTimeout(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
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

  return (
    <KeyboardContext.Provider value={state}>
      {children}
    </KeyboardContext.Provider>
  )
}

export function useKeyboard() {
  return useContext(KeyboardContext)
}
