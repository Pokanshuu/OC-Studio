'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'

interface ActiveEditorContextValue {
  activeEditor: Editor | null
  setActiveEditor: (editor: Editor | null) => void
}

const ActiveEditorContext = createContext<ActiveEditorContextValue | null>(null)

export function ActiveEditorProvider({ children }: { children: ReactNode }) {
  const [activeEditor, setActiveEditorState] = useState<Editor | null>(null)

  const setActiveEditor = useCallback((editor: Editor | null) => {
    setActiveEditorState(editor)
  }, [])

  return (
    <ActiveEditorContext.Provider value={{ activeEditor, setActiveEditor }}>
      {children}
    </ActiveEditorContext.Provider>
  )
}

export function useActiveEditor() {
  const ctx = useContext(ActiveEditorContext)
  if (!ctx) {
    throw new Error('useActiveEditor must be used within ActiveEditorProvider')
  }
  return ctx
}
