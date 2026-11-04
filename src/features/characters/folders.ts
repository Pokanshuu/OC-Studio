/**
 * 角色文件夹（W6）：**只存名字，不存 id**。
 *
 * 规矩（`docs/待设计决策清单.md` §2）：
 * - 文件夹是角色上的一个 `folder` 键（frontmatter `folder` / `文件夹` / `分类`）
 * - **删文件夹不删角色**：删的是这个名字，角色回到「未分组」
 * - 重命名 = 批量改这个键；不做「文件夹表」，也就不可能出现空文件夹
 */
import { db } from '@/lib/db'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { Character } from '@/types'

/** 未分组在 UI 上的标题（不写进数据） */
export const UNGROUPED = '未分组'

export interface CharacterFolder {
  name: string
  count: number
}

/** 现有文件夹（按名字排序）+ 未分组计数 */
export function listFolders(characters: Character[]): { folders: CharacterFolder[]; ungrouped: number } {
  const counts = new Map<string, number>()
  let ungrouped = 0
  for (const character of characters) {
    const folder = (character.folder ?? '').trim()
    if (folder === '') ungrouped += 1
    else counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  const folders = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
  return { folders, ungrouped }
}

/** 把角色放进文件夹（`null` = 移出到未分组）；不存在的文件夹名也会被接受（等于新建） */
export async function moveCharacterToFolder(id: number, folder: string | null): Promise<void> {
  const name = (folder ?? '').trim()
  const now = Date.now()
  await db.characters.update(id, {
    folder: name === '' ? undefined : name,
    // 分组不是内容编辑：不碰 updatedAt，否则整夹角色会窜到「最近更新」最前面
    ...pendingStamp(now),
  })
  await logOperation('characters', id, 'folder', '', name)
}

/** 重命名文件夹：批量改 `folder` 键，角色一条都不动 */
export async function renameFolder(from: string, to: string): Promise<number> {
  const target = to.trim()
  const source = from.trim()
  if (target === '' || target === source) return 0
  const rows = await db.characters
    .filter((row) => !row.deleted && (row.folder ?? '').trim() === source)
    .toArray()
  const now = Date.now()
  for (const row of rows) {
    await db.characters.update(row.id, { folder: target, ...pendingStamp(now) })
    await logOperation('characters', row.id, 'folder', source, target)
  }
  return rows.length
}

/**
 * 删文件夹：**只清键，不删角色**（PR 版也是这个语义，但那边文件夹是 localStorage 元数据）。
 * 返回受影响的角色数。
 */
export async function deleteFolder(name: string): Promise<number> {
  const target = name.trim()
  const rows = await db.characters
    .filter((row) => !row.deleted && (row.folder ?? '').trim() === target)
    .toArray()
  const now = Date.now()
  for (const row of rows) {
    await db.characters.update(row.id, { folder: undefined, ...pendingStamp(now) })
    await logOperation('characters', row.id, 'folder', target, '')
  }
  return rows.length
}
