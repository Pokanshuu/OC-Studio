'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface TrashOverlayValue {
  trashOpen: boolean
  openTrash: () => void
  closeTrash: () => void
}

const TrashOverlayContext = createContext<TrashOverlayValue>({
  trashOpen: false,
  openTrash: () => {},
  closeTrash: () => {},
})

export function useTrashOverlay() {
  return useContext(TrashOverlayContext)
}

export function TrashOverlayProvider({ children }: { children: ReactNode }) {
  const [trashOpen, setTrashOpen] = useState(false)
  const openTrash = useCallback(() => setTrashOpen(true), [])
  const closeTrash = useCallback(() => setTrashOpen(false), [])
  return (
    <TrashOverlayContext.Provider value={{ trashOpen, openTrash, closeTrash }}>
      {children}
    </TrashOverlayContext.Provider>
  )
}
