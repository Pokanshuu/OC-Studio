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
import { flushVaultWrites } from '@/lib/vault/vault-persist'
import type { MapLayerKind, MapAnchor } from './types'

export type AnchorKind = Extract<MapLayerKind, 'country' | 'event' | 'worldEntry'>

/** 主地图（实体上 `mapId` 为空时视为它）——空字符串代表「未指定」 */
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


/* ── 地图作为实体（笔记） ─────────────────────────────────────────────── */

import { MAP_CATEGORY, isMapEntry } from '@/lib/entry-kinds'

export interface MapEntity {
  id: number
  name: string
  /** 底图相对路径（库内），空 = 还没设底图 */
  image?: string
  width?: number
  height?: number
  /** 生成快照：有它才谈得上「切视图」（手传的底图没有） */
  seed?: number
  params?: string
  /** 当前视图（`terrain` / `contour` / …） */
  mode?: string
  /** 政治标注（国界 / 道路）的原始 JSON；解析见 `annotations.ts` */
  annotations?: string
  updatedAt: number
}

/** 库里所有地图（按更新时间倒序） */
export async function listMaps(): Promise<MapEntity[]> {
  const rows = await db.worldEntries.filter((row) => !row.deleted && isMapEntry(row)).toArray()
  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      image: row.mapImage,
      width: row.mapWidth,
      height: row.mapHeight,
      seed: row.mapSeed,
      params: row.mapParams,
      mode: row.mapMode,
      annotations: row.mapAnnotations,
      updatedAt: row.updatedAt ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 写政治标注（整条 JSON 覆盖）。
 *
 * 标注是**这张图自己的东西**，不欠任何实体：删掉一条不影响任何笔记，
 * 所以不需要镜像写入，也不进 `logOperation` 的实体字段口径之外的地方。
 */
export async function setMapAnnotations(id: number, raw: string | undefined): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, {
    mapAnnotations: raw && raw.length > 0 ? raw : undefined,
    updatedAt: now,
    ...pendingStamp(now),
  })
  await logOperation('worldEntries', id, 'map_annotations', '', raw ?? '')
}

/** 新建一张地图（一条笔记；底图之后单独设）。要拿到去重后的名字用 `createNamedMap`。 */
export async function createMap(name = '新地图'): Promise<number> {
  return (await createNamedMap(name)).id
}

/**
 * 新建地图并**把去重后的名字一起返回**。
 *
 * 地图的底图文件按名字命名（`<地图名>-<视图>.png`），所以「新建 + 写底图」的调用方
 * 必须拿到最终名字 —— 只回 id 的话要么再查一次，要么用请求的名字（重名时会写错文件）。
 */
export async function createNamedMap(name = '新地图'): Promise<{ id: number; name: string }> {
  const now = Date.now()
  const title = await allocateMapName(name)
  const id = await db.worldEntries.add({
    title,
    content: '',
    category: MAP_CATEGORY,
    parentId: null,
    order: await nextWorldOrder(),
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    ...pendingStamp(now),
  })
  await logOperation('worldEntries', id, 'title', '', title)
  return { id, name: title }
}

async function nextWorldOrder(): Promise<number> {
  const rows = await db.worldEntries.filter((row) => !row.deleted && isMapEntry(row)).toArray()
  return rows.reduce((max, row) => Math.max(max, row.order ?? 0), 0) + 1
}

/** 地图名要唯一：锚点用名字（不是会话内 id）指回地图，重名会让归属变成掷硬币 */
async function allocateMapName(base: string): Promise<string> {
  const root = base.trim() || '新地图'
  const rows = await db.worldEntries.filter((row) => !row.deleted && isMapEntry(row)).toArray()
  const existing = new Set(rows.map((row) => row.title))
  if (!existing.has(root)) return root

  let counter = 2
  while (existing.has(`${root} ${counter}`)) counter += 1
  return `${root} ${counter}`
}

/** 建议一个还没被占用的地图名（**不建图**）：工具页的命名对话框拿它当默认值 */
export async function suggestMapName(base = '新地图'): Promise<string> {
  return allocateMapName(base)
}

async function mapNameTaken(name: string, exceptId: number): Promise<boolean> {
  const rows = await db.worldEntries.filter((row) => !row.deleted && isMapEntry(row) && row.id !== exceptId).toArray()
  return rows.some((row) => row.title === name)
}

/** 设底图（路径 + 像素尺寸）；传空路径 = 移除底图 */
export async function setMapBackground(
  id: number,
  image: string | null,
  size?: { width: number; height: number },
  generation?: { seed: number; params: unknown; view?: string },
): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, {
    mapImage: image ?? undefined,
    mapWidth: image ? size?.width : undefined,
    mapHeight: image ? size?.height : undefined,
    mapSeed: image && generation ? generation.seed : undefined,
    mapParams: image && generation ? JSON.stringify(generation.params) : undefined,
    // 手传的底图没有视图可言，字段留空 = 界面不显示模式条
    mapMode: image && generation ? (generation.view ?? 'terrain') : undefined,
    updatedAt: now,
    ...pendingStamp(now),
  })
  await logOperation('worldEntries', id, 'map_image', '', image ?? '')
}

/**
 * 切当前视图（方案 A：**换底图**，不叠图层）。
 *
 * 只改两个键：`map_mode`（记住看哪一档）+ `map_image`（指向这一档的渲染文件）。
 * 生成快照（`map_seed` / `map_params`）一个字节都不动 —— 它才是可重生成的真源，
 * 所以来回切模式永远能得到同一张图，也不用为每档留一份参数。
 */
export async function setMapView(id: number, mode: string, image: string): Promise<void> {
  const now = Date.now()
  await db.worldEntries.update(id, {
    mapMode: mode || undefined,
    mapImage: image || undefined,
    updatedAt: now,
    ...pendingStamp(now),
  })
  await logOperation('worldEntries', id, 'map_mode', '', mode)
}

/**
 * 给地图改名（同记录标题）。
 *
 * 锚点的 `map_id` 存的是**地图名字**（id 只在本次会话有效），所以改名必须
 * 把 `map_id === 旧名` 的实体一起回写；只改标题会让这些锚点静默回落到主地图。
 */
export async function renameMap(id: number, name: string): Promise<void> {
  const next = name.trim()
  if (next.length === 0) throw new Error('地图名不能为空')

  const row = await db.worldEntries.get(id)
  if (!row || row.deleted || !isMapEntry(row)) throw new Error('地图不存在')

  const previous = row.title
  if (previous === next) return
  if (await mapNameTaken(next, id)) throw new Error('已存在同名地图')

  const now = Date.now()
  const stamp = pendingStamp(now)

  await db.transaction('rw', db.worldEntries, db.countries, db.events, async () => {
    await db.worldEntries.update(id, { title: next, updatedAt: now, ...stamp })

    const countries = await db.countries.filter((item) => item.mapId === previous).toArray()
    for (const item of countries) {
      await db.countries.update(item.id, { mapId: next, updatedAt: now, ...stamp })
    }

    const events = await db.events.filter((item) => item.mapId === previous).toArray()
    for (const item of events) {
      await db.events.update(item.id, { mapId: next, updatedAt: now, ...stamp })
    }

    const entries = await db.worldEntries.filter((item) => item.id !== id && item.mapId === previous).toArray()
    for (const item of entries) {
      await db.worldEntries.update(item.id, { mapId: next, updatedAt: now, ...stamp })
    }
  })

  await logOperation('worldEntries', id, 'title', previous, next)
}

/**
 * 删除一张地图（软删）。
 *
 * 地图上的锚点不清坐标，只清 `map_id` —— 它们回到主地图的同一归一化位置，
 * 不会因为删了一张图就把作者摆过的位置丢掉。
 */
/**
 * 删除一张地图（软删除，进回收站）。
 *
 * `fallbackName` 是**兜底**：地图的持久身份是**名字**（锚点 `map_id` 存的就是名字），
 * 而 `id` 只在本次会话有效 —— 中间整库重读过（换库 / 重启 / 落盘回读）一次，列表里
 * 那些 id 就全对不上了。这时再按 id 删会「删了没反应」，用户看到的是「删掉的地图又回来了」。
 * 所以 id 找不到就按名字再找一次。
 */
export async function deleteMap(id: number, fallbackName?: string): Promise<void> {
  let row = await db.worldEntries.get(id)
  if ((!row || row.deleted || !isMapEntry(row)) && fallbackName) {
    row = await db.worldEntries
      .filter((item) => !item.deleted && isMapEntry(item) && item.title === fallbackName)
      .first()
  }
  if (!row || row.deleted || !isMapEntry(row)) throw new Error('地图不存在')

  const targetId = row.id
  const mapName = row.title
  const now = Date.now()
  const stamp = pendingStamp(now)

  await db.transaction('rw', db.worldEntries, db.countries, db.events, async () => {
    await db.worldEntries.update(targetId, { deleted: true, updatedAt: now, ...stamp })

    /*
     * 连 `mapPosition` 一起清，不只是 `mapId`。
     *
     * 锚点按 `mapId || 主地图` 分组：只清 mapId 的话，这些实体会**带着旧坐标掉进主地图**，
     * 而删除时的提示是「和它的锚点一起移到回收站」—— 用户没让它换张图出现。
     */
    const countries = await db.countries.filter((item) => item.mapId === mapName).toArray()
    for (const item of countries) {
      await db.countries.update(item.id, { mapId: undefined, mapPosition: undefined, updatedAt: now, ...stamp })
    }

    const events = await db.events.filter((item) => item.mapId === mapName).toArray()
    for (const item of events) {
      await db.events.update(item.id, { mapId: undefined, mapPosition: undefined, updatedAt: now, ...stamp })
    }

    const entries = await db.worldEntries.filter((item) => item.id !== targetId && item.mapId === mapName).toArray()
    for (const item of entries) {
      await db.worldEntries.update(item.id, { mapId: undefined, mapPosition: undefined, updatedAt: now, ...stamp })
    }
  })

  await logOperation('worldEntries', targetId, 'deleted', 'false', 'true')

  /**
   * 立刻落一次盘。删除在磁盘上体现为「把笔记文件挪进 `.ocstudio/trash/`」；
   * 只排进落盘队列的话，队列还没轮到就整库重读（重启 / 换库 / 开发时热重载），
   * 文件还在原地 —— 这张**刚删掉的地图会原样回来**，再建一张同名的就报「已存在同名地图」。
   */
  await flushVaultWrites().catch(() => undefined)
}
