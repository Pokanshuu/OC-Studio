'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'

export interface AlbumEntry {
  url: string
  sourceName: string
  sourceType: string
  sourceId: number
  category: string
}

export function useAlbumData() {
  const [entries, setEntries] = useState<AlbumEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const result: AlbumEntry[] = []

    const characters = (await db.characters.toArray()).filter((c) => !c.deleted)
    for (const c of characters) {
      if (c.avatarUrl) {
        result.push({ url: c.avatarUrl, sourceName: c.name, sourceType: 'character', sourceId: c.id!, category: 'avatar' })
      }
      if (c.qAvatarUrl) {
        result.push({ url: c.qAvatarUrl, sourceName: c.name, sourceType: 'character', sourceId: c.id!, category: 'qAvatar' })
      }
      if (Array.isArray(c.avatars)) {
        for (const av of c.avatars) {
          const url = typeof av === 'string' ? av : av.url
          if (url) result.push({ url, sourceName: c.name, sourceType: 'character', sourceId: c.id!, category: 'fullbody' })
        }
      }
      if (c.headerUrl) {
        result.push({ url: c.headerUrl, sourceName: c.name, sourceType: 'character', sourceId: c.id!, category: 'header' })
      }
      if (Array.isArray(c.gallery)) {
        for (const g of c.gallery) {
          const url = typeof g === 'string' ? g : g.url
          if (url) result.push({ url, sourceName: c.name, sourceType: 'character', sourceId: c.id!, category: 'gallery' })
        }
      }
    }

    const events = (await db.events.toArray()).filter((e) => !e.deleted)
    for (const e of events) {
      if (e.headerUrl) {
        result.push({ url: e.headerUrl, sourceName: e.title, sourceType: 'event', sourceId: e.id!, category: 'header' })
      }
      if (Array.isArray(e.images)) {
        for (const img of e.images) {
          const url = typeof img === 'string' ? img : img.url
          if (url) result.push({ url, sourceName: e.title, sourceType: 'event', sourceId: e.id!, category: 'gallery' })
        }
      }
    }

    const countries = (await db.countries.toArray()).filter((c) => !c.deleted)
    for (const c of countries) {
      if (c.flagUrl) {
        result.push({ url: c.flagUrl, sourceName: c.name, sourceType: 'country', sourceId: c.id!, category: 'flag' })
      }
      if (c.headerUrl) {
        result.push({ url: c.headerUrl, sourceName: c.name, sourceType: 'country', sourceId: c.id!, category: 'header' })
      }
    }

    setEntries(result)
    return result
  }, [])

  useEffect(() => {
    setLoading(true)
    void load().then(() => setLoading(false))
  }, [load])

  return { entries, loading, refresh: load }
}
