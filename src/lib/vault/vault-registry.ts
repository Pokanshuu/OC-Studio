// ── 最近打开的 vault（localStorage） ─────────────────────────────────────
// 只存路径与时间，不存数据。路径不做任何校验 —— 文件夹可能被移动或删除，
// 真正打开时由 Rust 侧的 probe 给出结论。

const LIST_KEY = 'oc-studio-vaults'
const LAST_KEY = 'oc-studio-last-vault'
const ENABLED_KEY = 'oc-studio-vault-enabled'

const MAX_ENTRIES = 12

export interface VaultRegistryEntry {
  path: string
  name: string
  openedAt: number
}

/** 从路径取展示名（最后一段，容忍正反斜杠与结尾斜杠） */
export function vaultNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? normalized
}

function readList(): VaultRegistryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LIST_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item) => ({
        path: typeof item.path === 'string' ? item.path : '',
        name: typeof item.name === 'string' ? item.name : '',
        openedAt: typeof item.openedAt === 'number' ? item.openedAt : 0,
      }))
      .filter((item) => item.path !== '')
      .sort((a, b) => b.openedAt - a.openedAt)
  } catch {
    return []
  }
}

function writeList(entries: VaultRegistryEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LIST_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // 存储不可用：最近列表是锦上添花，静默降级
  }
}

export function listRecentVaults(): VaultRegistryEntry[] {
  return readList()
}

export function rememberVault(path: string): void {
  const name = vaultNameFromPath(path)
  const rest = readList().filter((item) => item.path !== path)
  writeList([{ path, name, openedAt: Date.now() }, ...rest])
  setLastVaultPath(path)
}

export function forgetVault(path: string): void {
  writeList(readList().filter((item) => item.path !== path))
  if (lastVaultPath() === path) setLastVaultPath(null)
}

export function lastVaultPath(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export function setLastVaultPath(path: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (path === null) window.localStorage.removeItem(LAST_KEY)
    else window.localStorage.setItem(LAST_KEY, path)
  } catch {
    // 同上
  }
}

/**
 * 用户是否启用过 vault。
 * 用「内置数据库」还是「vault 文件夹」是个显式选择：
 * 没启用过就完全走原来的 IndexedDB 行为，不打扰已有用户。
 */
export function isVaultEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setVaultEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(ENABLED_KEY, 'true')
    else window.localStorage.removeItem(ENABLED_KEY)
  } catch {
    // 同上
  }
  if (!enabled) setLastVaultPath(null)
}
