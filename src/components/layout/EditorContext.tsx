'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type EntityType = 'character' | 'event' | 'country' | 'world' | null

interface EditorState {
  isEditing: boolean
  entityType: EntityType
  entityId: number | null
}

interface EditorContextValue extends EditorState {
  setEditing: (entityType: EntityType, entityId: number | null) => void
  clearEditing: () => void
}

const EditorContext = createContext<EditorContextValue>({
  isEditing: false,
  entityType: null,
  entityId: null,
  setEditing: () => {},
  clearEditing: () => {},
})

export function useEditor() {
  return useContext(EditorContext)
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>({
    isEditing: false,
    entityType: null,
    entityId: null,
  })

  const setEditing = useCallback(
    (entityType: EntityType, entityId: number | null) => {
      setState({ isEditing: true, entityType, entityId })
    },
    [],
  )

  const clearEditing = useCallback(() => {
    setState({ isEditing: false, entityType: null, entityId: null })
  }, [])

  return (
    <EditorContext.Provider value={{ ...state, setEditing, clearEditing }}>
      {children}
    </EditorContext.Provider>
  )
}
