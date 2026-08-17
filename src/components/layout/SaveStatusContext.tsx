'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved'
export type EditorEntityType = 'character' | 'event' | 'country' | 'world'

interface SaveStatusContextValue {
  status: SaveStatus
  markDirty: () => void
  markSaving: () => void
  markSaved: () => void
  resetStatus: () => void
  registerSaveHandler: (type: EditorEntityType, fn: (() => void) | null) => void
  setActiveEntity: (type: EditorEntityType | null) => void
  requestSave: () => void
}

const SaveStatusContext = createContext<SaveStatusContextValue>({
  status: 'idle',
  markDirty: () => {},
  markSaving: () => {},
  markSaved: () => {},
  resetStatus: () => {},
  registerSaveHandler: () => {},
  setActiveEntity: () => {},
  requestSave: () => {},
})

export function useSaveStatus(): SaveStatusContextValue {
  return useContext(SaveStatusContext)
}

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const handlersRef = useRef<Partial<Record<EditorEntityType, () => void>>>({})
  const activeRef = useRef<EditorEntityType | null>(null)

  const markDirty = useCallback(() => setStatus('dirty'), [])
  const markSaving = useCallback(() => setStatus('saving'), [])
  const markSaved = useCallback(() => setStatus('saved'), [])
  const resetStatus = useCallback(() => setStatus('idle'), [])

  const registerSaveHandler = useCallback((type: EditorEntityType, fn: (() => void) | null) => {
    if (fn) {
      handlersRef.current[type] = fn
    } else {
      delete handlersRef.current[type]
    }
  }, [])

  const setActiveEntity = useCallback((type: EditorEntityType | null) => {
    activeRef.current = type
  }, [])

  const requestSave = useCallback(() => {
    const active = activeRef.current
    if (active) handlersRef.current[active]?.()
  }, [])

  return (
    <SaveStatusContext.Provider
      value={{ status, markDirty, markSaving, markSaved, resetStatus, registerSaveHandler, setActiveEntity, requestSave }}
    >
      {children}
    </SaveStatusContext.Provider>
  )
}
