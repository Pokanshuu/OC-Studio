'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { Keyboard } from '@capacitor/keyboard'

interface KeyboardState {
  visible: boolean
  height: number
}

const KeyboardContext = createContext<KeyboardState>({ visible: false, height: 0 })

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KeyboardState>({ visible: false, height: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isCapacitor = typeof (window as unknown as { Capacitor?: unknown }).Capacitor !== 'undefined'
    if (!isCapacitor) return

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

    return () => {
      void Keyboard.removeAllListeners()
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
