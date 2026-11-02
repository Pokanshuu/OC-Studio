'use client'

import { useCallback, useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import Dexie, { type Table } from 'dexie'
import type { Novel, NovelChapter } from './types'
import { makeChapter } from './types'

const novelDb = new Dexie('OCStudioNovels') as Dexie & {
  novels: Table<Novel, number>
}

novelDb.version(1).stores({
  novels: '++id,updatedAt',
})

export function useNovels(): {
  novels: Novel[]
  loading: boolean
  createNovel: (title?: string) => Promise<Novel>
  updateNovel: (id: number, patch: Partial<Novel>) => Promise<void>
  deleteNovel: (id: number) => Promise<void>
} {
  const [novels, setNovels] = useState<Novel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const subscription = liveQuery(() =>
      novelDb.novels.orderBy('updatedAt').reverse().toArray(),
    ).subscribe({
      next: (rows) => {
        setNovels(rows)
        setLoading(false)
      },
      error: () => setLoading(false),
    })
    return () => subscription.unsubscribe()
  }, [])

  const createNovel = useCallback(async (title = '未命名小说'): Promise<Novel> => {
    const now = Date.now()
    const novel: Novel = {
      title,
      author: '',
      synopsis: '',
      chapters: [makeChapter('新章节')],
      createdAt: now,
      updatedAt: now,
    }
    const id = await novelDb.novels.add(novel)
    return { ...novel, id }
  }, [])

  const updateNovel = useCallback(async (id: number, patch: Partial<Novel>): Promise<void> => {
    await novelDb.novels.update(id, { ...patch, updatedAt: Date.now() })
  }, [])

  const deleteNovel = useCallback(async (id: number): Promise<void> => {
    await novelDb.novels.delete(id)
  }, [])

  return { novels, loading, createNovel, updateNovel, deleteNovel }
}

export function saveChapterContent(
  novel: Novel,
  chapterId: string,
  content: string,
): NovelChapter[] {
  return novel.chapters.map((chapter) =>
    chapter.id === chapterId ? { ...chapter, content } : chapter,
  )
}
