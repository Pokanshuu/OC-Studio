'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type NavigationSource =
  | 'eventList'
  | 'characterList'
  | 'countryList'
  | 'timeline'
  | 'relations'
  | null

interface NavigationSourceContextValue {
  source: NavigationSource
  setSource: (src: NavigationSource) => void
  clearSource: () => void
}

const NavigationSourceContext = createContext<NavigationSourceContextValue>({
  source: null,
  setSource: () => {},
  clearSource: () => {},
})

export function useNavigationSource(): NavigationSourceContextValue {
  return useContext(NavigationSourceContext)
}

export function NavigationSourceProvider({ children }: { children: ReactNode }) {
  const [source, setSourceState] = useState<NavigationSource>(null)

  const setSource = useCallback((src: NavigationSource) => {
    setSourceState(src)
  }, [])

  const clearSource = useCallback(() => {
    setSourceState(null)
  }, [])

  return (
    <NavigationSourceContext.Provider value={{ source, setSource, clearSource }}>
      {children}
    </NavigationSourceContext.Provider>
  )
}
