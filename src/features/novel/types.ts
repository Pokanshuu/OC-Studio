'use client'

export type ChapterStatus = 'draft' | 'revising' | 'done'

export interface NovelNote {
  id: string
  text: string
}

export interface NovelChapter {
  id: string
  title: string
  content: string
  summary?: string
  status?: ChapterStatus
}

export interface Novel {
  id?: number
  title: string
  author: string
  synopsis: string
  coverUrl?: string
  notes?: string
  noteItems?: NovelNote[]
  targetWords?: number
  chapters: NovelChapter[]
  createdAt: number
  updatedAt: number
}

export type NovelPageFormat = '9:16' | '16:9' | 'A4'

export interface NovelExportOptions {
  format: NovelPageFormat
  scale: number
  backgroundUrl?: string
}

export function makeChapter(title = '新章节'): NovelChapter {
  return {
    id: `chapter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    content: '<p></p>',
    summary: '',
    status: 'draft',
  }
}
