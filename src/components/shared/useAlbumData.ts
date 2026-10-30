'use client'

import { useCallback, useEffect, useState } from 'react'
import { db } from '@/lib/db'
import {
  collectCharacterImageRefs,
  collectCountryImageRefs,
  collectEventImageRefs,
  collectWorldEntryImageRefs,
  type ImageRef,
} from '@/lib/image-refs'

export interface AlbumEntry {
  url: string
  sourceName: string
  sourceType: string
  sourceId: number
  category: string
  updatedAt: number
  tags: number[]
}

type SourceRow = {
  id?: number
  updatedAt: number
  tags?: number[]
  name?: string
  title?: string
}

function pushRefs(
  result: AlbumEntry[],
  row: SourceRow,
  sourceType: string,
  refs: ImageRef[],
): void {
  const id = row.id
  if (id === undefined) return
  const sourceName = row.name ?? row.title ?? ''
  for (const ref of refs) {
    result.push({
      url: ref.url,
      sourceName,
      sourceType,
      sourceId: id,
      category: ref.category,
      updatedAt: row.updatedAt,
      tags: row.tags ?? [],
    })
  }
}

/**
 * 相册的完整数据源 = 字段图 + **正文图** + 词条 + 世界封面。
 *
 * 图片引用的收集规则不在这里手写，全部走 `lib/image-refs`：之前只扫字段图，
 * 于是正文里插的图在相册里根本看不到 —— 而正文才是作者真正大量放图的地方。
 * 同一个收集器也被 `.ocbak` 备份和文件夹落地复用，三处不会各写一套。
 */
async function buildAlbumEntries(): Promise<AlbumEntry[]> {
  const result: AlbumEntry[] = []

  const characters = (await db.characters.toArray()).filter((c) => !c.deleted)
  for (const character of characters) {
    pushRefs(result, character, 'character', collectCharacterImageRefs(character))
  }

  const events = (await db.events.toArray()).filter((e) => !e.deleted)
  for (const event of events) {
    pushRefs(result, event, 'event', collectEventImageRefs(event))
  }

  const countries = (await db.countries.toArray()).filter((c) => !c.deleted)
  for (const country of countries) {
    pushRefs(result, country, 'country', collectCountryImageRefs(country))
  }

  const worldEntries = (await db.worldEntries.toArray()).filter((e) => !e.deleted)
  for (const entry of worldEntries) {
    pushRefs(result, entry, 'worldEntry', collectWorldEntryImageRefs(entry))
  }

  const meta = (await db.meta.toArray())[0]
  if (meta?.coverUrl) {
    result.push({
      url: meta.coverUrl,
      sourceName: '',
      sourceType: 'world',
      sourceId: meta.id ?? 1,
      category: 'cover',
      updatedAt: meta.updatedAt ?? 0,
      tags: [],
    })
  }

  return result
}

export function useAlbumData() {
  const [entries, setEntries] = useState<AlbumEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void buildAlbumEntries().then((rows) => {
      if (cancelled) return
      setEntries(rows)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const refresh = useCallback(async () => {
    const rows = await buildAlbumEntries()
    setEntries(rows)
    return rows
  }, [])

  return { entries, loading, refresh }
}
