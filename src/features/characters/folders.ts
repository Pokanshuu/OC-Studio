/**
 * 角色文件夹（W6）：名字是唯一标识；另有一份清单，让**空文件夹**也留得住。
 *
 * 规矩：
 * - 文件夹在角色上只是一个 `folder` 键（frontmatter `folder` / `文件夹` / `分类`）
 * - **删文件夹不删角色**：删的是这个名字，角色回到「未分组」
 * - 重命名 = 批量改这个键，角色本身不动
 * - 空文件夹没有角色可挂，所以清单单独存 `.ocstudio/folders.json`
 *   （浏览器预览退化成 localStorage）；有同名角色时以角色为准
 */
import { useSyncExternalStore } from 'react'
import { db } from '@/lib/db'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { Character } from '@/types'

/** 未分组在 UI 上的标题（不写进数据） */
export const UNGROUPED = '未分组'

export interface CharacterFolder {
  name: string
  count: number
}

/* ── 文件夹清单（空文件夹的落脚点） ─────────────────────────── */

const FOLDERS_REL_PATH = '.ocstudio/folders.json'
const LS_KEY = 'oc-character-folders-v1'
const REGISTRY_VERSION = 1

let registry: string[] = []
let registryLoaded = false
let registryLoading: Promise<void> | null = null
const registryListeners = new Set<() => void>()

function emitRegistry(): void {
  for (const listener of registryListeners) listener()
}

function normalizeRegistry(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const name = item.trim()
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
}

function serializeRegistry(names: string[]): string {
  return `${JSON.stringify({ version: REGISTRY_VERSION, folders: names }, null, 2)}\n`
}

function registryRoot(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

/** 读清单：库优先，浏览器预览退化成 localStorage。重复调用只读一次 */
export async function loadFolderRegistry(force = false): Promise<void> {
  if (registryLoading) return registryLoading
  if (registryLoaded && !force) return
  registryLoading = (async () => {
    try {
      const root = registryRoot()
      if (root) {
        if (await vaultFs.exists(root, FOLDERS_REL_PATH)) {
          const bytes = await vaultFs.readBytes(root, FOLDERS_REL_PATH)
          const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as { folders?: unknown }
          registry = normalizeRegistry(payload?.folders)
        } else {
          registry = []
        }
      } else if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY)
        registry = raw === null ? [] : normalizeRegistry((JSON.parse(raw) as { folders?: unknown })?.folders)
      }
    } catch {
      registry = []
    } finally {
      registryLoaded = true
      registryLoading = null
      emitRegistry()
    }
  })()
  return registryLoading
}

async function saveRegistry(next: string[]): Promise<void> {
  const names = normalizeRegistry(next)
  const previous = registry
  registry = names
  registryLoaded = true
  emitRegistry()

  try {
    const root = registryRoot()
    if (root) {
      try {
        await vaultFs.mkdir(root, '.ocstudio')
      } catch {
        // 目录已存在时可能抛错，忽略
      }
      const results = await vaultFs.writeTexts(root, [
        { relPath: FOLDERS_REL_PATH, content: serializeRegistry(names) },
      ])
      const failed = results.find((result) => !result.ok)
      if (failed !== undefined) throw new Error(failed.error ?? '写入文件夹清单失败')
      return
    }
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, serializeRegistry(names))
  } catch (err) {
    // 写盘失败就把界面退回旧清单：不要让人以为文件夹已经留住了
    registry = previous
    emitRegistry()
    throw err
  }
}

function subscribeRegistry(listener: () => void): () => void {
  registryListeners.add(listener)
  return () => {
    registryListeners.delete(listener)
  }
}

function getRegistrySnapshot(): string[] {
  return registry
}

/** 当前文件夹清单（含空文件夹）；角色上出现但还没登记的名字由 `listFolders` 合并 */
export function useFolderRegistry(): string[] {
  return useSyncExternalStore(subscribeRegistry, getRegistrySnapshot, getRegistrySnapshot)
}

/** 新建一个（可能是空的）文件夹；同名直接返回，不重复登记 */
export async function createFolder(name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '') return
  // 第一次点击时清单可能还在读盘：先等它读完，别用「只有这一条」把旧清单覆盖掉
  await loadFolderRegistry()
  if (registry.includes(trimmed)) return
  await saveRegistry([...registry, trimmed])
}

/* ── 文件夹与角色 ─────────────────────────────────────────── */

/** 现有文件夹（清单 + 角色上的名字合并，按名字排序）+ 未分组计数 */
export function listFolders(
  characters: Character[],
  registered: string[] = [],
): { folders: CharacterFolder[]; ungrouped: number } {
  const counts = new Map<string, number>()
  for (const name of registered) {
    const trimmed = name.trim()
    if (trimmed !== '' && !counts.has(trimmed)) counts.set(trimmed, 0)
  }
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

/** 把角色放进文件夹（`null` = 移出到未分组）；新名字会顺手登记进清单 */
export async function moveCharacterToFolder(id: number, folder: string | null): Promise<void> {
  const name = (folder ?? '').trim()
  const now = Date.now()
  await db.characters.update(id, {
    folder: name === '' ? undefined : name,
    // 分组不是内容编辑：不碰 updatedAt，否则整夹角色会窜到「最近更新」最前面
    ...pendingStamp(now),
  })
  await logOperation('characters', id, 'folder', '', name)
  if (name !== '') {
    try {
      await createFolder(name)
    } catch (err) {
      // 角色已经进夹了，清单写失败不能反过来把这次移动判失败；文件夹本身仍由角色带着
      console.error('[folders] 登记文件夹失败', err)
    }
  }
}

/** 重命名文件夹：批量改 `folder` 键，角色一条都不动；清单跟着换名字 */
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
  await loadFolderRegistry()
  if (registry.includes(source) || rows.length > 0) {
    await saveRegistry([...registry.filter((name) => name !== source), target])
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
  await loadFolderRegistry()
  if (registry.includes(target)) {
    await saveRegistry(registry.filter((folder) => folder !== target))
  }
  return rows.length
}
