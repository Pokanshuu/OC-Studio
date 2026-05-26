'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type MobileSection = 'gallery' | 'wiki' | 'timeline' | 'relations' | 'album'
export type GallerySubTab = 'characters' | 'events' | 'countries'

interface MobileNavigationState {
  section: MobileSection
  setSection: (s: MobileSection) => void
  gallerySubTab: GallerySubTab
  setGallerySubTab: (t: GallerySubTab) => void
}

const MobileNavigationContext = createContext<MobileNavigationState>({
  section: 'gallery',
  setSection: () => {},
  gallerySubTab: 'characters',
  setGallerySubTab: () => {},
})

export function useMobileNavigation() {
  return useContext(MobileNavigationContext)
}

export function MobileNavigationProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<MobileSection>('gallery')
  const [gallerySubTab, setGallerySubTab] = useState<GallerySubTab>('characters')

  const handleSetSection = useCallback((s: MobileSection) => {
    setSection(s)
  }, [])

  const handleSetGallerySubTab = useCallback((t: GallerySubTab) => {
    setGallerySubTab(t)
  }, [])

  return (
    <MobileNavigationContext.Provider
      value={{
        section,
        setSection: handleSetSection,
        gallerySubTab,
        setGallerySubTab: handleSetGallerySubTab,
      }}
    >
      {children}
    </MobileNavigationContext.Provider>
  )
}
