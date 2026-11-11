/**
 * 回收站自动清理。
 *
 * 删除的笔记被移到 `.ocstudio/trash/<YYYYMMDD-HHMMSS>/`（一批一次删除），
 * 这里按「回收站保留天数」把过期批次整个删掉。设置见 设置 › 回收站 / 回收站页头下拉：
 * **7 天 / 30 天 / 从不**（`settings.trashRetentionDays`，0 = 从不）。
 *
 * 保守三条（删的是用户文件，宁可不清也不能清错）：
 * 1. 只认 `YYYYMMDD-HHMMSS` 这种批次名（后端也认这一条，别的目录一个都不碰）；
 * 2. 目录 mtime **和** 批次名里的时间都要早于截止时间 —— 时钟错乱 / 手工改名都挡得住；
 * 3. 任何一步失败只跳过这一批，不中断其它批次，也不向用户抛错（清理是后台动作）。
 */
import { getVaultSession } from '@/lib/vault/vault-session'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'

/** 批次名 → 时间戳（毫秒）；不认识的返回 null */
export function batchStartedAt(name: string): number | null {
  if (!/^\d{8}-\d{6}$/.test(name)) return null
  const year = Number(name.slice(0, 4))
  const month = Number(name.slice(4, 6))
  const day = Number(name.slice(6, 8))
  const hour = Number(name.slice(9, 11))
  const minute = Number(name.slice(11, 13))
  const second = Number(name.slice(13, 15))
  const stamp = new Date(year, month - 1, day, hour, minute, second).getTime()
  return Number.isFinite(stamp) ? stamp : null
}

export interface TrashPurgeResult {
  /** 删掉的批次 */
  batches: number
  /** 删掉的文件数（报告用） */
  files: number
  /** 跳过 / 失败的批次 */
  skipped: number
}

export const EMPTY_PURGE: TrashPurgeResult = { batches: 0, files: 0, skipped: 0 }

/**
 * 回收站页头下拉的选项。`value` 就是 `settings.trashRetentionDays`：
 * `30` / `7` 天自动清理，`0` = 从不（清理只能手动「永久删除」）。
 */
export const TRASH_RETENTION_OPTIONS = [
  { value: 30, label: '保留 30 天' },
  { value: 7, label: '保留 7 天' },
  { value: 0, label: '从不清理' },
]

/**
 * 一批回收站目录该不该清掉。**两个时间都要过期**：
 * 目录 mtime（这一批最后一次删除的时间）与批次名里的时间（删除那天的日期）。
 * 任何一边不老、或者名字认不出，都返回 false —— 宁可留着，也不能清错。
 */
export function shouldPurgeBatch(name: string, mtimeMs: number, cutoff: number): boolean {
  const startedAt = batchStartedAt(name)
  if (startedAt === null) return false
  return startedAt <= cutoff && mtimeMs <= cutoff
}

/**
 * 清理超过 `days` 天的回收站批次。`days <= 0` 表示从不清理。
 *
 * 浏览器 / Capacitor 里没有笔记库、也没有回收站目录，但「软删除的行」照样在 Dexie 里堆着 ——
 * 那些行的回收站界面也会列出来。所以这条路上按 `updatedAt` 清掉过期的软删除行，
 * 否则下拉里写着「保留 7 天」，实际永远不会清。
 */
export async function purgeExpiredTrash(days: number): Promise<TrashPurgeResult> {
  if (!Number.isFinite(days) || days <= 0) return EMPTY_PURGE
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

  if (!isVaultSupported()) {
    const removed = await purgeSoftDeletedRows(cutoff)
    return { batches: 0, files: removed, skipped: 0 }
  }

  const session = getVaultSession()
  if (session === null) return EMPTY_PURGE

  let batches: { name: string; mtimeMs: number; files: number }[]
  try {
    batches = await vaultFs.trashBatches(session.root)
  } catch {
    return EMPTY_PURGE
  }

  const result: TrashPurgeResult = { batches: 0, files: 0, skipped: 0 }
  const purged: string[] = []
  for (const batch of batches) {
    // 名字认不出、或者两个时间有一个不老，就不动这一批
    if (!shouldPurgeBatch(batch.name, batch.mtimeMs, cutoff)) {
      result.skipped += 1
      continue
    }
    try {
      const files = await vaultFs.purgeTrashBatch(session.root, batch.name)
      result.batches += 1
      result.files += files
      purged.push(batch.name)
    } catch {
      result.skipped += 1
    }
  }

  // 文件删了，Dexie 里那几行还在（`deleted: true`）—— 不一起删，回收站列表会留一串
  // 「恢复时源文件不存在」的幽灵。删行走正常管线（它自己会把已知是回收站里的文件删掉）。
  if (purged.length > 0) await dropRowsUnder(session, purged)
  return result
}

/**
 * 浏览器 / Capacitor：把过期（软删除超过 `cutoff`）的行真正删掉。
 *
 * 只碰 `deleted === true` 且 `updatedAt <= cutoff` 的行 —— 删除时会把 `updatedAt` 顶到现在，
 * 所以它等价于「删除时间」。返回删掉的条数。
 */
async function purgeSoftDeletedRows(cutoff: number): Promise<number> {
  const { db } = await import('@/lib/db')
  let removed = 0
  for (const table of [db.characters, db.events, db.countries, db.worldEntries]) {
    try {
      const rows = await table
        .filter(
          (row: { deleted?: boolean; updatedAt?: number }) =>
            row.deleted === true && typeof row.updatedAt === 'number' && row.updatedAt <= cutoff,
        )
        .toArray()
      for (const row of rows) {
        await table.delete(row.id)
        removed += 1
      }
    } catch {
      // 单表失败就跳过：清理是后台动作，不向用户抛错
    }
  }
  return removed
}

/** 删掉 relPath 落在这些回收站批次下的实体行 */
async function dropRowsUnder(
  session: NonNullable<ReturnType<typeof getVaultSession>>,
  batchNames: string[],
): Promise<void> {
  const { db } = await import('@/lib/db')
  const prefixes = batchNames.map((name) => `.ocstudio/trash/${name}/`)
  const doomed: { table: string; id: number }[] = []
  for (const state of session.entries.values()) {
    if (!prefixes.some((prefix) => state.relPath.startsWith(prefix))) continue
    doomed.push({ table: state.table, id: state.id })
  }
  for (const row of doomed) {
    try {
      await db.table(row.table).delete(row.id)
    } catch {
      // 单行删不掉就留着：下次打开笔记库重新扫描时它自然会消失
    }
  }
}
