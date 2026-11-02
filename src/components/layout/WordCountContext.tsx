'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface WordCountContextValue {
  wordCount: number
  wordCountLabel: string
  setWordCount: (count: number) => void
  setWordCountLabel: (label: string) => void
}

const WordCountContext = createContext<WordCountContextValue>({
  wordCount: 0,
  wordCountLabel: '字数',
  setWordCount: () => {},
  setWordCountLabel: () => {},
})

export function WordCountProvider({ children }: { children: ReactNode }) {
  const [wordCount, setWordCount] = useState(0)
  const [wordCountLabel, setWordCountLabel] = useState('字数')
  return (
    <WordCountContext.Provider
      value={{ wordCount, wordCountLabel, setWordCount, setWordCountLabel }}
    >
      {children}
    </WordCountContext.Provider>
  )
}

export function useWordCount() {
  return useContext(WordCountContext)
}
