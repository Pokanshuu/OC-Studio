'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface NavigationContextValue {
  activeItem: string | null
  setActiveItem: (item: string | null) => void
}

const NavigationContext = createContext<NavigationContextValue>({
  activeItem: null,
  setActiveItem: () => {},
})

export function useNavigation(): NavigationContextValue {
  return useContext(NavigationContext)
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeItem, setActiveItem] = useState<string | null>(null)

  const handleSetActive = useCallback((item: string | null) => {
    setActiveItem(item)
  }, [])

  return (
    <NavigationContext.Provider
      value={{ activeItem, setActiveItem: handleSetActive }}
    >
      {children}
    </NavigationContext.Provider>
  )
}
