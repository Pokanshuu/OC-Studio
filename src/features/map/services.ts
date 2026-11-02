import { db } from '@/lib/db'
import type { MapAnnotation } from '@/types'
import type { GeneratedMeta, WorldMapParams, WorldMapRecord } from './types'
import { DEFAULT_MAP_PARAMS } from './types'
import { normalizeMapParams } from './params'

const ACTIVE_MAP_KEY = 'oc-studio-active-map-id'

export function getActiveMapId(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(ACTIVE_MAP_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function setActiveMapId(id: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_MAP_KEY, String(id))
}

export async function getMapRecords(): Promise<WorldMapRecord[]> {
  const all = await db.maps.orderBy('updatedAt').reverse().toArray()
  return all.filter((map) => !map.deleted)
}

export async function getMap(id: number): Promise<WorldMapRecord | undefined> {
  const record = await db.maps.get(id)
  return record && !record.deleted ? record : undefined
}

export async function setMapTemplate(id: number, isTemplate: boolean): Promise<void> {
  await db.maps.update(id, { isTemplate, updatedAt: Date.now() })
}

export async function getActiveMap(): Promise<WorldMapRecord | undefined> {
  const id = getActiveMapId()
  if (id !== null) {
    const record = await db.maps.get(id)
    if (record && !record.deleted) return record
  }
  const maps = await getMapRecords()
  return maps[0]
}

export async function saveGeneratedMap(input: {
  id?: number
  name: string
  seed: number
  params: WorldMapParams
  meta: GeneratedMeta
  annotations?: MapAnnotation[]
  thumbnail?: string
  imageBlob?: Blob
  paintBlob?: Blob | null
  political?: unknown
  acceptedAt?: number
}): Promise<WorldMapRecord> {
  const now = Date.now()
  const stats = {
    landRatio: input.meta.stats.landRatio,
    maxElevation: input.meta.stats.maxElevation,
    riverCells: input.meta.stats.riverCells,
    lakeCount: input.meta.stats.lakeCount,
    biomeCount: input.meta.stats.biomeCount,
  }
  if (input.id !== undefined) {
    const existing = await db.maps.get(input.id)
    if (existing) {
      const updated: WorldMapRecord = {
        ...existing,
        name: input.name || existing.name,
        seed: input.seed >>> 0,
        params: input.params,
        annotations: input.annotations ?? existing.annotations ?? [],
        thumbnail: input.thumbnail ?? existing.thumbnail,
        imageBlob: input.imageBlob ?? existing.imageBlob,
        paintBlob:
          input.paintBlob !== undefined ? input.paintBlob ?? undefined : existing.paintBlob,
        political: input.political ?? existing.political,
        acceptedAt: input.acceptedAt ?? existing.acceptedAt,
        stats,
        updatedAt: now,
        deleted: false,
      }
      await db.maps.put(updated)
      return updated
    }
  }
  const record: WorldMapRecord = {
    name: input.name || '未命名世界',
    seed: input.seed >>> 0,
    params: input.params,
    annotations: input.annotations ?? [],
    thumbnail: input.thumbnail,
    imageBlob: input.imageBlob,
    paintBlob: input.paintBlob ?? undefined,
    political: input.political,
    acceptedAt: input.acceptedAt,
    stats,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
  const id = await db.maps.add(record)
  return { ...record, id }
}

export async function createMapDraft(name = '新世界'): Promise<WorldMapRecord> {
  const now = Date.now()
  const record: WorldMapRecord = {
    name,
    seed: (Math.floor(Math.random() * 0xffffffff) >>> 0),
    params: { ...DEFAULT_MAP_PARAMS },
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
  const id = await db.maps.add(record)
  setActiveMapId(id)
  return { ...record, id }
}

export async function updateRegionPlacement(
  id: number,
  parentWorldId: number,
  placement: NonNullable<WorldMapRecord['placement']>,
): Promise<void> {
  await db.maps.update(id, { parentWorldId, placement, updatedAt: Date.now() })
}

export async function setMapLinkedEntities(
  id: number,
  linkedEntities: NonNullable<WorldMapRecord['linkedEntities']>,
): Promise<void> {
  await db.maps.update(id, { linkedEntities, updatedAt: Date.now() })
}

export async function getRegionChildren(worldId: number): Promise<WorldMapRecord[]> {
  const maps = await getMapRecords()
  return maps.filter((map) => map.parentWorldId === worldId && normalizeMapParams(map.params).kind === 'region')
}

export async function saveMapAnnotations(id: number, annotations: MapAnnotation[]): Promise<void> {
  await db.maps.update(id, { annotations, updatedAt: Date.now() })
}

export async function moveMapToTrash(id: number): Promise<void> {
  await db.maps.update(id, { deleted: true, updatedAt: Date.now() })
  window.dispatchEvent(new Event('oc-maps-changed'))
}

export async function renameMap(id: number, name: string): Promise<void> {
  await db.maps.update(id, { name, updatedAt: Date.now() })
}

export async function deleteMap(id: number): Promise<void> {
  await db.maps.update(id, { deleted: true, updatedAt: Date.now() })
  if (getActiveMapId() === id) {
    const maps = await getMapRecords()
    if (maps[0]?.id !== undefined) setActiveMapId(maps[0].id)
    else window.localStorage.removeItem(ACTIVE_MAP_KEY)
  }
}
