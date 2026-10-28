import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/env'

// ── Vault 文件系统门面（仅 Tauri） ───────────────────────────────────────
// app 侧对 vault 的全部读盘/写盘都经过这里，底层是自建的 Rust 命令
// （src-tauri/src/vault.rs），刻意不用 JS 的 fs 插件 —— 那样要在运行时
// 给 fs scope 授权并跨重启持久化，脆弱且要改 capability。

export interface VaultProbe {
  exists: boolean
  isDir: boolean
  /** 有 oc-studio.json 标记，或本身就是 Obsidian vault */
  isVault: boolean
  hasMarker: boolean
  hasObsidian: boolean
  hasOcstudioDir: boolean
  /** 根目录一层里的 .md 数量（用来判断「这看着像个 vault，要导入吗」） */
  mdCount: number
  dirCount: number
  schemaVersion: number | null
}

export interface VaultFileDto {
  relPath: string
  content: string
  size: number
  mtimeMs: number
}

export interface VaultScanDto {
  root: string
  files: VaultFileDto[]
  skippedDirs: string[]
  /** 非 .md 的其它文件（原样保留，只报告） */
  otherFiles: string[]
  /** 全部未跳过的目录（含空目录），用于识别 `99.附件` 这类约定 */
  dirs: string[]
  marker: string | null
  warnings: string[]
  truncated: boolean
}

export interface VaultWriteEntry {
  relPath: string
  content: string
  /** 上次读到的 mtime；磁盘上不一致时 Rust 侧拒绝覆盖 */
  expectedMtimeMs?: number
}

export interface VaultWriteResult {
  relPath: string
  ok: boolean
  conflict: boolean
  mtimeMs: number | null
  error: string | null
}

/** 当前环境是否支持 vault（只有桌面 Tauri 版有真实文件夹） */
export function isVaultSupported(): boolean {
  return isTauri()
}

function requireSupport(): void {
  if (!isVaultSupported()) {
    throw new Error('本地文件夹只在桌面版可用（需要访问本地文件系统）')
  }
}

export const vaultFs = {
  async probe(path: string): Promise<VaultProbe> {
    requireSupport()
    return invoke<VaultProbe>('vault_probe', { path })
  },

  async scan(path: string): Promise<VaultScanDto> {
    requireSupport()
    return invoke<VaultScanDto>('vault_scan', { path })
  },

  async writeTexts(path: string, entries: VaultWriteEntry[]): Promise<VaultWriteResult[]> {
    requireSupport()
    return invoke<VaultWriteResult[]>('vault_write_texts', { path, entries })
  },

  async writeBytes(path: string, relPath: string, bytes: number[]): Promise<number> {
    requireSupport()
    return invoke<number>('vault_write_bytes', { path, relPath, bytes })
  },

  /** 把外部文件复制进 vault（素材上传） */
  async importFile(path: string, source: string, relPath: string): Promise<number> {
    requireSupport()
    return invoke<number>('vault_import_file', { path, source, relPath })
  },

  async readBytes(path: string, relPath: string): Promise<number[]> {
    requireSupport()
    return invoke<number[]>('vault_read_bytes', { path, relPath })
  },

  async move(path: string, from: string, to: string): Promise<void> {
    requireSupport()
    await invoke('vault_move', { path, from, to })
  },

  async remove(path: string, relPath: string): Promise<void> {
    requireSupport()
    await invoke('vault_remove', { path, relPath })
  },

  async mkdir(path: string, relPath: string): Promise<void> {
    requireSupport()
    await invoke('vault_mkdir', { path, relPath })
  },

  async exists(path: string, relPath: string): Promise<boolean> {
    if (!isVaultSupported()) return false
    return invoke<boolean>('vault_exists', { path, relPath })
  },

  /** 时间线：往 `.ocstudio/journal.jsonl` 只追加，绝不重写 */
  async journalAppend(path: string, relPath: string, lines: string[]): Promise<void> {
    requireSupport()
    await invoke('journal_append', { root: path, relPath, lines })
  },

  /** 时间线：取最后 n 行（文件不存在返回空数组） */
  async journalTail(path: string, relPath: string, maxLines: number): Promise<string[]> {
    requireSupport()
    return invoke<string[]>('journal_tail', { root: path, relPath, maxLines })
  },
}
