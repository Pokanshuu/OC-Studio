import { appDataDir } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

import { db } from '@/lib/db'
import type { Character, Country, Event, ProjectMeta } from '@/types'
import { getVaultImageContext } from '@/lib/image-service'
import { getVaultSession } from './vault-session'
import { normalizeRelPath } from './vault-paths'
import { vaultFs } from './vault-fs'

// ── 把内置数据库里的图片迁进 vault ──────────────────────────────────────
// 背景：`image-service` 在**没有 vault** 时把图片写到应用数据目录，引用形如
// `images/xxx.png`。一旦切到 vault，这些引用就指向了 vault 外面 —— 文件夹拷走会缺图。
// 新的上传已经直接落进 vault 的素材目录，这个模块负责把**存量**搬过去并改写引用。
//
// 刻意做成**显式动作**（菜单里点）而不是打开 vault 时自动执行：
// 它会往用户的文件夹里写文件，这种事不能悄悄做。

/** 应用数据目录下的图片引用长这样（见 image-service 的 LocalAdapter / saveBlobToDisk） */
const APP_DATA_PREFIX = 'images/'

/**
 * 判断一个引用是否指向应用数据目录。
 * 只认 `images/` 前缀：vault 内的素材引用是 `<素材目录>/…`，
 * 远程/data/blob 与绝对路径另有语义。真正的兜底是随后的**文件存在性检查**。
 */
export function isAppDataImage(path: string | undefined): boolean {
  if (typeof path !== 'string') return false
  return path.startsWith(APP_DATA_PREFIX)
}

interface ImageRows {
  characters: Character[]
  countries: Country[]
  events: Event[]
  meta: ProjectMeta[]
}

/** 收集所有指向应用数据目录的图片引用（去重） */
export function collectAppDataImages(rows: ImageRows): string[] {
  const found = new Set<string>()
  const push = (path: string | undefined): void => {
    if (isAppDataImage(path) && path !== undefined) found.add(path)
  }

  for (const character of rows.characters) {
    push(character.avatarUrl)
    push(character.headerUrl)
    for (const item of character.gallery ?? []) push(item?.url)
    for (const item of character.avatars ?? []) push(item?.url)
  }
  for (const country of rows.countries) {
    push(country.flagUrl)
    push(country.headerUrl)
  }
  for (const event of rows.events) {
    push(event.headerUrl)
    for (const item of event.images ?? []) push(item?.url)
  }
  for (const item of rows.meta) push(item.coverUrl)

  return [...found]
}

export interface RowPatch {
  table: 'characters' | 'countries' | 'events' | 'meta'
  id: number
  patch: Record<string, unknown>
}

/** 按映射改写各行里的图片引用；只产出真正变化的行 */
export function planImageRewrites(rows: ImageRows, map: Map<string, string>): RowPatch[] {
  const out: RowPatch[] = []
  const swap = (path: string | undefined): string | undefined =>
    path !== undefined && map.has(path) ? map.get(path) : path
  const swapList = <T extends { url: string }>(list: T[] | undefined): T[] | undefined => {
    if (!Array.isArray(list)) return undefined
    let changed = false
    const next = list.map((item) => {
      const url = swap(item.url)
      if (url === item.url) return item
      changed = true
      return { ...item, url: url ?? item.url }
    })
    return changed ? next : undefined
  }

  for (const character of rows.characters) {
    const patch: Record<string, unknown> = {}
    const avatar = swap(character.avatarUrl)
    if (avatar !== character.avatarUrl) patch.avatarUrl = avatar
    const header = swap(character.headerUrl)
    if (header !== character.headerUrl) patch.headerUrl = header
    const gallery = swapList(character.gallery)
    if (gallery !== undefined) patch.gallery = gallery
    const avatars = swapList(character.avatars)
    if (avatars !== undefined) patch.avatars = avatars
    if (Object.keys(patch).length > 0) out.push({ table: 'characters', id: character.id, patch })
  }

  for (const country of rows.countries) {
    const patch: Record<string, unknown> = {}
    const flag = swap(country.flagUrl)
    if (flag !== country.flagUrl) patch.flagUrl = flag
    const header = swap(country.headerUrl)
    if (header !== country.headerUrl) patch.headerUrl = header
    if (Object.keys(patch).length > 0) out.push({ table: 'countries', id: country.id, patch })
  }

  for (const event of rows.events) {
    const patch: Record<string, unknown> = {}
    const header = swap(event.headerUrl)
    if (header !== event.headerUrl) patch.headerUrl = header
    const images = swapList(event.images)
    if (images !== undefined) patch.images = images
    if (Object.keys(patch).length > 0) out.push({ table: 'events', id: event.id, patch })
  }

  for (const item of rows.meta) {
    const cover = swap(item.coverUrl)
    if (cover !== item.coverUrl) out.push({ table: 'meta', id: item.id, patch: { coverUrl: cover } })
  }

  return out
}

/** 在素材目录里分配一个不撞名的文件名 */
export function allocateAssetPath(
  assetsDir: string,
  sourceName: string,
  occupied: ReadonlySet<string>,
): string {
  const dir = normalizeRelPath(assetsDir)
  const dot = sourceName.lastIndexOf('.')
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName
  const ext = dot > 0 ? sourceName.slice(dot) : ''
  const build = (suffix: string): string => (dir === '' ? `${base}${suffix}${ext}` : `${dir}/${base}${suffix}${ext}`)

  let candidate = build('')
  let counter = 2
  while (occupied.has(candidate)) {
    candidate = build(`-${counter}`)
    counter += 1
  }
  return candidate
}

export interface ImageMigrationReport {
  /** 发现的待迁移引用数 */
  candidates: number
  migrated: number
  /** 应用数据目录里找不到对应文件的引用 */
  skippedMissing: string[]
  failed: { path: string; error: string }[]
  /** 改写了图片引用的实体数 */
  rewrittenRows: number
}

export async function migrateImagesIntoVault(): Promise<ImageMigrationReport> {
  const report: ImageMigrationReport = {
    candidates: 0,
    migrated: 0,
    skippedMissing: [],
    failed: [],
    rewrittenRows: 0,
  }

  const context = getVaultImageContext()
  const session = getVaultSession()
  if (context === null || session === null) return report

  const [characters, countries, events, meta] = await Promise.all([
    db.characters.toArray(),
    db.countries.toArray(),
    db.events.toArray(),
    db.meta.toArray(),
  ])

  const rows: ImageRows = { characters, countries, events, meta }
  const candidates = collectAppDataImages(rows)
  report.candidates = candidates.length
  if (candidates.length === 0) return report

  const base = (await appDataDir()).replace(/\\/g, '/').replace(/\/+$/, '')
  const map = new Map<string, string>()

  for (const rel of candidates) {
    const source = `${base}/${rel}`
    try {
      if (!(await exists(source))) {
        report.skippedMissing.push(rel)
        continue
      }
      const fileName = rel.slice(rel.lastIndexOf('/') + 1)
      const target = allocateAssetPath(context.assetsDir, fileName, session.occupied)
      await vaultFs.importFile(context.root, source, target)
      session.occupied.add(target)
      map.set(rel, target)
      report.migrated += 1
    } catch (err) {
      report.failed.push({ path: rel, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (map.size > 0) {
    // 改写 Dexie 里的引用 → 落盘队列会把它们写回对应的 .md
    const patches = planImageRewrites(rows, map)
    for (const item of patches) {
      await db.table(item.table).update(item.id, item.patch)
      report.rewrittenRows += 1
    }
  }

  return report
}
