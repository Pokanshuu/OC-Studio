import type { DBCoreMutateRequest } from 'dexie'

import { db } from '@/lib/db'
import { setBody, setFrontmatterKeys } from './frontmatter'
import { serializeEntity, type FrontmatterUpdates, type SerializeContext } from './serialize'
import { allocateRelPath, normalizeRelPath, originalRelPathFromTrash, pickPreferredFolder, trashRelPath } from './vault-paths'
import {
  entityKey,
  getVaultSession,
  KIND_BY_TABLE,
  type VaultEntryState,
  type VaultTableName,
} from './vault-session'
import { vaultFs, type VaultWriteEntry } from './vault-fs'
import { serializeTagMeta } from './vault-tags'
import { createLinkSerializer, documentOfEntity, serializeBody } from './markdown-bridge'
import type { Character, Country, Event, Tag, WorldEntry } from '@/types'

// ── 落盘队列 ────────────────────────────────────────────────────────────
// 「文件是真源」的写半边。设计要点：
//
// 1. **挂在 Dexie 中间件上，而不是逐个改 service。**
//    `db.use({stack:'dbcore'})` 拦的是所有写入路径：service 的 CRUD、
//    批量导入、引用回写、回收站还原、拖拽排序、词条自动保存 —— 一处接线全覆蓋。
//    中间件拿到的 keys 已经解析完成（含自增主键），不需要去猜。
//
// 2. **只在事务外做 IO。** 中间件里只记「(表, id) 脏了」，真正的读行/序列化/写文件
//    都在防抖之后的异步 flush 里做，避免在 Dexie 事务里做文件 IO（事务可能回滚）。
//
// 3. **绝不静默删除文件。** deleteRange（`clear()`）一律忽略 —— 批量导入的
//    `replace` 策略会 clear 全表，若照做就会把整个 vault 的文件删光。
//    单个删除只走「移入回收站」，真正删除文件仅发生在「回收站里彻底删除」时。

const FLUSH_DELAY_MS = 350

interface PendingWrite {
  table: VaultTableName
  id: number
}

export interface VaultFlushReport {
  written: number
  movedToTrash: number
  restored: number
  removed: number
  conflicts: string[]
  errors: { relPath: string; message: string }[]
}

export interface VaultWriteStatus {
  pending: number
  flushing: boolean
  lastError: string | null
  lastFlushedAt: number | null
}

let installed = false
let suppressed = 0
let pending = new Map<string, PendingWrite>()
let flushing = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let lastError: string | null = null
let lastFlushedAt: number | null = null

const listeners = new Set<(status: VaultWriteStatus) => void>()

export function subscribeVaultWriteStatus(listener: (status: VaultWriteStatus) => void): () => void {
  listeners.add(listener)
  listener(currentStatus())
  return () => {
    listeners.delete(listener)
  }
}

export function currentStatus(): VaultWriteStatus {
  return { pending: pending.size, flushing, lastError, lastFlushedAt }
}

function notify(): void {
  const status = currentStatus()
  for (const listener of listeners) listener(status)
}

/**
 * 挂起落盘。装载 vault、批量导入这类「整库替换」必须包起来，
 * 否则会把成千上万次中间态写进用户文件夹。
 */
export function withVaultSuppressed<T>(run: () => T): T {
  suppressed += 1
  try {
    return run()
  } finally {
    suppressed -= 1
  }
}

/** 异步版本；抛错也保证恢复计数 */
export async function withVaultSuppressedAsync<T>(run: () => Promise<T>): Promise<T> {
  suppressed += 1
  try {
    return await run()
  } finally {
    suppressed -= 1
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushVaultWrites()
  }, FLUSH_DELAY_MS)
}

function enqueue(table: VaultTableName, id: number): void {
  pending.set(entityKey(table, id), { table, id })
  notify()
  scheduleFlush()
}

/** 记一次写入意图；中间件之外的代码（如装载）也可直接调用 */
export function markVaultDirty(table: VaultTableName, id: number): void {
  if (getVaultSession() === null) return
  enqueue(table, id)
}

interface MutateRequestLike {
  type: string
  values?: unknown[]
  keys?: unknown[]
}

function noteMutation(tableName: string, req: MutateRequestLike): void {
  if (suppressed > 0) return
  if (getVaultSession() === null) return
  // clear() / 整表范围删除：一律不动文件（批量导入的 replace 走这条路）
  if (req.type === 'deleteRange') return
  if (!(tableName in KIND_BY_TABLE)) return

  const table = tableName as VaultTableName

  if (req.type === 'add' || req.type === 'put') {
    const values = req.values ?? []
    const keys = req.keys ?? []
    values.forEach((value, index) => {
      const fromKey = keys[index]
      const fromValue = (value as { id?: unknown }).id
      const id = typeof fromKey === 'number' ? fromKey : typeof fromValue === 'number' ? fromValue : undefined
      if (id !== undefined) enqueue(table, id)
    })
    return
  }

  for (const key of req.keys ?? []) {
    if (typeof key === 'number') enqueue(table, key)
  }
}

/**
 * 装载 Dexie 中间件（幂等）。必须在任何写入之前调用一次。
 *
 * DBCore 的写入入口是 `dbcore.table(name).mutate(req)`，所以覆写点在
 * `table()` 上（`mutate` 不在 DBCore 顶层）。这样所有写入路径都能拦到：
 * service 的 CRUD、批量导入、引用回写、回收站还原、拖拽排序、词条自动保存。
 */
export function installVaultPersist(): void {
  if (installed) return
  installed = true
  db.use({
    stack: 'dbcore',
    name: 'oc-vault-persist',
    level: 1,
    create: (down) => ({
      table: (name: string) => {
        const table = down.table(name)
        return {
          ...table,
          mutate: async (req: DBCoreMutateRequest) => {
            const result = await table.mutate(req)
            noteMutation(name, req as unknown as MutateRequestLike)
            return result
          },
        }
      },
    }),
  })
}

async function readRow(table: VaultTableName, id: number): Promise<Record<string, unknown> | undefined> {
  const row = await db.table(table).get(id)
  return row as Record<string, unknown> | undefined
}

/** 从 Dexie 现读全部实体，构造 id → 名字 的解析上下文（写回时要把 id 换回名字） */
async function buildSerializeContext(): Promise<SerializeContext> {
  const [characters, countries, events, worldEntries, tags] = await Promise.all([
    db.characters.toArray(),
    db.countries.toArray(),
    db.events.toArray(),
    db.worldEntries.toArray(),
    db.tags.toArray(),
  ])

  const characterById = new Map<number, string>(characters.map((item: Character) => [item.id, item.name]))
  const countryById = new Map<number, string>(countries.map((item: Country) => [item.id, item.name]))
  const eventById = new Map<number, string>(events.map((item: Event) => [item.id, item.title]))
  const worldById = new Map<number, string>(worldEntries.map((item: WorldEntry) => [item.id, item.title]))
  const tagById = new Map<number, string>(tags.map((item: Tag) => [item.id, item.name]))

  return {
    nameOf: (kind, id) => {
      switch (kind) {
        case 'character':
          return characterById.get(id)
        case 'country':
          return countryById.get(id)
        case 'event':
          return eventById.get(id)
        case 'worldEntry':
          return worldById.get(id)
        case 'tag':
          return tagById.get(id)
        default:
          return undefined
      }
    },
    tagName: (id) => tagById.get(id),
  }
}

/** 把更新表合并进 frontmatter 快照（写成功后用它更新基准） */
function mergeFrontmatter(
  current: Record<string, unknown>,
  updates: FrontmatterUpdates,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return next
}

/** 某类型既有笔记所在目录（用于给新文件挑目录） */
function foldersOfKind(session: NonNullable<ReturnType<typeof getVaultSession>>, kind: string): string[] {
  const folders: string[] = []
  for (const state of session.entries.values()) {
    if (state.kind !== kind) continue
    if (state.relPath === '') continue
    const slash = state.relPath.lastIndexOf('/')
    if (slash > 0) folders.push(state.relPath.slice(0, slash))
  }
  return folders
}

interface PlannedWrite {
  key: string
  table: VaultTableName
  id: number
  relPath: string
  content: string
  expectedMtimeMs?: number
  nextState: VaultEntryState
}

async function planTextWrite(
  table: VaultTableName,
  id: number,
  row: Record<string, unknown>,
  state: VaultEntryState | undefined,
  ctx: SerializeContext,
): Promise<PlannedWrite | null> {
  const session = getVaultSession()
  const kind = KIND_BY_TABLE[table]
  if (session === null || kind === null) return null

  const title = String(row.name ?? row.title ?? '')
  const isNew = state === undefined || state.relPath === ''

  let relPath = state?.relPath ?? ''
  if (isNew) {
    const hint =
      kind === 'character' && typeof row.countryId === 'number'
        ? ctx.nameOf('country', row.countryId)
        : undefined
    const folder = pickPreferredFolder(kind, foldersOfKind(session, kind), hint)
    relPath = allocateRelPath(kind, title, session.occupied, folder)
  }

  // 新文件必须写全字段（快照为 null），否则只会写出「变动过的键」
  const prevEntity = isNew ? null : (state?.entity ?? null)
  const prevFrontmatter = isNew ? {} : (state?.frontmatter ?? {})
  const prevBody = isNew ? '' : (state?.bodyMarkdown ?? '')

  const baseContent = state?.content ?? ''
  const updates = serializeEntity(
    kind,
    row,
    prevEntity,
    { entity: prevEntity, frontmatter: prevFrontmatter },
    ctx,
  )

  // 正文：判据是**文档**有没有变，不是正文文本有没有变。
  // 序列化器会规范化排版，拿文本比较等于「永远算变过」，会让没编辑过的笔记也被重写。
  const nowDocJson = JSON.stringify(documentOfEntity(kind, row) ?? null)
  const docChanged = isNew || nowDocJson !== (state?.bodyDoc ?? 'null')
  const body = docChanged
    ? serializeBody(kind, row, createLinkSerializer((targetKind, targetId) => ctx.nameOf(targetKind, targetId)))
    : null
  const bodyChanged = body !== null && body.markdown !== prevBody

  if (!isNew && Object.keys(updates).length === 0 && !bodyChanged) return null

  let content = setFrontmatterKeys(baseContent, updates)
  if (bodyChanged && body !== null) content = setBody(content, body.markdown)
  if (!isNew && content === baseContent) return null

  const nextState: VaultEntryState = {
    table,
    id,
    kind,
    relPath,
    content,
    mtimeMs: state?.mtimeMs ?? 0,
    entity: row,
    frontmatter: mergeFrontmatter(prevFrontmatter, updates),
    bodyMarkdown: bodyChanged && body !== null ? body.markdown : prevBody,
    bodyDoc: nowDocJson,
    trashed: state?.trashed ?? false,
  }

  return {
    key: entityKey(table, id),
    table,
    id,
    relPath,
    content,
    expectedMtimeMs: state !== undefined && state.mtimeMs > 0 ? state.mtimeMs : undefined,
    nextState,
  }
}

/** 把项目元信息写进标记文件（只在标记文件已存在时写，不替外来 vault 创建它） */
async function flushProjectMeta(
  row: Record<string, unknown>,
  report: VaultFlushReport,
): Promise<void> {
  const session = getVaultSession()
  if (session === null) return
  const marker = session.marker
  if (marker === null) return

  let parsed: Record<string, unknown> = {}
  try {
    const value: unknown = JSON.parse(marker.content)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>
    }
  } catch {
    report.errors.push({ relPath: marker.relPath, message: '标记文件不是合法 JSON，已跳过写入' })
    return
  }

  const project = {
    ...(typeof parsed.project === 'object' && parsed.project !== null ? parsed.project : {}),
    worldName: row.worldName,
    tagline: row.tagline,
    cover: row.coverUrl,
  }
  const next = { ...parsed, app: 'oc-studio', schemaVersion: 1, project }
  const content = `${JSON.stringify(next, null, 2)}\n`
  if (content === marker.content) return

  const results = await vaultFs.writeTexts(session.root, [
    { relPath: marker.relPath, content, expectedMtimeMs: undefined },
  ])
  const result = results[0]
  if (result !== undefined && !result.ok) {
    report.errors.push({ relPath: marker.relPath, message: result.error ?? '写入失败' })
    return
  }
  session.marker = { relPath: marker.relPath, content }
  report.written += 1
}

/**
 * 标签改名后，把引用它的实体全部排进队列。
 * 下一次 flush 会用新名字重写它们的 frontmatter `tags` 数组 ——
 * 否则磁盘上会同时存在新旧两个标签名。
 */
async function enqueueTagReferences(tagId: number): Promise<void> {
  const tables: VaultTableName[] = ['characters', 'events', 'countries', 'worldEntries']
  for (const table of tables) {
    const rows = (await db.table(table).toArray()) as { id?: unknown; tags?: unknown }[]
    for (const row of rows) {
      if (!Array.isArray(row.tags) || !row.tags.includes(tagId)) continue
      if (typeof row.id === 'number') pending.set(entityKey(table, row.id), { table, id: row.id })
    }
  }
  notify()
}

/** 写 .ocstudio/tags.json（标签颜色/分类） */
async function flushTagMeta(report: VaultFlushReport): Promise<void> {
  const session = getVaultSession()
  if (session === null || !session.tagMeta.dirty) return

  const content = serializeTagMeta(session.tagMeta.entries)
  session.tagMeta.dirty = false
  if (content === session.tagMeta.content) return

  try {
    await vaultFs.mkdir(session.root, '.ocstudio')
  } catch {
    // 目录已存在
  }

  const results = await vaultFs.writeTexts(session.root, [
    { relPath: session.tagMeta.relPath, content },
  ])
  const result = results[0]
  if (result !== undefined && !result.ok) {
    report.errors.push({ relPath: session.tagMeta.relPath, message: result.error ?? '写入失败' })
    session.tagMeta.dirty = true
    return
  }
  session.tagMeta.content = content
  report.written += 1
}

/**
 * 把队列里的脏实体写回磁盘。
 * 串行执行（flushing 门闩）：同一时刻只允许一轮，避免两次 flush 交叉写同一文件。
 */
export async function flushVaultWrites(): Promise<VaultFlushReport> {
  const report: VaultFlushReport = {
    written: 0,
    movedToTrash: 0,
    restored: 0,
    removed: 0,
    conflicts: [],
    errors: [],
  }

  const session = getVaultSession()
  if (session === null || flushing || pending.size === 0) return report

  flushing = true
  notify()

  try {
    const batch = [...pending.values()]
    pending = new Map()
    const ctx = await buildSerializeContext()

    const texts: VaultWriteEntry[] = []
    const planned: PlannedWrite[] = []
    const moves: { from: string; to: string; kind: 'trash' | 'restore' }[] = []
    const removals: string[] = []

    for (const item of batch) {
      const kind = KIND_BY_TABLE[item.table]
      const key = entityKey(item.table, item.id)
      const state = session.entries.get(key)
      const row = await readRow(item.table, item.id)

      // 项目元信息是单例特例
      if (kind === null) {
        if (row !== undefined) await flushProjectMeta(row, report)
        continue
      }

      // 标签：名字写在各实体的 frontmatter 里，颜色/分类是 app 侧元数据。
      // 没有独立文件的标签**不建文件**（一个 187 标签的 vault 会撒出 187 个碎文件），
      // 元数据统一进 .ocstudio/tags.json。
      if (kind === 'tag' && (state === undefined || state.relPath === '')) {
        const before = state === undefined ? null : String((state.entity as Tag).name ?? '')
        if (row === undefined) {
          if (before !== null) session.tagMeta.entries.delete(before)
          session.tagMeta.dirty = true
          session.entries.delete(key)
          continue
        }
        const nextName = String(row.name ?? '')
        if (before !== null && before !== nextName && nextName !== '') {
          session.tagMeta.entries.delete(before)
          // 标签改名要改写**所有引用它的实体**的 frontmatter，否则磁盘上会同时出现新旧两个名字
          await enqueueTagReferences(item.id)
        }
        if (nextName !== '') {
          session.tagMeta.entries.set(nextName, {
            color: String(row.color ?? ''),
            category: String(row.category ?? ''),
          })
        }
        session.tagMeta.dirty = true
        continue
      }

      // 行没了 = 被彻底删除（或整表被换掉）。只回收站里的文件才真删。
      if (row === undefined) {
        if (state === undefined) continue
        if (state.trashed) {
          removals.push(state.relPath)
        } else if (state.relPath !== '') {
          moves.push({ from: state.relPath, to: trashRelPath(state.relPath), kind: 'trash' })
        }
        session.entries.delete(key)
        session.byPath.delete(state.relPath)
        session.occupied.delete(state.relPath)
        continue
      }

      const nowTrashed = row.deleted === true
      const wasTrashed = state?.trashed === true

      if (nowTrashed && !wasTrashed && state !== undefined && state.relPath !== '') {
        const target = trashRelPath(state.relPath)
        moves.push({ from: state.relPath, to: target, kind: 'trash' })
        state.trashed = true
        state.entity = row
        session.byPath.delete(state.relPath)
        session.byPath.set(target, key)
        session.occupied.delete(state.relPath)
        session.occupied.add(target)
        state.relPath = target
        continue
      }

      if (!nowTrashed && wasTrashed && state !== undefined) {
        const restored = originalRelPathFromTrash(state.relPath)
        if (restored !== null) {
          moves.push({ from: state.relPath, to: restored, kind: 'restore' })
          session.byPath.delete(state.relPath)
          session.byPath.set(restored, key)
          session.occupied.delete(state.relPath)
          session.occupied.add(restored)
          state.relPath = restored
          state.trashed = false
        }
      }

      if (nowTrashed) {
        // 仍在回收站：只更新内存基准，不去改回收站里的文件
        if (state !== undefined) state.entity = row
        continue
      }

      const write = await planTextWrite(item.table, item.id, row, state, ctx)
      if (write === null) continue
      texts.push({
        relPath: write.relPath,
        content: write.content,
        expectedMtimeMs: write.expectedMtimeMs,
      })
      planned.push(write)
    }

    // 移动与删除先做：它们会改变后续路径占用
    for (const move of moves) {
      try {
        await vaultFs.move(session.root, move.from, move.to)
        if (move.kind === 'trash') report.movedToTrash += 1
        else report.restored += 1
      } catch (err) {
        report.errors.push({ relPath: move.from, message: err instanceof Error ? err.message : String(err) })
      }
    }

    for (const target of removals) {
      try {
        await vaultFs.remove(session.root, target)
        report.removed += 1
      } catch (err) {
        report.errors.push({ relPath: target, message: err instanceof Error ? err.message : String(err) })
      }
    }

    if (texts.length > 0) {
      const results = await vaultFs.writeTexts(session.root, texts)
      results.forEach((result, index) => {
        const write = planned[index]
        if (write === undefined) return
        if (result.ok) {
          report.written += 1
          write.nextState.mtimeMs = result.mtimeMs ?? 0
          session.entries.set(write.key, write.nextState)
          session.byPath.set(write.relPath, write.key)
          session.occupied.add(write.relPath)
          return
        }
        if (result.conflict) {
          // 磁盘上被外部改过：**不覆盖**，把这一项重新排进队列，
          // 让 UI 有机会提示「用磁盘版本 / 覆盖磁盘」
          report.conflicts.push(result.relPath)
          pending.set(write.key, { table: write.table, id: write.id })
          return
        }
        report.errors.push({ relPath: result.relPath, message: result.error ?? '写入失败' })
      })
    }

    await flushTagMeta(report)

    lastFlushedAt = Date.now()
    lastError =
      report.errors.length > 0
        ? report.errors[0].message
        : report.conflicts.length > 0
          ? `${report.conflicts.length} 个文件在磁盘上被外部修改，已跳过未覆盖`
          : null
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    report.errors.push({ relPath: '', message: lastError })
  } finally {
    flushing = false
    notify()
    // 本轮产生的后续工作（标签改名带来的引用改写、冲突重排）不能就此搁置
    if (pending.size > 0 && flushTimer === null) scheduleFlush()
  }

  return report
}

/** 切 vault / 关窗之前调用：把队列排干 */
export async function drainVaultWrites(): Promise<VaultFlushReport> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  return flushVaultWrites()
}

/** 会话结束时清空队列状态 */
export function resetVaultWriteState(): void {
  pending = new Map()
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  lastError = null
  lastFlushedAt = null
  notify()
}

/** 供冲突处理用：放弃本地版本，改为采纳磁盘版本 */
export function discardConflict(relPath: string): void {
  const session = getVaultSession()
  if (session === null) return
  const key = session.byPath.get(normalizeRelPath(relPath))
  if (key === undefined) return
  session.entries.delete(key)
  pending.delete(key)
  notify()
}
