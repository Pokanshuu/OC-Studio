import type { Character, Country, Event, ProjectMeta } from '@/types'
import { normalizeRelPath } from './vault-paths'

// ── 素材（图片）引用的改写原语 ───────────────────────────────────────────
// 图片引用散落在实体的若干字段里（头像 / 头图 / 图集 / 旗帜 / 封面 …）。
// 把「哪些字段算图片引用」与「怎么在素材目录里分配一个不撞名的文件名」收在这里，
// 由 `export-dir.ts`（老数据 → 文件夹）复用。
//
// 这里没有「把应用数据目录里的旧图片搬进来」那个显式动作了：落地迁移已经把
// 字段、正文 `imageBlock`、`data:` URI 三种来源一起处理，单独再留一个只认字段的
// 半套实现只会造成「搬过一半、正文里的图还是死链」。

export interface ImageRows {
  characters: Character[]
  countries: Country[]
  events: Event[]
  meta: ProjectMeta[]
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
