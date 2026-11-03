/**
 * 地图锚点的数据服务（W3 第二刀）。
 *
 * 口径（`docs/地图.md` §2）：
 * - 地图不是实体，**没有自己的表**；锚点存在实体上（`map_position`，归一化 0–1）
 * - 一张库可以有多张地图，用 `map_id` 区分；空 = 主地图
 *
 * 这里只做「读锚点 / 写锚点 / 按地图分组」三件事，不碰底图文件
 * （底图在 `.ocstudio/maps/`，属于 vault 落盘那一层）。
 */
import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { MapLayerKind, MapAnchor } from './types'

export type AnchorKind = Extract<MapLayerKind, 'country' | 'event' | 'worldEntry'>

/** 主地图的 id（实体上 `mapId` 为空时视为它） */
export const MAIN_MAP_ID = ''

export interface AnchorPoint {
  kind: AnchorKind
  id: number
  title: string
  anchor: MapAnchor
  mapId: string
}

const TABLES: Record<AnchorKind, 'countries' | 'events' | 'worldEntries'> = {
  country: 'countries',
  event: 'events',
  worldEntry: 'worldEntries',
}

/**
 * 收敛一个锚点：夹到 0–1、丢掉非有限数。
 * 归一化的意义是「换一张更清晰的底图不用重摆」，所以越界值不能修修补补地留下。
 */
export function normalizeAnchor(input: { x: unknown; y: unknown } | null | undefined): MapAnchor | null {
  if (!input) return null
  const x = typeof input.x === 'number' && Number.isFinite(input.x) ? input.x : null
  const y = typeof input.y === 'number' && Number.isFinite(input.y) ? input.y : null
  if (x === null || y === null) return null
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return { x: clamp(x), y: clamp(y) }
}

/** 把一个锚点按地图分组（纯函数，便于自检） */
export function groupAnchors(points: AnchorPoint[]): Map<string, AnchorPoint[]> {
  const groups = new Map<string, AnchorPoint[]>()
  for (const point of points) {
    const key = point.mapId || MAIN_MAP_ID
    const list = groups.get(key)
    if (list) list.push(point)
    else groups.set(key, [point])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.anchor.y - b.anchor.y || a.anchor.x - b.anchor.x)
  }
  return groups
}

/** 库里所有带锚点的实体 → 按地图分组 */
export async function listAnchors(): Promise<Map<string, AnchorPoint[]>> {
  const [countries, events, entries] = await Promise.all([
    db.countries.filter((row) => !row.deleted).toArray(),
    db.events.filter((row) => !row.deleted).toArray(),
    db.worldEntries.filter((row) => !row.deleted).toArray(),
  ])

  const points: AnchorPoint[] = []
  const push = (kind: AnchorKind, rows: Array<{ id: number; title: string; mapPosition?: MapAnchor; mapId?: string }>) => {
    for (const row of rows) {
      const anchor = normalizeAnchor(row.mapPosition)
      if (!anchor) continue
      points.push({ kind, id: row.id, title: row.title, anchor, mapId: row.mapId ?? MAIN_MAP_ID })
    }
  }

  push(
    'country',
    countries.map((row) => ({ id: row.id, title: row.name, mapPosition: row.mapPosition, mapId: row.mapId })),
  )
  push('event', events)
  push('worldEntry', entries)
  return groupAnchors(points)
}

/**
 * 写锚点。`anchor === null` = 从地图上摘掉（清空 `map_position`），不动实体其它字段。
 *
 * 与关系图的 `graph_position` 一样：**只有用户摆过才有这个键**，
 * 未改动时 `serialize` 不会写盘（`putIfChanged`）。
 */
export async function setAnchor(
  kind: AnchorKind,
  id: number,
  anchor: MapAnchor | null,
  mapId?: string,
): Promise<void> {
  const normalized = anchor === null ? null : normalizeAnchor(anchor)
  const table = db.table(TABLES[kind])
  const existing = (await table.get(id)) as
    | { mapPosition?: MapAnchor; mapId?: string }
    | undefined
  if (!existing) throw new Error(`实体不存在：${kind}#${id}`)

  const now = Date.now()
  const updates: Record<string, unknown> = { updatedAt: now, ...pendingStamp(now) }
  if (normalized === null) {
    updates.mapPosition = undefined
    updates.mapId = undefined
  } else {
    updates.mapPosition = normalized
    updates.mapId = mapId && mapId.length > 0 ? mapId : undefined
  }

  await table.update(id, updates)
  await logOperation(
    TABLES[kind],
    id,
    'map_position',
    existing.mapPosition ? `${existing.mapPosition.x},${existing.mapPosition.y}` : '',
    normalized ? `${normalized.x},${normalized.y}` : '',
  )
}


/** 底图目录（相对库根） */
export const MAP_ASSET_DIR = '.ocstudio/maps'

export interface MapAsset {
  name: string
  relPath: string
  /** 可直接给 <img src> 的地址（Tauri 下走 asset 协议） */
  url: string
}

/**
 * 列出库里的底图。
 *
 * 只有桌面版（Tauri）能读库目录：浏览器预览返回空数组，界面按「没有底图」处理，
 * 不会假装有图。底图是**文件**，不是数据库记录（docs/地图.md §2）。
 */
export async function listMapAssets(): Promise<MapAsset[]> {
  const { getVaultSession } = await import('@/lib/vault/vault-session')
  const { vaultFs, isVaultSupported } = await import('@/lib/vault/vault-fs')
  if (!isVaultSupported()) return []
  const session = getVaultSession()
  if (!session) return []

  try {
    const assets = await vaultFs.listAssets(session.root, MAP_ASSET_DIR)
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    const sep = session.root.includes('\\') ? '\\' : '/'
    return assets
      .filter((asset) => /\.(png|jpe?g|webp|avif)$/i.test(asset.name))
      .map((asset) => ({
        name: asset.name,
        relPath: asset.relPath,
        url: convertFileSrc(`${session.root}${sep}${asset.relPath.replace(/\//g, sep)}`),
      }))
  } catch {
    return []
  }
}
