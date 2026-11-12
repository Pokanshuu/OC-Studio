/**
 * 导入后的**引用重映射**（纯函数，不碰 Dexie）。
 *
 * 备份里的 id 是**备份内的编号**；落到目标库时会重新分配（或被「同名跳过」映射到已有那条）。
 * 以前只重映射了 `parentId`，其余引用（国籍 / 事件相关国家 / 参与者 / 命名关系 / 标签）
 * 仍然带着备份里的数字，于是会**指到目标库里同样数字的另一条**，或者悬空。
 *
 * 这里按「备份 id → 落库 id」的映射把一行的所有引用改写掉；
 * 映射里没有的（目标没导进来）一律清空 / 从数组里摘掉 —— 宁可断开，也不要指错人。
 */

export interface IdMaps {
  characters: ReadonlyMap<number, number>
  countries: ReadonlyMap<number, number>
  events: ReadonlyMap<number, number>
  worldEntries: ReadonlyMap<number, number>
  tags: ReadonlyMap<number, number>
}

/** 行里只保留真正变化过的键；没有变化返回 null */
export type RemapKind = 'character' | 'event' | 'country' | 'worldEntry'

function mapId(map: ReadonlyMap<number, number>, value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return map.get(value) ?? null
}

function mapIds(map: ReadonlyMap<number, number>, value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const id of value) {
    const next = mapId(map, id)
    if (next !== null && !out.includes(next)) out.push(next)
  }
  return out
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** 给一行算出「引用被重映射之后」的补丁（只含变化的键） */
export interface RemapResult {
  /** 有变化的键；没变化是 null */
  patch: Record<string, unknown> | null
  /** 因为目标不存在而被摘掉的引用条数（用于导入报告，别静默丢） */
  dropped: number
}

export function remapRowRefs(
  kind: RemapKind,
  row: Record<string, unknown>,
  maps: IdMaps,
): RemapResult {
  const patch: Record<string, unknown> = {}
  let dropped = 0

  const setIfChanged = (key: string, next: unknown): void => {
    if (same(row[key], next)) return
    patch[key] = next
  }

  if (Array.isArray(row.tags)) {
    const nextTags = mapIds(maps.tags, row.tags)
    dropped += (row.tags as unknown[]).length - nextTags.length
    setIfChanged('tags', nextTags)
  }

  if (kind === 'character') {
    if (row.countryId !== undefined) {
      const nextCountry = mapId(maps.countries, row.countryId)
      // 原来有国籍、但目标不存在 → 也算「清掉一条引用」，报告里要计入
      if (nextCountry === null && row.countryId !== null) dropped += 1
      setIfChanged('countryId', nextCountry)
    }
    if (Array.isArray(row.relatedCharacters)) {
      setIfChanged(
        'relatedCharacters',
        (row.relatedCharacters as Array<Record<string, unknown>>)
          .map((item) => {
            const next = mapId(maps.characters, item.characterId)
            if (next === null) {
              dropped += 1
              return null
            }
            return { ...item, characterId: next }
          })
          .filter((item) => item !== null) as Array<Record<string, unknown>>,
      )
    }
    if (Array.isArray(row.relatedNotes)) {
      setIfChanged(
        'relatedNotes',
        (row.relatedNotes as Array<Record<string, unknown>>)
          .map((item) => {
            const next = mapId(maps.worldEntries, item.targetId)
            if (next === null) {
              dropped += 1
              return null
            }
            return { ...item, targetId: next }
          })
          .filter((item) => item !== null) as Array<Record<string, unknown>>,
      )
    }
  }

  if (kind === 'event') {
    if (Array.isArray(row.countries)) {
      const next = mapIds(maps.countries, row.countries)
      dropped += (row.countries as unknown[]).length - next.length
      setIfChanged('countries', next)
    }
    if (Array.isArray(row.characters)) {
      const next = mapIds(maps.characters, row.characters)
      dropped += (row.characters as unknown[]).length - next.length
      setIfChanged('characters', next)
    }
    if (Array.isArray(row.relations)) {
      setIfChanged(
        'relations',
        (row.relations as Array<Record<string, unknown>>)
          .map((item) => {
            const next = mapId(maps.events, item.targetId)
            if (next === null) {
              dropped += 1
              return null
            }
            return { ...item, targetId: next }
          })
          .filter((item) => item !== null) as Array<Record<string, unknown>>,
      )
    }
  }

  if (kind === 'worldEntry') {
    if (Array.isArray(row.relations)) {
      setIfChanged(
        'relations',
        (row.relations as Array<Record<string, unknown>>)
          .map((item) => {
            const next = mapId(maps.worldEntries, item.targetId)
            if (next === null) {
              dropped += 1
              return null
            }
            return { ...item, targetId: next }
          })
          .filter((item) => item !== null) as Array<Record<string, unknown>>,
      )
    }
  }

  return { patch: Object.keys(patch).length > 0 ? patch : null, dropped }
}
