'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface WordCountContextValue {
  wordCount: number
  setWordCount: (count: number) => void
}

const WordCountContext = createContext<WordCountContextValue>({
  wordCount: 0,
  setWordCount: () => {},
})

export function WordCountProvider({ children }: { children: ReactNode }) {
  const [wordCount, setWordCount] = useState(0)
  return (
    <WordCountContext.Provider value={{ wordCount, setWordCount }}>
      {children}
    </WordCountContext.Provider>
  )
}

export function useWordCount() {
  return useContext(WordCountContext)
}
