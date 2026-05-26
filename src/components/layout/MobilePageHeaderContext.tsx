'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface MobilePageHeaderContextValue {
  title: string | null
  setConfig: (title: string | null) => void
}

const MobilePageHeaderContext = createContext<MobilePageHeaderContextValue>({
  title: null,
  setConfig: () => {},
})

export function useMobilePageHeader() {
  return useContext(MobilePageHeaderContext)
}

export function MobilePageHeaderProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)

  const setConfig = useCallback((t: string | null) => {
    setTitle(t)
  }, [])

  return (
    <MobilePageHeaderContext.Provider value={{ title, setConfig }}>
      {children}
    </MobilePageHeaderContext.Provider>
  )
}
