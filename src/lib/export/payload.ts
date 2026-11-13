import { db } from '@/lib/db'
import type { Character, Country, Event, WorldEntry } from '@/types'
import { downloadJson } from './download'
import { resolveImageUrl } from '../image-service'
import { localDateStamp } from '../date-stamp'
import { collectBackupConfig, type BackupConfig } from './backup-config'
import { readJournalLines } from '@/lib/vault/journal'
import { getVaultSession } from '@/lib/vault/vault-session'
import { vaultFs } from '@/lib/vault/vault-fs'
import { isTauri } from '@/lib/env'
import {
  collectBodyImageRefs,
  collectDatasetImageRefs,
  inlineBodyImageRefs,
} from '../image-refs'

export interface ExportPayload {
  version: 1
  exportedAt: string
  /**
   * 设置（自定义分类 / 字段表 / 模板 / 信息组 / 正文组 / 文件夹清单）。
   * 可选：旧版本导出的备份没有这段，读到时按「没有设置可恢复」处理。
   * 导入端只在目标**还没配过**时整段恢复，见 `lib/export/backup-config.ts`。
   */
  config?: BackupConfig
  /**
   * 创作时间线（`.ocstudio/journal.jsonl` 的原始行）。
   *
   * 只追加的操作记录以前不进备份 —— 换设备后「这角色我 8 月就写了」的证据就断了。
   * 现在原样带走；导入时按 `ts + relPath + hash` 去重后追加，见 `mergeJournalLines`。
   */
  journal?: string[]
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
  /** 角色 OC 动画（视频也是随库走的素材，备份要一起带走） */
  animationUrl?: string
  /** 词条：小说封面 / 地图底图 */
  novelCover?: string
  mapImage?: string
  /** 词条 / 国家的模板组件槽位：头像 / 单张图片 */
  avatar?: string
  image?: string
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

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

/**
 * 文件夹库里的图直接读字节转 data URI。
 *
 * 以前只走 `resolveImageUrl()` → `asset://localhost` → `fetch()`。asset fetch 本身
 * 可用（2026-11-14 在 WebView2 实测 200），但它依赖文件真的存在；文件缺失 / 路径
 * 是旧 Mock 地址时整张图被静默跳过。这里多一条 `vault_read_bytes` 的直读兜底，
 * 读不到再交给上面的分支。
 */
async function vaultImageDataUri(url: string): Promise<string | null> {
  if (!isTauri()) return null
  if (/^(data:|blob:|https?:)/i.test(url)) return null
  const root = getVaultSession()?.root
  if (root === null || root === undefined) return null
  const rel = url.replace(/\\/g, '/').replace(/^\/+/, '')
  if (rel === '' || rel.includes('..')) return null
  try {
    const bytes = await vaultFs.readBytes(root, rel)
    if (bytes.length === 0) return null
    const mime = IMAGE_MIME[rel.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
    return await blobToDataUri(new Blob([new Uint8Array(bytes)], { type: mime }))
  } catch {
    return null
  }
}

export async function urlToDataUri(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:')) return null
  const fromVault = await vaultImageDataUri(url)
  if (fromVault !== null) return fromVault
  try {
    const resolved = resolveImageUrl(url, 'avatar')
    // 相对路径在没有库的环境里（浏览器预览）会解析成内置占位图。
    // 占位图不能顶替真图写进备份：那等于用一张灰头像覆盖掉原引用。
    if (resolved.includes('/images/defaults/')) return null
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
    if (r.animationUrl) r.animationUrl = replace(r.animationUrl)
    if (r.novelCover) r.novelCover = replace(r.novelCover)
    if (r.mapImage) r.mapImage = replace(r.mapImage)
    // 模板组件的图片槽位（词条头像 / 单图；注意与角色的 `avatarUrl` 不是一个键）
    if (r.avatar) r.avatar = replace(r.avatar)
    if (r.image) r.image = replace(r.image)
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

export interface BackupExportDetail {
  payload: ExportPayload
  /**
   * 读不出字节、只能在备份里留下引用的图（缺文件 / 权限 / 旧 Mock 路径）。
   * 以前这些是静默的 —— 用户以为「备份成功」，换台机器导入后才发现全是灰图。
   */
  missingImages: string[]
}

/** 完整备份：导出数据 + 将图片内联为 data URI（可移植，导入后图片不失效）。 */
export async function exportFullBackupDetailed(): Promise<BackupExportDetail> {
  const payload = await exportAllData()
  // 图片引用的收集规则与相册、文件夹落地共用 `lib/image-refs`：
  // 字段图（头像/头图/图集/旗帜/封面）、**正文 imageBlock**、角色动画（视频）
  // 与词条的 `novelCover` / `mapImage` 都要算进来，只内联字段图的话，
  // 换台机器导入后正文里的图、动画、小说封面、地图底图全是死链。
  // `blob:` 这类只在当前会话有效的地址由收集器跳过，并记进 skipped。
  const skipped: string[] = []
  const refs = collectDatasetImageRefs(
    {
      characters: payload.data.characters as Character[],
      events: payload.data.events as Event[],
      countries: payload.data.countries as Country[],
      worldEntries: payload.data.worldEntries as WorldEntry[],
      metaCoverUrl: (payload.data.meta[0] as { coverUrl?: string } | undefined)?.coverUrl,
    },
    { skipped },
  )
  const urls = new Set(refs.map((ref) => ref.url))

  const map = new Map<string, string>()
  const missingImages: string[] = []
  for (const url of urls) {
    if (url.startsWith('data:')) continue
    const dataUri = await urlToDataUri(url)
    if (dataUri) map.set(url, dataUri)
    else missingImages.push(url)
  }

  if (skipped.length > 0) {
    // 会话内地址写进备份只会是一串死地址；这里明确说一声，别让它变成静默丢失
    console.warn(`[backup] 跳过 ${skipped.length} 个会话内素材引用（blob:）`)
  }

  inlineImageUrls(payload.data.characters, map)
  inlineImageUrls(payload.data.events, map)
  inlineImageUrls(payload.data.countries, map)
  inlineImageUrls(payload.data.worldEntries, map)
  inlineImageUrls(payload.data.meta, map)
  inlineBodies(payload.data.characters, map)
  inlineBodies(payload.data.events, map)
  inlineBodies(payload.data.countries, map)
  inlineBodies(payload.data.worldEntries, map)
  // 设置跟数据一起走：以前只导数据，换机器后自建分类 / 字段表 / 模板全没了
  payload.config = collectBackupConfig()
  // 创作时间线也一起走：换设备后「这角色我 8 月就写了」的证据不能断。
  // 浏览器版没有库目录，`readJournalLines()` 会返回空数组，这里不必分支。
  const journal = await readJournalLines()
  if (journal.length > 0) payload.journal = journal
  return { payload, missingImages }
}

export async function exportFullBackup(): Promise<ExportPayload> {
  return (await exportFullBackupDetailed()).payload
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

export interface BackupDownloadResult {
  fileName: string
  missingImages: string[]
}

export async function downloadFullBackup(): Promise<BackupDownloadResult> {
  const { payload, missingImages } = await exportFullBackupDetailed()
  const fileName = await downloadJson(payload, `oc-full-backup-${localDateStamp()}.ocbak`)
  return { fileName, missingImages }
}



