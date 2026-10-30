import { db } from '@/lib/db'
import { exportFullBackup } from '@/lib/export'
import { vaultFs } from './vault-fs'

// ── 开库前的旧数据保险 ────────────────────────────────────────────────────
// 打开一个文件夹会整库替换 Dexie（`vault-load.ts` 的 applyDataset），
// 旧版本留在内置库里的数据会随之消失，而且**没有任何退路**：
// 「新建文件夹」尤其危险，空文件夹进去，旧的换不回来。
//
// 所以首次绑定笔记库时先导一份 `.ocbak` 落到目标文件夹的 `.ocstudio/` 里。
// 选目标文件夹而不是另弹保存框：用户已经在为这些数据挑一个家了，
// 备份放在同一个家里，不需要他再想一次「存哪儿」。
// `.ocstudio/` 是扫描时跳过的约定目录，不会被当成笔记。

const LEGACY_TABLES = [
  db.characters,
  db.events,
  db.countries,
  db.worldEntries,
  db.tags,
  db.periods,
]

/** 旧版本数据是否还在内置库里（任意一张表非空） */
export async function hasLegacyData(): Promise<boolean> {
  const counts = await Promise.all(LEGACY_TABLES.map((table) => table.count()))
  return counts.some((count) => count > 0)
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * 把内置库整库导成一份 `.ocbak` 写进 `<root>/.ocstudio/`。
 * 返回相对路径；没有旧数据时返回 null。
 * 写盘失败直接抛错 —— 调用方应当中止开库，宁可打不开也不能白清。
 */
export async function backupLegacyData(root: string): Promise<string | null> {
  if (!(await hasLegacyData())) return null

  const payload = await exportFullBackup()
  const relPath = `.ocstudio/legacy-backup-${stamp(new Date())}.ocbak`

  const results = await vaultFs.writeTexts(root, [
    { relPath, content: JSON.stringify(payload) },
  ])
  const failed = results.find((result) => !result.ok)
  if (failed) throw new Error(failed.error ?? '备份写入失败')

  return relPath
}
