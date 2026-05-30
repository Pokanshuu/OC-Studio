'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface KeyboardState {
  visible: boolean
  height: number
}

const KeyboardContext = createContext<KeyboardState>({ visible: false, height: 0 })

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KeyboardState>({ visible: false, height: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const c = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!c?.isNativePlatform?.()) return

    let cancelled = false
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      if (cancelled) return

      const willShowHandler = () => {
        setState(prev => ({ visible: true, height: prev.height }))
      }
      const didShowHandler = () => {
        const vvH = window.visualViewport?.height ?? window.innerHeight
        setState({ visible: true, height: window.innerHeight - vvH })
      }
      const hideHandler = () => {
        setState({ visible: false, height: 0 })
      }

      void Keyboard.addListener('keyboardWillShow', willShowHandler)
      void Keyboard.addListener('keyboardDidShow', didShowHandler)
      void Keyboard.addListener('keyboardWillHide', hideHandler)
    }).catch(() => { /* not available on web */ })

    return () => { cancelled = true }
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
