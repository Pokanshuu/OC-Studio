import { db } from '@/lib/db'
import { downloadJson } from './download'
import { resolveImageUrl } from '../image-service'

export interface ExportPayload {
  version: 1
  exportedAt: string
  data: {
    characters: unknown[]
    events: unknown[]
    countries: unknown[]
    worldEntries: unknown[]
    tags: unknown[]
    periods: unknown[]
    meta: unknown[]
  }
}

export async function exportAllData(): Promise<ExportPayload> {
  const [characters, events, countries, worldEntries, tags, periods, meta] = await Promise.all([
    db.characters.filter((c) => !c.deleted).toArray(),
    db.events.filter((e) => !e.deleted).toArray(),
    db.countries.filter((c) => !c.deleted).toArray(),
    db.worldEntries.filter((w) => !w.deleted).toArray(),
    db.tags.toArray(),
    db.periods.filter((p) => !p.deleted).toArray(),
    db.meta.toArray(),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      characters,
      events,
      countries,
      worldEntries,
      tags,
      periods,
      meta,
    },
  }
}

type ImageRecord = {
  avatarUrl?: string
  headerUrl?: string
  flagUrl?: string
  coverUrl?: string
  avatars?: unknown[]
  gallery?: unknown[]
  images?: unknown[]
}

function pushUrl(url: unknown, set: Set<string>): void {
  if (typeof url === 'string' && url && !url.startsWith('data:')) set.add(url)
}

function collectImageUrls(records: unknown[]): Set<string> {
  const urls = new Set<string>()
  for (const item of records) {
    const r = item as ImageRecord
    pushUrl(r.avatarUrl, urls)
    pushUrl(r.headerUrl, urls)
    pushUrl(r.flagUrl, urls)
    pushUrl(r.coverUrl, urls)
    for (const a of r.avatars ?? []) pushUrl(typeof a === 'string' ? a : (a as { url?: string }).url, urls)
    for (const g of r.gallery ?? []) pushUrl(typeof g === 'string' ? g : (g as { url?: string }).url, urls)
    for (const img of r.images ?? []) pushUrl(typeof img === 'string' ? img : (img as { url?: string }).url, urls)
  }
  return urls
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function urlToDataUri(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:')) return null
  try {
    const resolved = resolveImageUrl(url, 'avatar')
    const resp = await fetch(resolved)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await blobToDataUri(blob)
  } catch {
    return null
  }
}

function inlineImageUrls(records: unknown[], map: Map<string, string>): void {
  const replace = (u?: string): string | undefined => (u && map.has(u) ? map.get(u) : u)
  for (const item of records) {
    const r = item as ImageRecord
    if (r.avatarUrl) r.avatarUrl = replace(r.avatarUrl)
    if (r.headerUrl) r.headerUrl = replace(r.headerUrl)
    if (r.flagUrl) r.flagUrl = replace(r.flagUrl)
    if (r.coverUrl) r.coverUrl = replace(r.coverUrl)
    if (Array.isArray(r.avatars)) {
      r.avatars = r.avatars.map((a) => (typeof a === 'string' ? replace(a) : { ...(a as object), url: replace((a as { url?: string }).url) }))
    }
    if (Array.isArray(r.gallery)) {
      r.gallery = r.gallery.map((g) => (typeof g === 'string' ? replace(g) : { ...(g as object), url: replace((g as { url?: string }).url) }))
    }
    if (Array.isArray(r.images)) {
      r.images = r.images.map((img) => (typeof img === 'string' ? replace(img) : { ...(img as object), url: replace((img as { url?: string }).url) }))
    }
  }
}

/** 完整备份：导出数据 + 将图片内联为 data URI（可移植，导入后图片不失效）。 */
export async function exportFullBackup(): Promise<ExportPayload> {
  const payload = await exportAllData()
  const urls = new Set<string>([
    ...collectImageUrls(payload.data.characters),
    ...collectImageUrls(payload.data.events),
    ...collectImageUrls(payload.data.countries),
    ...collectImageUrls(payload.data.meta),
  ])

  const map = new Map<string, string>()
  for (const url of urls) {
    const dataUri = await urlToDataUri(url)
    if (dataUri) map.set(url, dataUri)
  }

  inlineImageUrls(payload.data.characters, map)
  inlineImageUrls(payload.data.events, map)
  inlineImageUrls(payload.data.countries, map)
  inlineImageUrls(payload.data.meta, map)
  return payload
}

export async function downloadFullBackup(): Promise<string> {
  const payload = await exportFullBackup()
  const date = new Date().toISOString().slice(0, 10)
  return downloadJson(payload, `oc-full-backup-${date}.ocbak`)
}



