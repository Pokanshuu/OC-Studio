'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { syncReferenceLabels } from '@/lib/reference-sync'

type EntityType = 'character' | 'event' | 'country' | 'worldEntry'

export function useDocument(entityId: number, entityType: EntityType) {
  const [document, setDocument] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        let record: { document?: unknown } | undefined
        switch (entityType) {
          case 'character':
            record = await db.characters.get(entityId)
            break
          case 'event':
            record = await db.events.get(entityId)
            break
          case 'country':
            record = await db.countries.get(entityId)
            break
          case 'worldEntry':
            record = await db.worldEntries.get(entityId)
            break
        }
        if (cancelled) return
        if (!record) {
          setError('记录不存在')
          return
        }
        const doc = record.document as Record<string, unknown> | undefined
        if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
          const synced = await syncReferenceLabels(doc)
          if (!cancelled) setDocument(synced)
        } else {
          if (!cancelled) setDocument(doc ?? null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [entityId, entityType])

  return { document, loading, error }
}
