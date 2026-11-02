'use client'

import { importData } from '@/lib/import'

const SEED_FLAG = 'oc-studio-external-seed-v1'
const CUSTOM_SECTIONS_KEY = 'oc-studio-custom-sections'

interface ExternalSeed {
  backup?: unknown
  customSections?: unknown
  novels?: unknown
  settings?: unknown
}

function countCustomSections(): number {
  try {
    const raw = window.localStorage.getItem(CUSTOM_SECTIONS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown[]) : []
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

async function countNovels(): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open('OCStudioNovels')
    request.onerror = () => resolve(0)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('novels')) {
        const store = db.createObjectStore('novels', { keyPath: 'id', autoIncrement: true })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('novels')) {
        db.close()
        resolve(0)
        return
      }
      const tx = db.transaction('novels', 'readonly')
      const count = tx.objectStore('novels').count()
      count.onsuccess = () => {
        db.close()
        resolve(count.result)
      }
      count.onerror = () => {
        db.close()
        resolve(0)
      }
    }
  })
}

async function writeNovels(novels: unknown): Promise<void> {
  if (!Array.isArray(novels) || novels.length === 0) return
  await new Promise<void>((resolve) => {
    const request = indexedDB.open('OCStudioNovels')
    request.onerror = () => resolve()
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('novels')) {
        const store = db.createObjectStore('novels', { keyPath: 'id', autoIncrement: true })
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('novels', 'readwrite')
      const store = tx.objectStore('novels')
      store.clear()
      for (const novel of novels) store.put(novel)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    }
  })
}

/**
 * Installs the curated example world that ships with the app. It only ever
 * runs on a completely empty profile, so upgrading an existing user never
 * overwrites their own data.
 */
export async function applyExternalSeed(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const { db } = await import('@/lib/db')
  const [characters, events, countries, worldEntries, tags] = await Promise.all([
    db.characters.count(),
    db.events.count(),
    db.countries.count(),
    db.worldEntries.count(),
    db.tags.count(),
  ])
  const hasData =
    characters + events + countries + worldEntries + tags > 0 ||
    countCustomSections() > 0 ||
    (await countNovels()) > 0
  if (hasData) {
    window.localStorage.setItem(SEED_FLAG, '1')
    return true
  }
  if (window.localStorage.getItem(SEED_FLAG) === '1') return true

  let seed: ExternalSeed | null = null
  try {
    const response = await fetch('/seed/oc-seed.json', { cache: 'no-store' })
    if (!response.ok) return false
    seed = (await response.json()) as ExternalSeed
  } catch {
    return false
  }

  if (!seed?.backup) return false

  try {
    await importData(seed.backup, 'replace')
    if (Array.isArray(seed.customSections)) {
      window.localStorage.setItem(CUSTOM_SECTIONS_KEY, JSON.stringify(seed.customSections))
    }
    if (seed.settings && typeof seed.settings === 'object') {
      window.localStorage.setItem('oc-studio-settings', JSON.stringify(seed.settings))
    }
    await writeNovels(seed.novels)
    window.localStorage.setItem(SEED_FLAG, '1')
    window.location.reload()
    return true
  } catch (cause) {
    console.error('[seed] 示例数据导入失败', cause)
    return false
  }
}
