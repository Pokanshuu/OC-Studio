import { db } from '@/lib/db'
import { downloadJson } from './download'
import { resolveImageUrl } from '../image-service'
import {
  collectBodyImageRefs,
  collectCharacterImageRefs,
  collectCountryImageRefs,
  collectEventImageRefs,
  collectWorldEntryImageRefs,
  inlineBodyImageRefs,
} from '../image-refs'

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

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function urlToDataUri(url: string): Promise<string | null> {
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
  // 图片引用的收集规则与相册、文件夹落地共用 `lib/image-refs`：
  // 字段图（头像/头图/图集/旗帜/封面）**和正文 imageBlock** 都要算进来，
  // 只内联字段图的话，换台机器导入后正文里的图全是死链。
  const urls = new Set<string>([
    ...collectCharacterImageRefs(payload.data.characters as never).map((ref) => ref.url),
    ...collectEventImageRefs(payload.data.events as never).map((ref) => ref.url),
    ...collectCountryImageRefs(payload.data.countries as never).map((ref) => ref.url),
    ...collectWorldEntryImageRefs(payload.data.worldEntries as never).map((ref) => ref.url),
  ])
  const cover = (payload.data.meta[0] as { coverUrl?: string } | undefined)?.coverUrl
  if (typeof cover === 'string' && cover !== '') urls.add(cover)

  const map = new Map<string, string>()
  for (const url of urls) {
    if (url.startsWith('data:')) continue
    const dataUri = await urlToDataUri(url)
    if (dataUri) map.set(url, dataUri)
  }

  inlineImageUrls(payload.data.characters, map)
  inlineImageUrls(payload.data.events, map)
  inlineImageUrls(payload.data.countries, map)
  inlineImageUrls(payload.data.meta, map)
  inlineBodies(payload.data.characters, map)
  inlineBodies(payload.data.events, map)
  inlineBodies(payload.data.countries, map)
  inlineBodies(payload.data.worldEntries, map)
  return payload
}

/** 把正文里的 `imageBlock.src` 也换成 data URI（词条的正文是字符串化的文档，原样写回） */
function inlineBodies(records: unknown[], map: Map<string, string>): void {
  if (map.size === 0) return
  for (const item of records) {
    const row = item as { document?: unknown; content?: string }
    if (row.document !== undefined && collectBodyImageRefs(row.document).length > 0) {
      row.document = inlineBodyImageRefs(row.document, map)
    }
    if (typeof row.content === 'string' && collectBodyImageRefs(row.content).length > 0) {
      row.content = inlineBodyImageRefs(row.content, map) as string
    }
  }
}

export async function downloadFullBackup(): Promise<string> {
  const payload = await exportFullBackup()
  const date = new Date().toISOString().slice(0, 10)
  return downloadJson(payload, `oc-full-backup-${date}.ocbak`)
}



