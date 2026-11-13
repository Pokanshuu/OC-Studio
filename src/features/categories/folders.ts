/**
 * 自定义分类的文件夹（2026-11-14）。
 *
 * 与角色文件夹同一套规矩：文件夹只是条目上的一个 `folder` 名字，
 * **删文件夹不删条目**，重命名只批量改这个名字。空文件夹没有条目可挂，
 * 所以清单单独存 `.ocstudio/world-folders.json`，**按分类分组** ——
 * 「宠物」的文件夹不该出现在「武器」里。
 *
 * 浏览器预览退化成 localStorage；清单读失败时禁止写回，避免用残缺清单覆盖盘上的真清单。
 */
import { useSyncExternalStore } from 'react'
import { db } from '@/lib/db'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { logOperation, pendingStamp } from '@/lib/sync'
import type { WorldEntry } from '@/types'

export const UNGROUPED = '未分组'

export interface CategoryFolder {
  name: string
  count: number
}

export type FolderFilter = 'all' | 'ungrouped' | string

const REGISTRY_REL_PATH = '.ocstudio/world-folders.json'
const LS_KEY = 'oc-world-folders-v1'
const REGISTRY_VERSION = 1

/** category → 文件夹名[] */
type Registry = Record<string, string[]>

let registry: Registry = {}
let registryLoaded = false
let registryLoadedRoot: string | null = null
let registryLoading: Promise<void> | null = null
let registryReadFailed = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** 校验「分类 → 文件夹名[]」本身（保存与读取共用） */
function normalizeFolderMap(source: unknown): Registry {
  if (source === null || typeof source !== 'object') return {}
  const out: Registry = {}
  for (const [category, value] of Object.entries(source as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const names: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') continue
      const name = item.trim()
      if (name !== '' && !names.includes(name)) names.push(name)
    }
    if (names.length > 0) out[category] = names
  }
  return out
}

/** 读盘格式：`{ version, folders: { 分类: string[] } }` */
function normalizeRegistry(raw: unknown): Registry {
  if (raw === null || typeof raw !== 'object') return {}
  return normalizeFolderMap((raw as { folders?: unknown }).folders)
}

function serializeRegistry(value: Registry): string {
  return `${JSON.stringify({ version: REGISTRY_VERSION, folders: value }, null, 2)}\n`
}

function root(): string | null {
  if (!isVaultSupported()) return null
  return getVaultSession()?.root ?? null
}

export async function loadWorldFolderRegistry(force = false): Promise<void> {
  if (registryLoading) return registryLoading
  const readyRoot = root()
  if (readyRoot === null && isVaultSupported()) return
  if (!force && registryLoaded && registryLoadedRoot === readyRoot) return
  registryLoading = (async () => {
    try {
      if (readyRoot) {
        if (await vaultFs.exists(readyRoot, REGISTRY_REL_PATH)) {
          const bytes = await vaultFs.readBytes(readyRoot, REGISTRY_REL_PATH)
          const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as unknown
          registry = normalizeRegistry(payload)
        } else {
          registry = {}
        }
      } else if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY)
        registry = raw === null ? {} : normalizeRegistry(JSON.parse(raw) as unknown)
      }
      registryReadFailed = false
    } catch {
      registryReadFailed = true
    } finally {
      registryLoaded = true
      registryLoadedRoot = readyRoot
      registryLoading = null
      emit()
    }
  })()
  return registryLoading
}

async function saveRegistry(next: Registry): Promise<void> {
  // 注意：这里传进来的是「分类 → 名字」的映射本身，不是文件里的 { folders }
  const names = normalizeFolderMap(next)
  const currentRoot = root()
  if (currentRoot === null && isVaultSupported()) throw new Error('笔记库还没打开，稍后再试')
  if (registryReadFailed) throw new Error('文件夹清单上次没有读成功，先刷新笔记库再改')

  const previous = registry
  registry = names
  registryLoaded = true
  registryLoadedRoot = currentRoot
  emit()

  try {
    if (currentRoot) {
      try {
        await vaultFs.mkdir(currentRoot, '.ocstudio')
      } catch {
        // 已存在时可能抛错，忽略
      }
      const results = await vaultFs.writeTexts(currentRoot, [
        { relPath: REGISTRY_REL_PATH, content: serializeRegistry(names) },
      ])
      const failed = results.find((result) => !result.ok)
      if (failed !== undefined) throw new Error(failed.error ?? '写入文件夹清单失败')
      registryReadFailed = false
      return
    }
    if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, serializeRegistry(names))
  } catch (err) {
    registry = previous
    emit()
    throw err
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): Registry {
  return registry
}

/** 当前分类的文件夹清单（含空文件夹） */
export function useWorldFolderRegistry(category: string): string[] {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot)
  return all[category] ?? []
}

/** 非 Hook 版（脚本 / 调试） */
export function getWorldFolderNames(category: string): string[] {
  return registry[category] ?? []
}

export async function createWorldFolder(category: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '') return
  await loadWorldFolderRegistry()
  const current = registry[category] ?? []
  if (current.includes(trimmed)) return
  await saveRegistry({ ...registry, [category]: [...current, trimmed] })
}

/** 现有文件夹（清单 + 条目上的名字合并，按名字排序）+ 未分组计数 */
export function listWorldFolders(
  entries: WorldEntry[],
  category: string,
  registered: string[] = [],
): { folders: CategoryFolder[]; ungrouped: number } {
  const counts = new Map<string, number>()
  for (const name of registered) {
    const trimmed = name.trim()
    if (trimmed !== '' && !counts.has(trimmed)) counts.set(trimmed, 0)
  }
  let ungrouped = 0
  for (const entry of entries) {
    if (entry.category !== category) continue
    const folder = (entry.folder ?? '').trim()
    if (folder === '') ungrouped += 1
    else counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  const folders = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
  return { folders, ungrouped }
}

export async function moveWorldEntryToFolder(
  id: number,
  category: string,
  folder: string | null,
): Promise<void> {
  const name = (folder ?? '').trim()
  const now = Date.now()
  await db.worldEntries.update(id, {
    folder: name === '' ? undefined : name,
    ...pendingStamp(now),
  })
  await logOperation('worldEntries', id, 'folder', '', name)
  if (name !== '') {
    try {
      await createWorldFolder(category, name)
    } catch (err) {
      console.error('[world-folders] 登记文件夹失败', err)
    }
  }
}

export async function renameWorldFolder(category: string, from: string, to: string): Promise<number> {
  const source = from.trim()
  const target = to.trim()
  if (source === '' || target === '' || source === target) return 0

  const rows = await db.worldEntries
    .filter((row) => !row.deleted && row.category === category && (row.folder ?? '').trim() === source)
    .toArray()
  const now = Date.now()
  for (const row of rows) {
    await db.worldEntries.update(row.id, { folder: target, ...pendingStamp(now) })
    await logOperation('worldEntries', row.id, 'folder', source, target)
  }

  await loadWorldFolderRegistry()
  const current = registry[category] ?? []
  if (current.includes(source) || rows.length > 0) {
    await saveRegistry({
      ...registry,
      [category]: [...current.filter((name) => name !== source), target],
    })
  }
  return rows.length
}

export async function deleteWorldFolder(category: string, name: string): Promise<number> {
  const target = name.trim()
  const rows = await db.worldEntries
    .filter((row) => !row.deleted && row.category === category && (row.folder ?? '').trim() === target)
    .toArray()
  const now = Date.now()
  for (const row of rows) {
    await db.worldEntries.update(row.id, { folder: undefined, ...pendingStamp(now) })
    await logOperation('worldEntries', row.id, 'folder', target, '')
  }

  await loadWorldFolderRegistry()
  const current = registry[category] ?? []
  if (current.includes(target)) {
    await saveRegistry({ ...registry, [category]: current.filter((folder) => folder !== target) })
  }
  return rows.length
}
