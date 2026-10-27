import { db } from '@/lib/db'
import type { VaultScanResult, VaultStorableKind } from './types'
import { scanVault } from './scan'
import { vaultFs } from './vault-fs'
import { withVaultSuppressedAsync, resetVaultWriteState } from './vault-persist'
import { applyTagMeta, parseTagMeta } from './vault-tags'
import { applyDocumentBodies, documentOfEntity } from './markdown-bridge'
import { MARKER_REL_PATH } from './vault-marker'
import { normalizeRelPath } from './vault-paths'
import {
  createVaultSession,
  entityKey,
  setVaultSession,
  TAG_META_REL_PATH,
  type VaultEntryState,
  type VaultSession,
  type VaultTableName,
} from './vault-session'

// ── 装载：磁盘 → 内存（Dexie） ───────────────────────────────────────────
// 两步刻意分开：
//   readVault  只读盘 + 建会话（不改数据库，可安全用于「扫描体检」）
//   applyDataset 在**一个事务**里整库替换 Dexie，并挂起落盘
// 分开是为了 UI 能先展示扫描报告、用户确认后再真正装载。

export interface VaultLoadResult {
  scan: VaultScanResult
  session: VaultSession
  counts: {
    characters: number
    countries: number
    events: number
    worldEntries: number
    tags: number
  }
  /** Rust 侧的告警（非 UTF-8、文件过大、目录不可读等） */
  warnings: string[]
  otherFiles: string[]
  /** 全部未跳过的目录（含空目录） */
  dirs: string[]
  truncated: boolean
}

interface RegisterArgs {
  table: VaultTableName
  kind: VaultStorableKind
  entries: { entity: { id: number }; relPath: string }[]
}

function registerEntities(
  session: VaultSession,
  scan: VaultScanResult,
  files: Map<string, { content: string; mtimeMs: number }>,
  args: RegisterArgs,
): void {
  const noteByPath = new Map(scan.notes.map((note) => [note.relPath, note]))

  for (const item of args.entries) {
    // relPath 为空 = 该实体没有文件（例如只存在于 frontmatter 里的标签）
    if (item.relPath === '') continue
    const relPath = normalizeRelPath(item.relPath)
    const file = files.get(relPath)
    const note = noteByPath.get(relPath)
    if (file === undefined || note === undefined) continue

    const state: VaultEntryState = {
      table: args.table,
      id: item.entity.id,
      kind: args.kind,
      relPath,
      content: file.content,
      mtimeMs: Math.round(file.mtimeMs),
      entity: item.entity,
      frontmatter: note.frontmatter,
      bodyMarkdown: note.body,
      bodyDoc: JSON.stringify(documentOfEntity(args.kind, item.entity) ?? null),
      trashed: relPath.startsWith('.ocstudio/trash/'),
    }
    const key = entityKey(args.table, item.entity.id)
    session.entries.set(key, state)
    session.byPath.set(relPath, key)
  }
}

/** 只读盘 + 建会话，不改数据库 */
export async function readVault(root: string): Promise<VaultLoadResult> {
  const dto = await vaultFs.scan(root)

  const scan = scanVault({
    root: dto.root,
    files: dto.files.map((file) => ({
      relPath: file.relPath,
      content: file.content,
      size: file.size,
      mtimeMs: file.mtimeMs,
    })),
    skippedDirs: dto.skippedDirs,
    marker: dto.marker,
  })

  const session = createVaultSession(dto.root)
  const files = new Map(
    dto.files.map((file) => [normalizeRelPath(file.relPath), { content: file.content, mtimeMs: file.mtimeMs }]),
  )

  for (const file of dto.files) session.occupied.add(normalizeRelPath(file.relPath))
  for (const path of dto.otherFiles) session.occupied.add(normalizeRelPath(path))
  session.occupied.add(TAG_META_REL_PATH)

  // 标签元数据：单独一个小文件，不在 .md 扫描范围内，另外读
  try {
    if (await vaultFs.exists(dto.root, TAG_META_REL_PATH)) {
      const bytes = await vaultFs.readBytes(dto.root, TAG_META_REL_PATH)
      const content = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
      session.tagMeta.content = content
      session.tagMeta.entries = parseTagMeta(content)
    }
  } catch {
    // 读不到就当没有：标签颜色会回落到按名字派生的颜色
  }

  // 所有对 dataset 的加工必须在建会话**之前**完成：
  // 会话里存的是实体对象的引用，之后替换数组元素不会反映到会话上。
  for (const row of scan.dataset.tags) {
    row.entity = applyTagMeta([row.entity], session.tagMeta.entries)[0] ?? row.entity
  }
  applyDocumentBodies(scan)

  registerEntities(session, scan, files, {
    table: 'characters',
    kind: 'character',
    entries: scan.dataset.characters,
  })
  registerEntities(session, scan, files, {
    table: 'countries',
    kind: 'country',
    entries: scan.dataset.countries,
  })
  registerEntities(session, scan, files, {
    table: 'events',
    kind: 'event',
    entries: scan.dataset.events,
  })
  registerEntities(session, scan, files, {
    table: 'worldEntries',
    kind: 'worldEntry',
    entries: scan.dataset.worldEntries,
  })
  registerEntities(session, scan, files, {
    table: 'tags',
    kind: 'tag',
    entries: scan.dataset.tags,
  })
  registerEntities(session, scan, files, {
    table: 'periods',
    kind: 'period',
    entries: scan.dataset.periods,
  })

  if (dto.marker !== null) {
    session.marker = { relPath: MARKER_REL_PATH, content: dto.marker }
  }

  return {
    scan,
    session,
    counts: {
      characters: scan.dataset.characters.length,
      countries: scan.dataset.countries.length,
      events: scan.dataset.events.length,
      worldEntries: scan.dataset.worldEntries.length,
      tags: scan.dataset.tags.length,
    },
    warnings: dto.warnings,
    otherFiles: dto.otherFiles,
    dirs: dto.dirs,
    truncated: dto.truncated,
  }
}

/**
 * 整库替换 Dexie。
 * 必须在**挂起落盘**的前提下做：这个过程会产生上千次写入，
 * 若不挂起就会把中间态写进用户的文件夹。
 */
export async function applyDataset(scan: VaultScanResult): Promise<void> {
  const { dataset } = scan

  await withVaultSuppressedAsync(async () => {
    await db.transaction(
      'rw',
      [
        db.characters,
        db.events,
        db.countries,
        db.worldEntries,
        db.tags,
        db.periods,
        db.meta,
        db.operationLog,
      ],
      async () => {
        await Promise.all([
          db.characters.clear(),
          db.events.clear(),
          db.countries.clear(),
          db.worldEntries.clear(),
          db.tags.clear(),
          db.periods.clear(),
          db.meta.clear(),
          // 操作日志是同步用的簿记，切换 vault 后旧的 targetId 已无意义
          db.operationLog.clear(),
        ])

        await Promise.all([
          dataset.characters.length > 0
            ? db.characters.bulkAdd(dataset.characters.map((item) => item.entity))
            : Promise.resolve(),
          dataset.countries.length > 0
            ? db.countries.bulkAdd(dataset.countries.map((item) => item.entity))
            : Promise.resolve(),
          dataset.events.length > 0
            ? db.events.bulkAdd(dataset.events.map((item) => item.entity))
            : Promise.resolve(),
          dataset.worldEntries.length > 0
            ? db.worldEntries.bulkAdd(dataset.worldEntries.map((item) => item.entity))
            : Promise.resolve(),
          dataset.tags.length > 0
            ? db.tags.bulkAdd(dataset.tags.map((item) => item.entity))
            : Promise.resolve(),
          dataset.periods.length > 0
            ? db.periods.bulkAdd(dataset.periods.map((item) => item.entity))
            : Promise.resolve(),
          dataset.project !== null ? db.meta.put(dataset.project.entity) : Promise.resolve(),
        ])
      },
    )
  })
}

/**
 * 打开一个 vault：读盘 → 整库替换 → 建立会话。
 * 返回装载结果以便 UI 展示扫描报告。
 */
export async function loadVault(root: string): Promise<VaultLoadResult> {
  resetVaultWriteState()
  const result = await readVault(root)
  await applyDataset(result.scan)
  setVaultSession(result.session)
  return result
}

/** 关闭当前 vault（数据留在 Dexie，只是不再往磁盘写） */
export function closeVaultSession(): void {
  resetVaultWriteState()
  setVaultSession(null)
}
