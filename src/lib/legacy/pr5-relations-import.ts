/**
 * fork 关系 → 我们的显式边（只读迁移，幂等）。
 *
 * 与小说导入同一套规矩（`docs/小说.md` §7.3）：
 * - **只读**旧库，不动一个字节
 * - **幂等**：按「目标 + 关系名」判重，重复运行不会长出第二条边
 * - **给报告**：搬了几条、跳过几条，调用方决定怎么提示
 */
import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import { planRelationImport, readLegacyRelations } from './pr5-relations'

export interface LegacyRelationReport {
  /** 写进角色 relatedCharacters 的边数 */
  characterEdges: number
  /** 写进事件 relations 的边数 */
  eventEdges: number
  /** 没搬的（国家参与 / 事件-角色 / 已删除 / 目标找不到） */
  skipped: number
}

export async function importLegacyRelations(): Promise<LegacyRelationReport> {
  const report: LegacyRelationReport = { characterEdges: 0, eventEdges: 0, skipped: 0 }
  const rows = await readLegacyRelations()
  if (rows.length === 0) return report

  const plan = planRelationImport(rows)
  report.skipped += plan.skipped

  if (plan.characterEdges.size > 0) {
    const characters = await db.characters.filter((row) => !row.deleted).toArray()
    const byId = new Map(characters.map((row) => [row.id, row]))
    for (const [sourceId, edges] of plan.characterEdges) {
      const source = byId.get(sourceId)
      if (!source) {
        report.skipped += edges.length
        continue
      }
      const existing = source.relatedCharacters ?? []
      const additions = edges
        .map((edge) => {
          const target = byId.get(edge.targetId)
          if (!target) return null
          const duplicate = existing.some(
            (item) => item.characterId === target.id && item.relation === edge.relation,
          )
          if (duplicate) return null
          return {
            characterId: target.id,
            name: target.name,
            relation: edge.relation,
            color: edge.color,
            arrow: edge.arrow,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (additions.length === 0) continue
      const now = Date.now()
      await db.characters.update(sourceId, {
        relatedCharacters: [...existing, ...additions],
        updatedAt: now,
        ...pendingStamp(now),
      })
      await logOperation('characters', sourceId, 'relations', '', additions.map((a) => a.name).join(','))
      report.characterEdges += additions.length
      report.skipped += edges.length - additions.length
    }
  }

  if (plan.eventEdges.size > 0) {
    const events = await db.events.filter((row) => !row.deleted).toArray()
    const byId = new Map(events.map((row) => [row.id, row]))
    for (const [sourceId, edges] of plan.eventEdges) {
      const source = byId.get(sourceId)
      if (!source) {
        report.skipped += edges.length
        continue
      }
      const existing = source.relations ?? []
      const additions = edges
        .map((edge) => {
          if (!byId.has(edge.targetId)) return null
          const duplicate = existing.some(
            (item) => item.targetId === edge.targetId && item.relation === edge.relation,
          )
          if (duplicate) return null
          return {
            targetId: edge.targetId,
            relation: edge.relation,
            color: edge.color,
            arrow: edge.arrow,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)

      if (additions.length === 0) continue
      const now = Date.now()
      await db.events.update(sourceId, {
        relations: [...existing, ...additions],
        updatedAt: now,
        ...pendingStamp(now),
      })
      await logOperation('events', sourceId, 'relations', '', additions.map((a) => String(a.targetId)).join(','))
      report.eventEdges += additions.length
      report.skipped += edges.length - additions.length
    }
  }

  return report
}
