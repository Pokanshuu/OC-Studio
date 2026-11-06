/**
 * fork 版（PR #5）关系数据的**只读适配器**。
 *
 * 那个 fork 把关系放成一张独立的 `relations` 表（Dexie v7，和主库同库），
 * 记录是 `{ sourceType, sourceId, targetType, targetId, kind, label, color?, arrow? }`。
 * 我们的模型是「关系写在实体的 frontmatter 里」（`docs/模板.md` §6.3）：角色 ↔ 角色、
 * 事件 ↔ 事件。所以这里只搬这两类，其它（国家参与、事件-角色）留给后续。
 *
 * 三条规矩与小说适配器一致：**只读、幂等、给报告**。
 */

export interface LegacyRelationRow {
  id: string
  sourceType: string
  sourceId: number
  targetType: string
  targetId: number
  kind?: string
  label?: string
  color?: string
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
  deleted?: boolean
}

export interface LegacyEdge {
  targetId: number
  /** 关系名（label 优先，退化成 kind 的人话标签） */
  relation: string
  color?: string
  arrow?: 'none' | 'forward' | 'reverse' | 'both'
}

export interface LegacyRelationImport {
  /** 角色 → 角色 的边，按 sourceId 分组 */
  characterEdges: Map<number, LegacyEdge[]>
  /** 事件 → 事件 的边 */
  eventEdges: Map<number, LegacyEdge[]>
  /** 没搬的条数（国家参与 / 事件-角色 / 已删除） */
  skipped: number
}

const KIND_LABELS: Record<string, string> = {
  character: '关系',
  membership: '所属',
  'event-character': '参与',
  'event-country': '涉及',
  'event-event': '关联',
  nation: '国家',
  custom: '关系',
}

/**
 * 纯映射：把 fork 的关系行分拣成「角色边」与「事件边」。
 *
 * 双向关系只保留一条（`docs/关系图.md` §2.1：一对角色一条边，箭头表示方向），
 * 所以 `forward` 与 `reverse` 落到同一条边、只翻箭头方向。
 */
export function planRelationImport(rows: LegacyRelationRow[]): LegacyRelationImport {
  const characterEdges = new Map<number, LegacyEdge[]>()
  const eventEdges = new Map<number, LegacyEdge[]>()
  const seen = new Set<string>()
  let skipped = 0

  const push = (map: Map<number, LegacyEdge[]>, sourceId: number, edge: LegacyEdge) => {
    const key = `${sourceId}->${edge.targetId}:${edge.relation}`
    if (seen.has(key)) return
    seen.add(key)
    const list = map.get(sourceId)
    if (list) list.push(edge)
    else map.set(sourceId, [edge])
  }

  for (const row of rows) {
    if (row.deleted) {
      skipped += 1
      continue
    }
    const relation = (row.label ?? '').trim() || KIND_LABELS[row.kind ?? ''] || '关系'
    const edge: LegacyEdge = { targetId: row.targetId, relation }
    if (row.color) edge.color = row.color
    // `none` 也要带过来：角色边不写箭头 = 默认双向，丢掉它就丢掉了「无箭头」
    if (row.arrow) edge.arrow = row.arrow

    if (row.sourceType === 'character' && row.targetType === 'character') {
      push(characterEdges, row.sourceId, edge)
    } else if (row.sourceType === 'event' && row.targetType === 'event') {
      push(eventEdges, row.sourceId, edge)
    } else {
      skipped += 1
    }
  }

  return { characterEdges, eventEdges, skipped }
}

/** 打开 fork 主库、读出 `relations` 表；库/表不存在都返回空数组，绝不抛 */
export async function readLegacyRelations(): Promise<LegacyRelationRow[]> {
  if (typeof indexedDB === 'undefined') return []
  const rows = await new Promise<LegacyRelationRow[]>((resolve) => {
    const request = indexedDB.open('OCStudioDB')
    request.onerror = () => resolve([])
    request.onupgradeneeded = () => resolve([]) // 空库：没有 relations 表
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('relations')) {
        db.close()
        resolve([])
        return
      }
      try {
        const tx = db.transaction('relations', 'readonly')
        const all = tx.objectStore('relations').getAll()
        all.onerror = () => {
          db.close()
          resolve([])
        }
        all.onsuccess = () => {
          const value: unknown = all.result
          db.close()
          resolve(Array.isArray(value) ? (value as LegacyRelationRow[]) : [])
        }
      } catch {
        db.close()
        resolve([])
      }
    }
  })
  return rows
}
