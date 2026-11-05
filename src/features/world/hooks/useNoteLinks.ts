'use client'

/**
 * 词条之间的**层级 / 引用**关系 —— 查询，不是存储（`docs/模板.md §1.4`）。
 *
 * 「关系」组件在笔记宿主上显示的就这两类事实：
 * - 父词条 / 子条目：`parentId` 的两头（层级只有这一份真源）
 * - 被引用：别的笔记在正文里 `[[链接]]` / `@` 引用了这一条
 *
 * 关系名固定、只读、不给移除 —— 它们不是用户手写的边，而是树与正文的投影。
 * 世界编辑器与分类条目编辑器共用同一次查询，别各扫一遍库。
 */
import { useEffect, useMemo, useState } from 'react'
import type { WorldEntry } from '@/types'
import { db } from '@/lib/db'
import { worldBodyOf } from '@/lib/world-body'
import { docHasRef } from '@/features/world/components/world-content-utils'

export interface NoteLink {
  id: number
  title: string
}

export interface NoteLinks {
  parent: NoteLink | null
  children: NoteLink[]
  /** 引用了当前条目的笔记 */
  backlinks: NoteLink[]
  loading: boolean
}

const EMPTY: NoteLinks = { parent: null, children: [], backlinks: [], loading: false }

/** 纯函数：在已加载的词条里找出引用了 `entryId` 的那些（正文走 `worldBodyOf`） */
export function findBacklinks(rows: WorldEntry[], entryId: number): NoteLink[] {
  const key = String(entryId)
  const found: NoteLink[] = []
  for (const row of rows) {
    if (row.deleted || row.id === entryId) continue
    if (docHasRef(worldBodyOf(row), key)) found.push({ id: row.id, title: row.title })
  }
  return found
}

function linksFrom(rows: WorldEntry[], entryId: number): Omit<NoteLinks, 'loading'> {
  const self = rows.find((row) => row.id === entryId)
  const parent =
    self?.parentId === undefined || self?.parentId === null
      ? null
      : (() => {
          const target = rows.find((row) => row.id === self.parentId)
          return target ? { id: target.id, title: target.title } : null
        })()
  return {
    parent,
    children: rows.filter((row) => row.parentId === entryId).map((row) => ({ id: row.id, title: row.title })),
    backlinks: findBacklinks(rows, entryId),
  }
}

/**
 * @param rows 已经加载好的词条（世界编辑器有列表，直接传进来；
 *             分类条目编辑器没有列表，省略即自己读一次库）
 */
export function useNoteLinks(entryId: number | null, rows?: WorldEntry[]): NoteLinks {
  const [links, setLinks] = useState<NoteLinks>(EMPTY)

  const fromRows = useMemo(
    () => (rows === undefined || entryId === null ? null : { ...linksFrom(rows, entryId), loading: false }),
    [rows, entryId],
  )

  useEffect(() => {
    // 调用方给了列表就跟着它走：不再自己扫库，也就不会在保存后拿到一份过期结果
    if (rows !== undefined || entryId === null) return
    let cancelled = false
    void db.worldEntries
      .filter((row) => !row.deleted)
      .toArray()
      .then((all) => {
        if (cancelled) return
        setLinks({ ...linksFrom(all, entryId), loading: false })
      })
      .catch(() => {
        if (!cancelled) setLinks({ ...EMPTY, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [entryId, rows])

  if (entryId === null) return EMPTY
  return fromRows ?? links
}
