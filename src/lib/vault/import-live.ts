import { db } from '@/lib/db'
import { importData, type ImportedRowIdentity, type ImportResult, type MergeStrategy } from '@/lib/import'
import type { QueryClient } from '@tanstack/react-query'
import { applyImportedAssetMap, prepareImportedAssets, type LegacyRows } from './export-dir'
import { getVaultSession } from './vault-session'

/** An open vault has one Markdown writer: the normal persistence queue. */
export async function importIntoOpenVault(
  root: string,
  json: unknown,
  strategy: MergeStrategy,
  queryClient?: QueryClient,
): Promise<{ result: ImportResult; images: number; missingImages: string[]; skippedImages: string[] }> {
  if (strategy === 'replace') throw new Error('笔记库开着时不能清空并导入')
  const session = getVaultSession()
  if (session === null || session.root !== root) throw new Error('笔记库已切换，请重新导入')
  const assertSession = () => {
    if (getVaultSession() !== session) throw new Error('导入期间笔记库已切换，已停止写入')
  }
  let assets = { images: 0, missingImages: [] as string[], skippedImages: [] as string[] }
  const result = await importData(json, strategy, queryClient, {
    afterCommit: async (identities) => {
      assertSession()
      const rows = await readImportedRows(identities)
      const prepared = await prepareImportedAssets(root, rows)
      assets = { images: prepared.images, missingImages: prepared.missingImages, skippedImages: prepared.skippedImages }
      if (prepared.imageMap.size === 0) return
      assertSession()
      // Asset IO can yield to an editor save: patch only image fields on fresh rows.
      await db.transaction('rw', [db.characters, db.countries, db.events, db.worldEntries, db.meta], async () => {
        assertSession()
        const fresh = await readImportedRows(identities)
        const before = structuredClone(fresh)
        applyImportedAssetMap(fresh, prepared.imageMap)
        for (const table of ['characters', 'countries', 'events', 'worldEntries', 'meta'] as const) {
          const currentRows = table === 'meta' ? (fresh.meta ? [fresh.meta] : []) : fresh[table]
          const previousRows = table === 'meta' ? (before.meta ? [before.meta] : []) : before[table]
          for (const row of currentRows) {
            const previous = previousRows.find((item) => item.id === row.id)
            const patch = Object.fromEntries(Object.entries(row).filter(([key, value]) =>
              JSON.stringify(value) !== JSON.stringify((previous as unknown as Record<string, unknown> | undefined)?.[key]),
            ))
            if (Object.keys(patch).length > 0) await db.table(table).update(row.id, patch)
          }
        }
      })
    },
  })
  return { result, ...assets }
}

async function readImportedRows(identities: ImportedRowIdentity[]): Promise<LegacyRows> {
  const rows: LegacyRows = { characters: [], countries: [], events: [], worldEntries: [], tags: [], periods: [], meta: null }
  await Promise.all(identities.map(async ({ table, id }) => {
    // These tables have no media and are intentionally outside the patch transaction.
    if (table === 'tags' || table === 'periods') return
    const row = await db.table(table).get(id)
    if (!row) return
    if (table === 'meta') rows.meta = row as LegacyRows['meta']
    else (rows[table] as { id: number }[]).push(row as { id: number })
  }))
  return rows
}
