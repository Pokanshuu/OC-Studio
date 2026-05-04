'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface EntityNavigateContextValue {
  navigateToEntity: (id: number, type: string) => void
  setNavigateHandler: (fn: (id: number, type: string) => void) => void
}

const EntityNavigateContext = createContext<EntityNavigateContextValue>({
  navigateToEntity: () => {},
  setNavigateHandler: () => {},
})

export function EntityNavigateProvider({ children }: { children: ReactNode }) {
  const [handler, setHandler] = useState<((id: number, type: string) => void) | null>(null)

  const navigateToEntity = useCallback(
    (id: number, type: string) => {
      handler?.(id, type)
    },
    [handler],
  )

  const setNavigateHandler = useCallback((fn: (id: number, type: string) => void) => {
    setHandler(() => fn)
  }, [])

  return (
    <EntityNavigateContext.Provider value={{ navigateToEntity, setNavigateHandler }}>
      {children}
    </EntityNavigateContext.Provider>
  )
}

export function useEntityNavigate() {
  return useContext(EntityNavigateContext)
}
