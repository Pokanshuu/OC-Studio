/**
 * 旧版本（PR #5 fork）迁移入口的可用性探测。
 *
 * 那个分支把小说放在独立 IndexedDB（`OCStudioNovels`），关系放在主库的
 * `relations` 表里。新用户、换过设备的人都没有这两个来源 —— 设置里的入口
 * 如果无条件显示，点下去只会得到「没有可导入的旧版本数据」，就是一枚摆设。
 *
 * 这里只做**只读探测**：不迁移数据，也不写任何东西。探测不到时入口不显示；
 * 浏览器不支持 `indexedDB.databases()` 时保守显示，交给点击后的原有提示兜底。
 */
import { LEGACY_NOVEL_DB } from './pr5-novels'
import { LEGACY_MAIN_DB, LEGACY_RELATIONS_TABLE } from './pr5-relations'

async function databaseNames(): Promise<Set<string> | null> {
  if (typeof indexedDB === 'undefined') return new Set()
  if (typeof indexedDB.databases !== 'function') return null
  try {
    const rows = await indexedDB.databases()
    return new Set(rows.map((row) => row.name).filter((name): name is string => typeof name === 'string'))
  } catch {
    return null
  }
}

function hasRelationsStore(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.open(LEGACY_MAIN_DB)
    request.onerror = () => resolve(false)
    request.onblocked = () => resolve(false)
    request.onupgradeneeded = () => {
      // 理论上不会走到：上面已经确认库存在。真走到了就当没有，别让它建表。
      request.result.close()
      resolve(false)
    }
    request.onsuccess = () => {
      const db = request.result
      const found = db.objectStoreNames.contains(LEGACY_RELATIONS_TABLE)
      db.close()
      resolve(found)
    }
  })
}

/** 同一设备上是否存在可导入的旧版本数据 */
export async function hasLegacyImportSource(): Promise<boolean> {
  const names = await databaseNames()
  if (names === null) return true
  if (names.has(LEGACY_NOVEL_DB)) return true
  if (!names.has(LEGACY_MAIN_DB)) return false
  return hasRelationsStore()
}
