'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AlbumTriggerValue {
  albumOpen: boolean
  openAlbum: () => void
  closeAlbum: () => void
}

const AlbumTriggerContext = createContext<AlbumTriggerValue>({
  albumOpen: false,
  openAlbum: () => {},
  closeAlbum: () => {},
})

export function useAlbumTrigger() {
  return useContext(AlbumTriggerContext)
}

export function AlbumTriggerProvider({ children }: { children: ReactNode }) {
  const [albumOpen, setAlbumOpen] = useState(false)

  const openAlbum = useCallback(() => setAlbumOpen(true), [])
  const closeAlbum = useCallback(() => setAlbumOpen(false), [])

  return (
    <AlbumTriggerContext.Provider value={{ albumOpen, openAlbum, closeAlbum }}>
      {children}
    </AlbumTriggerContext.Provider>
  )
}
