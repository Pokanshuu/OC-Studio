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
/** 上次读清单用的库根（换库要重读） */
let registryLoadedRoot: string | null = null
let registryLoading: Promise<void> | null = null
/**
 * 读盘报错（不是"文件不存在"）。
 *
 * 没有这个标记时：`folders.json` 一旦读坏（手改少了逗号 / 断电截断 / 被占用），
 * `registry` 停在空表，接着用户新建一个文件夹就把"只剩这一个名字"写回去 ——
 * **所有空文件夹从清单里消失**（有角色的还能靠角色身上的 `folder` 键带回来）。
 * 模板 / 基本信息 / 正文三份都按这条规矩防住了，这份不能漏。
 */
let registryReadFailed = false
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

/**
 * 读清单：库优先，浏览器预览退化成 localStorage。重复调用只读一次。
 *
 * 桌面版但会话还没建好时**直接返回**：以前会读成一份空清单并标记完成，
 * 之后再也读不到盘上的文件夹，接着一改名就把空清单写回去了。
 */
export async function loadFolderRegistry(force = false): Promise<void> {
  if (registryLoading) return registryLoading
  const readyRoot = registryRoot()
  if (readyRoot === null && isVaultSupported()) return
  if (!force && registryLoaded && registryLoadedRoot === readyRoot) return
  registryLoading = (async () => {
    try {
      const root = readyRoot
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
      registryReadFailed = false
    } catch {
      // 读失败不覆盖已有清单，但要记住这次没读成 —— 之后禁止写回
      registryReadFailed = true
    } finally {
      registryLoaded = true
      registryLoadedRoot = readyRoot
      registryLoading = null
      emitRegistry()
    }
  })()
  return registryLoading
}

async function saveRegistry(next: string[]): Promise<void> {
  const names = normalizeRegistry(next)
  const root = registryRoot()
  // 会话没就绪：不写，免得把空清单覆盖到盘上
  if (root === null && isVaultSupported()) throw new Error('笔记库还没打开，稍后再试')
  // 上次没读成功：写回去等于用一份残缺清单覆盖盘上的真清单
  if (registryReadFailed) throw new Error('文件夹清单上次没有读成功，先刷新笔记库再改')
  const previous = registry
  registry = names
  registryLoaded = true
  registryLoadedRoot = root
  emitRegistry()

  try {
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
      registryReadFailed = false
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

/** 当前文件夹清单（非 Hook 版，备份导出 / 恢复用） */
export function getFolderRegistry(): string[] {
  return registry
}

/** 整表替换文件夹清单（备份恢复用；与新建 / 改名共用同一套校验） */
export async function saveFolderRegistry(next: string[]): Promise<void> {
  await saveRegistry(next)
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

/**
 * 「新建文件夹」的自动命名：优先用这个名字本身，被占了就往后加序号。
 * 给**拖拽成夹**用 —— 那个手势不该再弹出输入框问名字。
 */
export function nextFolderName(taken: Iterable<string>): string {
  const used = new Set<string>()
  for (const name of taken) {
    const trimmed = name.trim()
    if (trimmed !== '') used.add(trimmed)
  }
  const base = '新建文件夹'
  if (!used.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`
    if (!used.has(candidate)) return candidate
  }
  return `${base} ${used.size + 1}`
}

/**
 * 拖拽成夹：把几个角色收进一只**新的**文件夹，返回文件夹名。
 * 走的是和「移到文件夹」完全相同的一条路（改 `folder` 键 + 登记清单），
 * 只是名字自动取 —— 手势结束时不该再打断一次输入。
 */
export async function mergeIntoNewFolder(ids: number[], taken: Iterable<string> = []): Promise<string> {
  // 清单可能还在读盘：先等它读完，免得挑了一个盘上已有的名字
  await loadFolderRegistry()
  const name = nextFolderName([...taken, ...registry])
  await createFolder(name)
  for (const id of ids) await moveCharacterToFolder(id, name)
  return name
}

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
