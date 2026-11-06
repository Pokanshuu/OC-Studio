'use client'

/**
 * 自定义分类的读写。
 *
 * - 有文件夹：`.ocstudio/categories.json`（随库走，换机器一致）
 * - 浏览器预览：localStorage（键 `oc-categories-v1`；只让界面点得动，不参与导出）
 *
 * 读失败一律回落「空列表」：分类表坏了最坏情况是侧栏少几个入口，
 * 笔记本身一张都不会少（分类只是笔记上的一个 `category` 值）。
 */
import { useSyncExternalStore } from 'react'
import { isVaultSupported, vaultFs } from '@/lib/vault/vault-fs'
import { getVaultSession } from '@/lib/vault/vault-session'
import { CATEGORIES_REL_PATH, newCategoryId, type Category } from './types'
import { DEFAULT_CATEGORY_ICON, normalizeCategoryIcon } from './icons'
import { BUILTIN_CATEGORIES, BUILTIN_CATEGORY_ID_SET } from './builtins'

const LS_KEY = 'oc-categories-v1'
const VERSION = 1

let snapshot: Category[] = []
let loaded = false
let loading: Promise<void> | null = null
/** 上次成功装载对应的库根；换库 / 启动早于会话就绪时靠它触发重读 */
let loadedRoot: string | null = null
/** 读盘报错（不是「文件不存在」）：此时禁止写回，否则会用内置默认表覆盖用户盘上的分类 */
let readFailed = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function normalize(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return []
  const out: Category[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    const id = typeof record.id === 'string' && record.id.trim() !== '' ? record.id.trim() : newCategoryId()
    out.push({
      id,
      name,
      template: typeof record.template === 'string' && record.template.trim() !== '' ? record.template.trim() : 'entry',
      icon: normalizeCategoryIcon(record.icon),
      order: typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : out.length,
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      builtin: record.builtin === true || BUILTIN_CATEGORY_ID_SET.has(id) ? true : undefined,
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

/**
 * 内置分类永远在表里：盘上同 id / 同名的那条覆盖出厂值（用户打开的开关不会丢），
 * 其余内置项补在后面。这样「老库里已经建过一个叫宠物 的分类」也能原地升级成预设。
 */
function mergeBuiltins(categories: Category[]): Category[] {
  const byId = new Map<string, Category>()
  const byName = new Map<string, Category>()
  for (const builtin of BUILTIN_CATEGORIES) {
    byId.set(builtin.id, { ...builtin })
    byName.set(builtin.name, builtin)
  }
  for (const category of categories) {
    const builtin = byId.get(category.id) ?? byName.get(category.name)
    if (builtin) {
      byId.set(builtin.id, { ...builtin, ...category, id: builtin.id, builtin: true })
    } else {
      byId.set(category.id, { ...category, builtin: undefined })
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order)
}

function serialize(categories: Category[]): string {
  return `${JSON.stringify({ version: VERSION, categories }, null, 2)}\n`
}

function vaultRoot(): string | null {
  if (!isVaultSupported()) return null
  return (getVaultSession()?.root ?? null)
}

/**
 * 装载分类表。
 *
 * **按库根判断新鲜度**：启动时这次调用可能发生在会话还没建立（或者用户换了库）的时候，
 * 那时读不到 `.ocstudio/categories.json`，结果就是「刷新后侧栏分类全没了」。
 * 所以记住上次装载用的是哪个根，根一变就重读（`AppShell` 也会在 root 变化时再喊一次）。
 *
 * 读失败**不覆盖**已有表：一次 I/O 抖动不该让侧栏清空，更不该让下一次保存
 * 把盘上的分类写成内置默认表（那才是真的丢数据）。
 */
export async function loadCategories(force = false): Promise<void> {
  if (loading) return loading
  const root = vaultRoot()
  // 桌面版但会话还没建好（启动早期）：**不要**退到 localStorage ——
  // 那是浏览器预览的那份，混进来就会出现「侧栏的分类不是笔记库里的」。
  // 直接从这儿返回，等库根出现后 `VaultCategoriesSync` 会再喊一次。
  if (root === null && isVaultSupported()) return
  if (!force && loaded && loadedRoot === root) return
  loading = (async () => {
    let next = snapshot
    let failed = false
    try {
      if (root) {
        if (await vaultFs.exists(root, CATEGORIES_REL_PATH)) {
          const bytes = await vaultFs.readBytes(root, CATEGORIES_REL_PATH)
          const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as { categories?: unknown }
          next = mergeBuiltins(normalize(payload?.categories))
        } else {
          next = mergeBuiltins([])
        }
      } else if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY)
        next = raw === null
          ? mergeBuiltins([])
          : mergeBuiltins(normalize((JSON.parse(raw) as { categories?: unknown })?.categories))
      } else {
        next = mergeBuiltins([])
      }
    } catch {
      failed = true
      next = snapshot.length > 0 ? snapshot : mergeBuiltins([])
    } finally {
      snapshot = next
      loadedRoot = root
      readFailed = failed
      loaded = true
      loading = null
      emit()
    }
  })()
  return loading
}

/**
 * 保存分类表：**先落盘，成功后才换内存**。
 *
 * 反过来的话，写失败时界面照样会显示新分类 —— 用户看到「建好了」，刷新就没了。
 * 现在写失败会抛给调用方（弹窗 / 开关会把错误显示出来），内存保持与磁盘一致。
 */
export async function saveCategories(next: Category[]): Promise<void> {
  if (readFailed) throw new Error('分类表上次没有读成功，先刷新笔记库再改')
  const ordered = mergeBuiltins(normalize(next)).map((category, index) => ({ ...category, order: index }))
  const root = vaultRoot()

  if (root) {
    try {
      await vaultFs.mkdir(root, '.ocstudio')
    } catch {
      // 目录已存在时可能抛错，忽略
    }
    const results = await vaultFs.writeTexts(root, [
      { relPath: CATEGORIES_REL_PATH, content: serialize(ordered) },
    ])
    const failed = results.find((result) => !result.ok)
    if (failed !== undefined) throw new Error(failed.error ?? '写入分类失败')
  } else if (isVaultSupported()) {
    // 桌面版没有库根 = 会话还没建好。不能悄悄写进 localStorage（刷新就没了），
    // 也不能假装成功 —— 直接抛，由调用方把「稍后再试」显示出来。
    throw new Error('笔记库还没准备好，稍后再试')
  } else if (typeof window !== 'undefined') {
    localStorage.setItem(LS_KEY, serialize(ordered))
  }

  snapshot = ordered
  loaded = true
  loadedRoot = root
  readFailed = false
  emit()
}

export function getCategories(): Category[] {
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 订阅分类表；设置里改完，侧栏立刻跟着变 */
export function useCategories(): Category[] {
  return useSyncExternalStore(subscribe, getCategories, getCategories)
}

export async function createCategory(input: {
  name: string
  template?: string
  icon?: Category['icon']
}): Promise<Category> {
  const name = input.name.trim()
  if (name === '') throw new Error('分类名不能为空')
  if (snapshot.some((category) => category.name === name)) throw new Error(`已经有叫「${name}」的分类了`)
  // 排在最后：内置分类出厂 order 是 1000 / 1001，直接用 length 会让新分类跑到最前面
  const maxOrder = snapshot.reduce((max, category) => Math.max(max, category.order), -1)
  const category: Category = {
    id: newCategoryId(),
    name,
    template: (input.template ?? 'entry').trim() || 'entry',
    icon: input.icon ?? DEFAULT_CATEGORY_ICON,
    order: maxOrder + 1,
    enabled: true,
  }
  await saveCategories([...snapshot, category])
  return category
}

export async function updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>): Promise<void> {
  const current = snapshot.find((category) => category.id === id)
  if (!current) return
  // 内置分类只允许改「在侧栏显示」和顺序；名字 / 图标 / 模板是出厂定义
  const next: Category = current.builtin
    ? {
        ...current,
        enabled: patch.enabled ?? current.enabled,
        order: patch.order ?? current.order,
      }
    : {
        ...current,
        ...patch,
        name: (patch.name ?? current.name).trim() || current.name,
        enabled: patch.enabled ?? current.enabled,
      }
  await saveCategories(snapshot.map((category) => (category.id === id ? next : category)))
}

export async function deleteCategory(id: string): Promise<void> {
  const current = snapshot.find((category) => category.id === id)
  if (current?.builtin) throw new Error('内置分类不能删除')
  await saveCategories(snapshot.filter((category) => category.id !== id))
}

export async function reorderCategories(ids: string[]): Promise<void> {
  const byId = new Map(snapshot.map((category) => [category.id, category]))
  const next = ids
    .map((id, index) => {
      const category = byId.get(id)
      return category === undefined ? null : { ...category, order: index }
    })
    .filter((category): category is Category => category !== null)
  await saveCategories(next)
}

export function findCategory(id: string): Category | undefined {
  return snapshot.find((category) => category.id === id)
}

export function findCategoryByName(name: string): Category | undefined {
  const target = name.trim()
  return snapshot.find((category) => category.name === target)
}
