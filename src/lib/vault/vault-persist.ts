import Dexie, { type DBCoreMutateRequest } from 'dexie'

import { db } from '@/lib/db'
import { setBody, setFrontmatterKeys } from './frontmatter'
import { appendJournal, type JournalActor, type JournalDraft } from './journal'
import { actorOfTransaction } from './actor'
import { serializeEntity, type FrontmatterUpdates, type SerializeContext } from './serialize'
import {
  allocateRelPath,
  DEFAULT_FOLDER,
  foldersOfKind,
  isInternalFolder,
  isInternalRelPath,
  isRelPathOccupied,
  novelChapterFileTitle,
  normalizeRelPath,
  originalRelPathFromTrash,
  pickPreferredFolder,
  trashRelPath,
} from './vault-paths'
import {
  entityKey,
  getVaultSession,
  KIND_BY_TABLE,
  TAG_META_REL_PATH,
  type VaultEntryState,
  type VaultSession,
  type VaultTableName,
} from './vault-session'
import { vaultFs, type VaultWriteEntry } from './vault-fs'
import { serializeTagMeta } from './vault-tags'
import { createLinkSerializer, documentOfEntity, serializeBody } from './markdown-bridge'
import { fileBaseOfRelPath } from './reference-paths'
import type { VaultEntityKind, VaultStorableKind } from './types'
import type { Character, Country, Event, Tag, WorldEntry } from '@/types'
import { NOVEL_CATEGORY } from '@/lib/novel'

// ── 落盘队列 ────────────────────────────────────────────────────────────
// 「文件是真源」的写半边。设计要点：
//
// 1. **挂在 Dexie 中间件上，而不是逐个改 service。**
//    `db.use({stack:'dbcore'})` 拦的是所有写入路径：service 的 CRUD、
//    批量导入、引用回写、回收站还原、拖拽排序、词条自动保存 —— 一处接线全覆蓋。
//    中间件拿到的 keys 是**已解析完成**的：显式 id 在 request 上，
//    自增主键只有 response 的 results 里才有 —— 两处都要看（见 noteMutation）。
//
// 2. **只在事务外做 IO。** 中间件里只记「(表, id) 脏了」，真正的读行/序列化/写文件
//    都在防抖之后的异步 flush 里做，避免在 Dexie 事务里做文件 IO（事务可能回滚）。
//
// 3. **绝不静默删除文件。** deleteRange（`clear()`）一律忽略 —— 批量导入的
//    `replace` 策略会 clear 全表，若照做就会把整个 vault 的文件删光。
//    单个删除只走「移入回收站」，真正删除文件仅发生在「回收站里彻底删除」时。

const FLUSH_DELAY_MS = 350

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface PendingWrite {
  table: VaultTableName
  id: number
  /** **入队时**记下的身份；落盘时再取就晚了（中途可能换了作用域） */
  actor: JournalActor
  /**
   * 修订号：同一个 (表, id) 每被改一次就 +1。
   *
   * 队列里只留最新一版；失败回填时也必须带上修订号 —— 否则「旧的失败任务」
   * 会把 flush 期间用户新改的那一版顶掉，重试时写回旧内容（F02）。
   */
  revision: number
}

export interface VaultFlushAttempt {
  relPath: string
  outcome: 'conflict' | 'error'
  message: string
}

export interface VaultFlushReport {
  written: number
  movedToTrash: number
  restored: number
  removed: number
  /** **最终未解决**的冲突；已成功覆盖 / 重试成功的同条路径会被剔除 */
  conflicts: string[]
  /** **最终未解决**的错误；成功重试后不再出现 */
  errors: { relPath: string; message: string }[]
  /**
   * 本次调用里确认成功的路径。drain 用它把先前几轮的同类失败从最终回执里剔除
   * （尝试历史仍保留在 `attempts`）。
   */
  resolvedPaths?: string[]
  /** 尝试历史（只增不减）：哪条先冲突 / 失败、后来是否解决，供诊断与界面展开 */
  attempts?: VaultFlushAttempt[]
}

export interface VaultWriteStatus {
  pending: number
  flushing: boolean
  /** 队列里有「已尝试过、等用户重试」的条目（不会自动重试） */
  failed: number
  lastError: string | null
  lastFlushedAt: number | null
}

export interface FlushVaultWritesOptions {
  overwriteConflicts?: boolean
  /**
   * 只处理这些队列键（`表:id`）。drain 用它把「本轮尝试过的修订」限定住，
   * 避免反复重试同一个失败条目；普通 flush 不传 = 处理整条队列。
   */
  keys?: ReadonlySet<string>
}

function emptyFlushReport(): VaultFlushReport {
  return {
    written: 0,
    movedToTrash: 0,
    restored: 0,
    removed: 0,
    conflicts: [],
    errors: [],
    resolvedPaths: [],
    attempts: [],
  }
}

let installed = false
let pending = new Map<string, PendingWrite>()
let flushing = false
/** 本轮 flush 的开始时间（看门狗用） */
let flushingSince = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
/**
 * 正在跑的那一轮 flush 的完成信号。drain 必须等它结束再判断「还剩下什么」，
 * 不能像以前那样在 flushing 时直接返回一份空报告（F03/R02）。
 */
let activeFlush: ActiveFlush | null = null
/**
 * 队列代次：换库 / 关库时 +1。在途 flush 完成后只有代次仍相同才允许回填队列、
 * 改会话状态 —— 旧库的写结果不能污染新库（F03 / 需求 7）。
 */
let queueGeneration = 0
let nextRevision = 1
/**
 * 因为「磁盘上被外部改过」而停在队列里的条目。
 *
 * 它们**不自动重试**：基准 mtime 没变，每 350ms 撞一次必然还是同一个冲突，
 * 白烧 CPU、状态栏永远转圈，而用户得到的提示只有一句「已跳过未覆盖」。
 * 用户再改一次（`enqueue`）或明确选择「覆盖磁盘」（`overwriteConflicts`）时才重新排队。
 */
const conflictedKeys = new Set<string>()
/**
 * 普通失败（磁盘满、权限、IPC 拒绝、部分成功里失败的那几条）：任务留在队列里，
 * 但**不自动重试** —— 不然每 350ms 撞一次同一个错，日志和状态栏都不堪其扰。
 * 下一次显式 drain（重试 / 关窗 / 换库）或用户再改一次才重新尝试。
 */
const failedKeys = new Set<string>()
/**
 * 新实体在**计划阶段**就预留的路径。
 *
 * F01 的根因：`allocateRelPath` 只在整批写成功后才会进入 `occupied`，
 * 同批两个同名新行因此拿到同一个路径。现在分配后立即写 `occupied`，
 * 并把路径按实体记住：写失败重试时继续用同一条，不再换名产生重复文件。
 */
const reservedPaths = new Map<string, string>()
let watchdog: ReturnType<typeof setInterval> | null = null
let lastError: string | null = null
let lastFlushedAt: number | null = null
/**
 * tags.json 上一次写失败：挡住**自动 flush** 的反复重试（磁盘满 / 权限问题时
 * 每 350ms 撞一次同一个错）。显式 drain（重试 / 关窗 / 换库）仍会再试。
 */
let tagMetaFailed = false

const listeners = new Set<(status: VaultWriteStatus) => void>()

export function subscribeVaultWriteStatus(listener: (status: VaultWriteStatus) => void): () => void {
  listeners.add(listener)
  listener(currentStatus())
  return () => {
    listeners.delete(listener)
  }
}

export function currentStatus(): VaultWriteStatus {
  return {
    pending: pending.size,
    flushing,
    failed: failedKeys.size,
    lastError,
    lastFlushedAt,
  }
}

function notify(): void {
  const status = currentStatus()
  for (const listener of listeners) listener(status)
}

/**
 * 兼容旧调用点的**空操作**。
 *
 * 以前它是全局「暂不入队」计数；助手 create 包着模板 / 正文骨架的异步准备，
 * 期间并发的人工自动保存也被一起吞掉（Q07）。现在整库替换改用
 * `applyDataset` 排除自身替换事务，助手 create 改绑具体写事务，
 * 不再需要任何跨 await 的全局暂停。
 *
 * @deprecated 不要再用它包异步准备；要绑身份请用 `actor.writeAsActor`。
 */
export function withVaultSuppressed<T>(run: () => T): T {
  return run()
}

/** 异步版本；同样只执行、不改变队列（见上）。 */
export async function withVaultSuppressedAsync<T>(run: () => Promise<T>): Promise<T> {
  return run()
}

function scheduleFlush(): void {
  if (flushTimer !== null) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushVaultWrites()
  }, FLUSH_DELAY_MS)
}

/**
 * IPC 超时兜底。
 *
 * Rust 侧的命令正常情况下要么成功要么报错，但一旦某个 `invoke` 真的不返回
 * （文件被别的程序锁住、阻塞线程池被占满…），`flushing` 会永远为真，
 * 状态栏就一直是「保存中…」—— 用户看到的是无限转圈。
 * 超时后当错误处理：本轮中止、错误上屏、队列留着等「重试保存」。
 */
const WRITE_TIMEOUT_MS = 20_000

function withTimeout<T>(task: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[vault] 写盘超时（${WRITE_TIMEOUT_MS / 1000}s）：${label}`)
      reject(new Error(`${label}超时`))
    }, WRITE_TIMEOUT_MS)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

function enqueue(table: VaultTableName, id: number, actor: JournalActor = 'human'): void {
  // 同一个 (表, id) 在 flush 之前被改了两次：**后写的身份说了算**。
  // 用户改完助手又改，时间线上就该记助手 —— 那才是盘上这一版的来处。
  const key = entityKey(table, id)
  pending.set(key, { table, id, actor, revision: nextRevision++ })
  // 又改了：说明用户还想保存，重新给它自动重试的机会（见 conflictedKeys / failedKeys）
  conflictedKeys.delete(key)
  failedKeys.delete(key)
  notify()
  scheduleFlush()
}

/**
 * 队列内部产生的写意图（标签改名要回写的引用实体、冲突重排）。
 *
 * 和 `enqueue` 的区别：**不替用户撤销冲突标记** —— 磁盘上那份文件仍是新的，
 * 换个名字重写一遍标签也不该悄悄覆盖它。新修订会清掉失败标记（值得再试一次）。
 */
function queueDeferred(table: VaultTableName, id: number, actor: JournalActor): void {
  const key = entityKey(table, id)
  pending.set(key, { table, id, actor, revision: nextRevision++ })
  failedKeys.delete(key)
  notify()
}

/**
 * 失败 / 冲突回填：只有当前队列里没有**更新**的修订时才写回去。
 * 返回是否真的回填了（false = 用户已经改出了新版本，旧任务作废）。
 */
function requeueUnconfirmed(item: PendingWrite, failed: boolean): boolean {
  const key = entityKey(item.table, item.id)
  const current = pending.get(key)
  if (current !== undefined && current.revision > item.revision) {
    // 新修订在 flush 期间进了队列：旧任务的结果不能覆盖它，也不能把「失败」
    // 记到它头上 —— 新修订还没尝试过。
    return false
  }
  pending.set(key, item)
  if (failed) failedKeys.add(key)
  else failedKeys.delete(key)
  notify()
  return true
}

/** 记一次写入意图；中间件之外的代码（如装载）也可直接调用 */
export function markVaultDirty(table: VaultTableName, id: number, actor: JournalActor = 'human'): void {
  if (getVaultSession() === null) return
  enqueue(table, id, actor)
}

/**
 * 给**已经发生**的实体写入补记身份。
 *
 * @deprecated 生产写入不要再用：身份应当在**实际写事务**上绑定
 * （`actor.writeAsActor` / `runAsActorTransaction`），拿到 id 之后再按 id 改队列
 * 会误伤同一实体在这期间产生的**新修订**（Q07）。保留它只为旧脚本与既有测试；
 * 助手 create 已改为在 service 的 `db.add` 事务上绑身份，不再调用这里。
 *
 * 只改队列里的身份，不新增一版内容；若那一版已经 flush 完，重新入队一次也无害
 * （序列化发现没改动就不写文件）。
 */
export function stampVaultWriteActor(
  table: VaultTableName,
  id: number,
  actor: JournalActor,
): void {
  if (getVaultSession() === null) return
  const key = entityKey(table, id)
  const current = pending.get(key)
  pending.set(key, {
    table,
    id,
    actor,
    revision: current?.revision ?? nextRevision++,
  })
  failedKeys.delete(key)
  notify()
  scheduleFlush()
}

interface MutateRequestLike {
  type: string
  values?: unknown[]
  keys?: unknown[]
}

interface MutateResponseLike {
  /** add / put 的**生成主键**（自增表在 request 上拿不到，只有 response 里有） */
  results?: unknown[]
}

/** 从任意形态里抠出一个数字主键（response 可能是 key，也可能是整行） */
function asId(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (value !== null && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return undefined
}

function noteMutation(
  tableName: string,
  req: MutateRequestLike,
  res: MutateResponseLike | undefined,
  actor: JournalActor,
): void {
  if (getVaultSession() === null) return
  // clear() / 整表范围删除：一律不动文件（批量导入的 replace 走这条路）
  if (req.type === 'deleteRange') return
  if (!(tableName in KIND_BY_TABLE)) return

  const table = tableName as VaultTableName

  if (req.type === 'add' || req.type === 'put') {
    const values = req.values ?? []
    const requestKeys = req.keys ?? []
    const responseKeys = res?.results ?? []
    values.forEach((value, index) => {
      // 顺序有讲究：显式 id > request keys > **response 里的自增主键**
      // 最后一项最容易漏 —— 不带 id 的 add / bulkAdd 在 request 上是没有 key 的，
      // 漏了它，新建的实体与「保留两者」导入的行就只在 Dexie 里活着、永不落盘。
      const id = asId((value as { id?: unknown }).id) ?? asId(requestKeys[index]) ?? asId(responseKeys[index])
      if (id !== undefined) enqueue(table, id, actor)
    })
    return
  }

  for (const key of req.keys ?? []) {
    const id = asId(key)
    if (id !== undefined) enqueue(table, id, actor)
  }
}

const loadTransactions = new WeakSet<object>()

/** Exclude only the dataset replacement transaction, including its nested writes. */
export function excludeVaultLoadTransaction(transaction: object | undefined): () => void {
  if (transaction === undefined) return () => {}
  loadTransactions.add(transaction)
  return () => { loadTransactions.delete(transaction) }
}

function isVaultLoadTransaction(transaction: unknown): boolean {
  let current = transaction
  const visited = new Set<object>()
  while (current !== null && typeof current === 'object' && !visited.has(current)) {
    if (loadTransactions.has(current)) return true
    visited.add(current)
    current = (current as { parent?: unknown }).parent
  }
  return false
}

/** Install the dbcore mutation entry point once, before any writes. */
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
            /*
             * 身份在**进入中间件这一刻**从事务上取，而不是 `await` 完之后再
             * 看「当前是谁」：Dexie 的当前事务是 promise-zone 感知的，人工写入
             * 与助手事务交错时各拿各的。`await table.mutate()` 期间就算别的
             * 作用域开始 / 结束，也不会改掉这条写入的身份（F14）。
             */
            const actor = actorOfTransaction(Dexie.currentTransaction)
            const persist = !isVaultLoadTransaction(Dexie.currentTransaction)
            const result = await table.mutate(req)
            if (persist) noteMutation(
              name,
              req as unknown as MutateRequestLike,
              result as unknown as MutateResponseLike,
              actor,
            )
            return result
          },
        }
      },
    }),
  })
  startWatchdog()
}

/**
 * 看门狗：`flushing` 卡住时兜底复位。
 *
 * 单次 IPC 已有 `withTimeout`，但整轮 flush 还可能卡在别处（Dexie 读被长事务挡住等）。
 * 这里只做一件事：卡太久就把门闩放开、把错误摆到界面上 —— 宁可报错，也不能让
 * 状态栏永远转圈。
 */
function startWatchdog(): void {
  if (watchdog !== null) return
  watchdog = setInterval(() => {
    if (!flushing || flushingSince === 0) return
    if (Date.now() - flushingSince < WRITE_TIMEOUT_MS + 10_000) return
    console.warn('[vault] 落盘队列卡住，复位门闩')
    flushing = false
    flushingSince = 0
    lastError = '写盘超时，已中止本轮保存'
    notify()
  }, 5_000)
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

/** 实体类型 → 表名（只为回查「这条引用在磁盘上叫什么文件」） */
const TABLE_BY_KIND: Record<VaultStorableKind, VaultTableName> = {
  character: 'characters',
  event: 'events',
  country: 'countries',
  worldEntry: 'worldEntries',
  tag: 'tags',
  period: 'periods',
}

/**
 * 目标实体在磁盘上的文件名（去掉 `.md`），取不到时返回 undefined。
 *
 * 写 `[[ ]]` 用它当目标、标题当别名 —— 词条文件常带 `00.` / `02.` 这类用户自己的排序前缀，
 * 只写标题的话 Obsidian 解析不到（本应用靠 scan 的宽容键能认，Obsidian 不能）。
 */
function fileBaseOf(kind: VaultEntityKind, id: number): string | undefined {
  const table = TABLE_BY_KIND[kind as VaultStorableKind]
  if (table === undefined) return undefined
  const reserved = reservedPaths.get(entityKey(table, id))
  if (reserved !== undefined) return fileBaseOfRelPath(reserved)
  const state = getVaultSession()?.entries.get(entityKey(table, id))
  if (state === undefined || state.relPath === '') return undefined
  const name = state.relPath.slice(state.relPath.lastIndexOf('/') + 1)
  return name.replace(/\.md$/i, '')
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

/** 实体的展示名（角色/国家/标签/时期用 name，其余用 title）—— 时间线里要用 */
function titleOfRow(table: VaultTableName, entity: unknown): string {
  const record = (entity ?? {}) as Record<string, unknown>
  const name = record.name
  const title = record.title
  if (typeof name === 'string' && name.trim() !== '') return name
  if (typeof title === 'string' && title.trim() !== '') return title
  void table
  return ''
}

/** 相对路径所在目录；根目录下的文件返回空串 */
function folderOfRelPath(relPath: string): string {
  const normalized = normalizeRelPath(relPath)
  const slash = normalized.lastIndexOf('/')
  return slash > 0 ? normalized.slice(0, slash) : ''
}

interface PlannedWrite {
  key: string
  table: VaultTableName
  id: number
  relPath: string
  content: string
  expectedMtimeMs?: number
  nextState: VaultEntryState
  /** 时间线用：实体标题、这次改到的键、写之前的原文（算上一版哈希）、是不是新建 */
  title: string
  changedKeys: string[]
  prevContent: string
  isNew: boolean
  /** 排队时的修订号（失败回填时不能压掉更新的修订） */
  revision: number
  /** 时间线用：这一版是谁写的 */
  actor: JournalActor
}

function reserveTextPath(
  table: VaultTableName,
  id: number,
  row: Record<string, unknown>,
  state: VaultEntryState | undefined,
  ctx: SerializeContext,
): string | null {
  const session = getVaultSession()
  const kind = KIND_BY_TABLE[table]
  if (session === null || kind === null) return null

  const title = String(row.name ?? row.title ?? '')
  const isNew = state === undefined || state.relPath === ''

  let relPath = state?.relPath ?? ''
  if (isNew) {
    const key = entityKey(table, id)
    const reserved = reservedPaths.get(key)
    if (reserved !== undefined) {
      // 这条新实体在上一轮已经分配过路径（写失败 / IPC 拒绝）：继续用同一条。
      // 否则每次重试都会因为「上次的路径已经预留」而拿到一个新名字，磁盘上留下半套副本。
      relPath = reserved
      session.occupied.add(relPath)
    } else {
      const isNovel = kind === 'worldEntry' && row.category === NOVEL_CATEGORY
      let folder: string
      let fileName = title
      if (isNovel) {
        // 小说 = 一套笔记：新库统一落 `小说/`，老库沿用已有**活着的**小说文件所在目录。
        // 回收站 / 软删除 / `.ocstudio` 里的旧小说都不能参与推断（F12）：
        // 否则「所有旧小说都进了回收站」时新书会落到 `.ocstudio/` 根下，重开就消失。
        let novelFolder = ''
        // 章节优先跟随它所属作品的目录 —— 不同目录可以有多部作品
        const parentId = typeof row.parentId === 'number' ? row.parentId : null
        if (parentId !== null) {
          const parentState = session.entries.get(entityKey('worldEntries', parentId))
          if (parentState !== undefined && !parentState.trashed && !isInternalRelPath(parentState.relPath)) {
            novelFolder = folderOfRelPath(parentState.relPath)
          }
        }
        let chapterNumber = 1
        for (const previous of session.entries.values()) {
          if (previous.table !== 'worldEntries' || previous.trashed) continue
          const entity = previous.entity as WorldEntry | null
          if (!entity || entity.deleted === true || entity.category !== NOVEL_CATEGORY) continue
          const previousPath = normalizeRelPath(previous.relPath)
          if (previousPath === '' || isInternalRelPath(previousPath)) continue
          if (novelFolder === '') novelFolder = folderOfRelPath(previousPath)
          if (
            parentId !== null &&
            entity.parentId === parentId &&
            entity.id !== id &&
            (entity.order ?? 0) < (typeof row.order === 'number' ? row.order : 0)
          ) {
            chapterNumber += 1
          }
        }
        folder = novelFolder !== '' && !isInternalFolder(novelFolder) ? novelFolder : '小说'
        if (parentId !== null) fileName = novelChapterFileTitle(title, chapterNumber)
      } else {
        const hint =
          kind === 'character' && typeof row.countryId === 'number'
            ? ctx.nameOf('country', row.countryId)
            : undefined
        folder = pickPreferredFolder(kind, foldersOfKind(session.entries.values(), kind), hint)
        if (isInternalFolder(folder)) folder = DEFAULT_FOLDER[kind]
      }
      relPath = allocateRelPath(kind, title, session.occupied, folder, fileName)
      // **计划阶段立即预留**：同一批里第二个同名新行必须看见第一个已经占用的路径（F01）。
      reservedPaths.set(key, relPath)
      session.occupied.add(relPath)
    }
  }

  return relPath
}

async function planTextWrite(
  table: VaultTableName,
  id: number,
  row: Record<string, unknown>,
  state: VaultEntryState | undefined,
  ctx: SerializeContext,
  actor: JournalActor,
  revision: number,
): Promise<PlannedWrite | null> {
  const kind = KIND_BY_TABLE[table]
  const relPath = reserveTextPath(table, id, row, state, ctx)
  if (kind === null || relPath === null) return null
  const title = String(row.name ?? row.title ?? '')
  const isNew = state === undefined || state.relPath === ''

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
    ? serializeBody(
        kind,
        row,
        createLinkSerializer(
          (targetKind, targetId) => ctx.nameOf(targetKind, targetId),
          fileBaseOf,
        ),
      )
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
    title,
    // `undefined` 在 frontmatter 里表示「删掉这个键」，不是一次改动：
    // 新建时的空 `parent` 以前会混进 keys，读时间线的人会以为改过层级。
    changedKeys: [
      ...Object.keys(updates).filter((key) => updates[key] !== undefined),
      ...(bodyChanged ? ['body'] : []),
    ],
    prevContent: baseContent,
    isNew,
    revision,
    actor,
  }
}

/** 把项目元信息写进标记文件（只在标记文件已存在时写，不替外来 vault 创建它）
 *
 * 返回 `true` = 这一版已经确认（写成功 / 本来就不需要写 / 没有标记文件）；
 * `false` = **未确认**，调用方必须把任务留在队列里重试（Q06）。
 */
async function flushProjectMeta(
  row: Record<string, unknown>,
  report: VaultFlushReport,
): Promise<boolean> {
  const session = getVaultSession()
  if (session === null) return false
  const marker = session.marker
  if (marker === null) return true

  let parsed: Record<string, unknown> = {}
  try {
    const value: unknown = JSON.parse(marker.content)
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      parsed = value as Record<string, unknown>
    }
  } catch {
    report.errors.push({ relPath: marker.relPath, message: '标记文件不是合法 JSON，已跳过写入' })
    return false
  }

  const project = {
    ...(typeof parsed.project === 'object' && parsed.project !== null ? parsed.project : {}),
    worldName: row.worldName,
    tagline: row.tagline,
    cover: row.coverUrl,
  }
  const next = { ...parsed, app: 'oc-studio', schemaVersion: 1, project }
  const content = `${JSON.stringify(next, null, 2)}\n`
  if (content === marker.content) return true

  const results = await withTimeout(
    vaultFs.writeTexts(session.root, [
      { relPath: marker.relPath, content, expectedMtimeMs: undefined },
    ]),
    '写入 oc-studio.json',
  )
  const result = results[0]
  if (result === undefined) {
    report.errors.push({ relPath: marker.relPath, message: '写盘回执缺失' })
    return false
  }
  if (!result.ok) {
    report.errors.push({ relPath: marker.relPath, message: result.error ?? '写入失败' })
    return false
  }
  session.marker = { relPath: marker.relPath, content }
  report.written += 1
  report.resolvedPaths?.push(marker.relPath)
  return true
}

/**
 * 标签改名后，把引用它的实体全部排进队列。
 * 下一次 flush 会用新名字重写它们的 frontmatter `tags` 数组 ——
 * 否则磁盘上会同时存在新旧两个标签名。
 */
async function enqueueTagReferences(
  tagId: number,
  actor: JournalActor,
  guard?: { session: VaultSession; generation: number },
): Promise<void> {
  const tables: VaultTableName[] = ['characters', 'events', 'countries', 'worldEntries']
  for (const table of tables) {
    const rows = (await db.table(table).toArray()) as { id?: unknown; tags?: unknown }[]
    // 读表期间换了库：旧库的引用不能排进新库的队列
    if (guard !== undefined && !isCurrentQueue(guard.session, guard.generation)) return
    for (const row of rows) {
      if (!Array.isArray(row.tags) || !row.tags.includes(tagId)) continue
      // 标签改名是**引用回写**，不是用户直接编辑某一条：身份跟着**发起改名的
      // 那条标签任务**走（入队时已经存下 actor）。这里再读 currentActor 会晚 ——
      // flush 已经离开发起命令的调用栈（F14）。
      if (typeof row.id === 'number') queueDeferred(table, row.id, actor)
    }
  }
}

/** 写 .ocstudio/tags.json（标签颜色/分类） */
async function flushTagMeta(report: VaultFlushReport): Promise<void> {
  const session = getVaultSession()
  if (session === null || !session.tagMeta.dirty) return

  const content = serializeTagMeta(session.tagMeta.entries)
  session.tagMeta.dirty = false
  if (content === session.tagMeta.content) {
    tagMetaFailed = false
    return
  }

  try {
    await withTimeout(vaultFs.mkdir(session.root, '.ocstudio'), '创建 .ocstudio')
  } catch {
    // 目录已存在
  }

  try {
    const results = await withTimeout(
      vaultFs.writeTexts(session.root, [{ relPath: session.tagMeta.relPath, content }]),
      '写入 tags.json',
    )
    const result = results[0]
    if (result === undefined) {
      report.errors.push({ relPath: session.tagMeta.relPath, message: '写盘回执缺失' })
      session.tagMeta.dirty = true
      tagMetaFailed = true
      return
    }
    if (!result.ok) {
      report.errors.push({ relPath: session.tagMeta.relPath, message: result.error ?? '写入失败' })
      // 写失败要把 dirty 放回去，否则这批标签改动就再也不会被写
      session.tagMeta.dirty = true
      tagMetaFailed = true
      return
    }
  } catch (err) {
    // IPC 超时 / 抛错同样要放回 dirty：以前这里漏了，tag 改动会静默丢掉
    session.tagMeta.dirty = true
    tagMetaFailed = true
    throw err
  }
  session.tagMeta.content = content
  tagMetaFailed = false
  report.written += 1
  report.resolvedPaths?.push(session.tagMeta.relPath)
}

/** 在途 flush 的完成句柄（drain 等它；换库后旧的句柄不再影响新会话） */
interface ActiveFlush {
  promise: Promise<VaultFlushReport>
  settle: (report: VaultFlushReport) => void
}

function isCurrentQueue(session: VaultSession, generation: number): boolean {
  return getVaultSession() === session && queueGeneration === generation
}

function pendingFromWrite(write: PlannedWrite): PendingWrite {
  return {
    table: write.table,
    id: write.id,
    actor: write.actor,
    revision: write.revision,
  }
}

/**
 * 把队列里的脏实体写回磁盘。
 * 串行执行（flushing 门闩）：同一时刻只允许一轮，避免两次 flush 交叉写同一文件。
 */
export async function flushVaultWrites(options?: FlushVaultWritesOptions): Promise<VaultFlushReport> {
  const report = emptyFlushReport()

  const session = getVaultSession()
  if (session === null || flushing) {
    return report
  }
  if (pending.size === 0 && !session.tagMeta.dirty) {
    return report
  }

  flushing = true
  flushingSince = Date.now()
  const generation = queueGeneration
  let settle: (value: VaultFlushReport) => void = () => {}
  const running = new Promise<VaultFlushReport>((resolve) => {
    settle = resolve
  })
  const active: ActiveFlush = { promise: running, settle }
  activeFlush = active
  notify()

  /** 本批尚未拿到确认的条目：整轮 IPC 抛错时按它回填，不能连坐丢掉 */
  const unconfirmed = new Map<string, PendingWrite>()

  try {
    const batch: PendingWrite[] = []
    for (const [key, item] of pending) {
      if (options?.keys !== undefined && !options.keys.has(key)) continue
      batch.push(item)
      pending.delete(key)
      unconfirmed.set(key, item)
    }
    const ctx = await buildSerializeContext()

    // Reserve all new paths before serializing any body, including forward/cyclic refs.
    const batchRows = new Map<string, Record<string, unknown> | undefined>()
    const planningFailed = new Set<string>()
    for (const item of batch) {
      if (!isCurrentQueue(session, generation)) break
      const key = entityKey(item.table, item.id)
      try {
        const row = await readRow(item.table, item.id)
        if (!isCurrentQueue(session, generation)) break
        batchRows.set(key, row)
        const kind = KIND_BY_TABLE[item.table]
        const state = session.entries.get(key)
        if (row !== undefined && row.deleted !== true && kind !== null && kind !== 'tag' &&
            (state === undefined || state.relPath === '')) {
          reserveTextPath(item.table, item.id, row, state, ctx)
        }
      } catch (err) {
        report.errors.push({ relPath: session.entries.get(key)?.relPath || reservedPaths.get(key) || '', message: errorText(err) })
        requeueUnconfirmed(item, true)
        unconfirmed.delete(key)
        planningFailed.add(key)
      }
    }

    const texts: VaultWriteEntry[] = []
    const planned: PlannedWrite[] = []
    const moves: {
      key: string
      from: string
      to: string
      kind: 'trash' | 'restore'
      title: string
      actor: JournalActor
      /** 移动失败时把内存基准退回去（否则状态指向一个不存在的文件，下一次 flush 不会再试） */
      revert?: () => void
      /** 移动失败时把这一条重新排进队列，让「重试保存」真的会重跑这次移动 */
      requeue?: () => void
    }[] = []
    const removals: { key: string; relPath: string; title: string; actor: JournalActor }[] = []
    /** 时间线：本轮真正写成功的改动 */
    const journalDrafts: JournalDraft[] = []

    for (const item of batch) {
      if (!isCurrentQueue(session, generation)) break
      const kind = KIND_BY_TABLE[item.table]
      const key = entityKey(item.table, item.id)
      if (planningFailed.has(key)) continue
      const state = session.entries.get(key)
      const row = batchRows.get(key)
      if (!isCurrentQueue(session, generation)) break

      // 项目元信息是单例特例
      if (kind === null) {
        if (row !== undefined) {
          try {
            const confirmed = await flushProjectMeta(row, report)
            if (confirmed) {
              unconfirmed.delete(key)
            } else {
              // 没拿到成功回执：留在队列里等下一次 drain（Q06）
              requeueUnconfirmed(item, true)
              unconfirmed.delete(key)
            }
          } catch (err) {
            report.errors.push({ relPath: session.marker?.relPath ?? '', message: errorText(err) })
            requeueUnconfirmed(item, true)
            unconfirmed.delete(key)
          }
        } else {
          unconfirmed.delete(key)
        }
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
          tagMetaFailed = false
          session.entries.delete(key)
          // 标签被删时也把引用实体排一遍：服务层通常已经摘了 id，
          // 但导入 / 旧数据里可能还有漏网的，下次序列化会按「没有这个名字」清掉。
          await enqueueTagReferences(item.id, item.actor, { session, generation })
          unconfirmed.delete(key)
          continue
        }
        const nextName = String(row.name ?? '')
        if (before !== null && before !== nextName && nextName !== '') {
          session.tagMeta.entries.delete(before)
        }
        // **只在改名时**回写引用？不 —— 无独立文件的标签在旧会话里可能没有
        // before 记录（F08）。每次标签行落盘都排一遍引用实体代价很小
        //（序列化发现 tags 没变就不会产生写入），换来的是改名永不漏。
        await enqueueTagReferences(item.id, item.actor, { session, generation })
        if (nextName !== '') {
          session.tagMeta.entries.set(nextName, {
            color: String(row.color ?? ''),
            category: String(row.category ?? ''),
          })
        }
        session.tagMeta.dirty = true
        tagMetaFailed = false
        // 记住「装载时叫什么」：下一次改名要按这个旧名字删元数据 / 算 diff
        if (state !== undefined) {
          session.entries.set(key, { ...state, entity: row })
        } else {
          session.entries.set(key, {
            table: 'tags',
            id: item.id,
            kind: 'tag',
            relPath: '',
            content: '',
            mtimeMs: 0,
            entity: row,
            frontmatter: {},
            bodyMarkdown: '',
            bodyDoc: 'null',
            trashed: false,
          })
        }
        unconfirmed.delete(key)
        continue
      }

      // 行没了 = 被彻底删除（或整表被换掉）。只回收站里的文件才真删。
      if (row === undefined) {
        if (state === undefined) {
          // 新建后从未写成功就被删掉：把计划阶段预留的路径一起收回
          const reserved = reservedPaths.get(key)
          if (reserved !== undefined) session.occupied.delete(reserved)
          reservedPaths.delete(key)
          unconfirmed.delete(key)
          continue
        }
        if (state.trashed) {
          removals.push({ key, relPath: state.relPath, title: titleOfRow(state.table, state.entity), actor: item.actor })
        } else if (state.relPath !== '') {
          moves.push({ key, from: state.relPath, to: trashRelPath(state.relPath), kind: 'trash', title: titleOfRow(state.table, state.entity), actor: item.actor })
        }
        session.entries.delete(key)
        session.byPath.delete(state.relPath)
        session.occupied.delete(state.relPath)
        reservedPaths.delete(key)
        unconfirmed.delete(key)
        continue
      }

      const nowTrashed = row.deleted === true
      const wasTrashed = state?.trashed === true

      if (nowTrashed && !wasTrashed && state !== undefined && state.relPath !== '') {
        const from = state.relPath
        const target = trashRelPath(from)
        moves.push({
          key,
          from,
          to: target,
          kind: 'trash',
          title: titleOfRow(state.table, row),
          actor: item.actor,
          // 挪失败（最常见：回收站里已有同名文件）就把基准退回原处，
          // 让「重试保存」真的能重来 —— 否则状态指向一个不存在的路径，永远不再尝试，
          // 而文件还留在原地：下次整库重读，这张刚删的图就又回来了。
          revert: () => {
            state.trashed = false
            state.relPath = from
            session.byPath.delete(target)
            session.byPath.set(from, key)
            session.occupied.delete(target)
            session.occupied.add(from)
          },
          requeue: () => requeueUnconfirmed(item, true),
        })
        state.trashed = true
        state.entity = row
        session.byPath.delete(from)
        session.byPath.set(target, key)
        session.occupied.delete(from)
        session.occupied.add(target)
        state.relPath = target
        unconfirmed.delete(key)
        continue
      }

      if (!nowTrashed && wasTrashed && state !== undefined) {
        const original = originalRelPathFromTrash(state.relPath)
        if (original !== null) {
          /**
           * 原路径可能已经被**别的条目**占了：删掉「亚瑟」之后又建了一个「亚瑟」，
           * `vault_move` 会以「目标已存在」拒绝，这条就永远恢复不出来（重试也一样）。
           * 恢复时先看占用表，撞名就按同一套规则改名（`亚瑟 (2).md`）。
           */
          const kind = KIND_BY_TABLE[state.table]
          const restored =
            kind !== null && isRelPathOccupied(session.occupied, original)
              ? allocateRelPath(
                  kind,
                  titleOfRow(state.table, row),
                  session.occupied,
                  original.slice(0, Math.max(0, original.lastIndexOf('/'))),
                  original.slice(original.lastIndexOf('/') + 1).replace(/\.md$/i, ''),
                )
              : original
          const from = state.relPath
          moves.push({
            key,
            from,
            to: restored,
            kind: 'restore',
            title: titleOfRow(state.table, row),
            actor: item.actor,
            revert: () => {
              state.trashed = true
              state.relPath = from
              session.byPath.delete(restored)
              session.byPath.set(from, key)
              session.occupied.delete(restored)
              session.occupied.add(from)
            },
            requeue: () => requeueUnconfirmed(item, true),
          })
          session.byPath.delete(from)
          session.byPath.set(restored, key)
          session.occupied.delete(from)
          session.occupied.add(restored)
          state.relPath = restored
          state.trashed = false
        }
      }

      if (nowTrashed) {
        // 仍在回收站：只更新内存基准，不去改回收站里的文件
        if (state !== undefined) {
          state.entity = row
        } else {
          // 新建后还没写成功就被删掉：收回预留路径，别让下一个同名条目无故变成 (2)
          const reserved = reservedPaths.get(key)
          if (reserved !== undefined) session.occupied.delete(reserved)
          reservedPaths.delete(key)
        }
        unconfirmed.delete(key)
        continue
      }

      let write: PlannedWrite | null = null
      try {
        write = await planTextWrite(item.table, item.id, row, state, ctx, item.actor, item.revision)
      } catch (err) {
        report.errors.push({
          relPath: state?.relPath || reservedPaths.get(key) || '',
          message: errorText(err),
        })
        requeueUnconfirmed(item, true)
        unconfirmed.delete(key)
        continue
      }
      if (write === null) {
        unconfirmed.delete(key)
        continue
      }
      // 计划成功但还没拿到写盘回执：整轮 IPC 抛错时要靠这张表回填
      unconfirmed.set(key, item)
      texts.push({
        relPath: write.relPath,
        content: write.content,
        expectedMtimeMs: write.expectedMtimeMs,
        // **新建**文件要求原生侧「目标已存在就拒绝」：前端已经按 occupied 去重，
        // 但外部程序可能在扫描之后刚好建了同名文件；原子写默认会覆盖（F01）。
        createOnly: write.isNew && options?.overwriteConflicts !== true,
      })
      planned.push(write)
    }

    // 移动与删除先做：它们会改变后续路径占用
    for (const move of moves) {
      if (!isCurrentQueue(session, generation)) break
      try {
        await withTimeout(vaultFs.move(session.root, move.from, move.to), `移动 ${move.from}`)
        if (move.kind === 'trash') report.movedToTrash += 1
        else report.restored += 1
        report.resolvedPaths?.push(move.from, move.to)
        unconfirmed.delete(move.key)
        // 历史永远记「规范路径」：进回收站也记原标题，否则还原之后这段就查不到了
        journalDrafts.push({
          kind: move.kind === 'trash' ? 'trash' : 'restore',
          relPath: move.kind === 'trash' ? move.from : move.to,
          title: move.title,
          keys: [],
          // 移动没有新内容，用「标题 + 时间」占位，让哈希仍能区分不同条目
          content: `${move.to}@${Date.now()}`,
          actor: move.actor,
          prevContent: '',
        })
      } catch (err) {
        move.revert?.()
        move.requeue?.()
        unconfirmed.delete(move.key)
        report.errors.push({ relPath: move.from, message: err instanceof Error ? err.message : String(err) })
      }
    }

    for (const removal of removals) {
      if (!isCurrentQueue(session, generation)) break
      try {
        await withTimeout(vaultFs.remove(session.root, removal.relPath), `删除 ${removal.relPath}`)
        report.removed += 1
        report.resolvedPaths?.push(removal.relPath)
        unconfirmed.delete(removal.key)
        journalDrafts.push({
          kind: 'remove',
          relPath: originalRelPathFromTrash(removal.relPath) ?? removal.relPath,
          title: removal.title,
          keys: [],
          content: `${removal.relPath}@${Date.now()}`,
          actor: removal.actor,
          prevContent: '',
        })
      } catch (err) {
        // 文件没删掉：行已经从 Dexie 消失，再把任务排回队列也读不到实体；
        // 错误如实报上去，由「清理回收站」重新发起。
        unconfirmed.delete(removal.key)
        report.errors.push({ relPath: removal.relPath, message: err instanceof Error ? err.message : String(err) })
      }
    }

    if (texts.length > 0) {
      const results = await withTimeout(vaultFs.writeTexts(session.root, texts), '写入笔记')
      results.forEach((result, index) => {
        const write = planned[index]
        if (write === undefined) return
        if (!isCurrentQueue(session, generation)) return
        const key = write.key
        if (result.ok) {
          report.written += 1
          report.resolvedPaths?.push(write.relPath)
          write.nextState.mtimeMs = result.mtimeMs ?? 0
          session.entries.set(key, write.nextState)
          session.byPath.set(write.relPath, key)
          session.occupied.add(write.relPath)
          reservedPaths.delete(key)
          // 没有更新修订在队列里才算「这一版已确认」；有的话不能把它的失败/冲突标记清掉
          if (!pending.has(key)) {
            failedKeys.delete(key)
            conflictedKeys.delete(key)
          }
          unconfirmed.delete(key)
          journalDrafts.push({
            kind: write.isNew ? 'create' : 'update',
            relPath: write.relPath,
            title: write.title,
            keys: write.changedKeys,
            content: write.content,
            prevContent: write.prevContent,
            actor: write.actor,
          })
          return
        }
        const pendingItem = pendingFromWrite(write)
        if (result.conflict) {
          // 磁盘上被外部改过 / 新建目标已存在：**默认不覆盖**（用户的文件可能正是他想留下的那版）。
          // 条目留在队列里等用户决定：再改一次、或明确选「覆盖磁盘」。
          report.conflicts.push(result.relPath)
          const requeued = requeueUnconfirmed(pendingItem, false)
          if (requeued) {
            if (options?.overwriteConflicts === true) {
              // 用户已经点头：把基准换成磁盘上的 mtime，下一次 flush 就按编辑器里的内容覆盖
              const current = session.entries.get(key)
              if (current !== undefined) current.mtimeMs = result.mtimeMs ?? 0
            }
            // 覆盖尝试失败也要保留「未解决冲突」标记；成功写入时会清掉（Q03）
            conflictedKeys.add(key)
          }
          unconfirmed.delete(key)
          return
        }
        report.errors.push({ relPath: result.relPath, message: result.error ?? '写入失败' })
        requeueUnconfirmed(pendingItem, true)
        unconfirmed.delete(key)
      })

      // 回执条数少于计划（IPC 线格式异常 / 实现变化）：没拿到结果的一律按失败回填，
      // 「没确认 = 没成功」是这条队列唯一的确认口径。换库之后则不能再回填。
      if (isCurrentQueue(session, generation) && unconfirmed.size > 0) {
        for (const item of unconfirmed.values()) requeueUnconfirmed(item, true)
        for (const key of unconfirmed.keys()) unconfirmed.delete(key)
        report.errors.push({ relPath: '', message: '写盘回执不完整，未确认的改动已留在队列' })
      }
    }

    if (isCurrentQueue(session, generation)) {
      // tags.json 刚失败过就别在**自动** flush 里反复撞同一个错；
      // 显式 drain（带 keys）仍然会再试一次。
      if (!(tagMetaFailed && options?.keys === undefined)) {
        await withTimeout(flushTagMeta(report), '写入 tags.json')
      }

      // 时间线：只追加。**绝不能拖住保存** —— 即便 IPC 不返回也只等 20 秒就放弃（见 journal.ts）
      try {
        await withTimeout(appendJournal(journalDrafts), '写入时间线')
      } catch (err) {
        console.warn('[vault] 时间线写入超时，已跳过:', err)
      }

      lastFlushedAt = Date.now()
      lastError =
        report.errors.length > 0
          ? report.errors[0].message
          : report.conflicts.length > 0
            ? `${report.conflicts.length} 个文件在磁盘上被外部修改，已跳过未覆盖`
            : null
    }
  } catch (err) {
    // 整轮 IPC 拒绝 / 序列化上下文建立失败：**所有没拿到确认的条目都回填**。
    // 以前这里只记一条错误，batch 已经从 pending 里取走，用户的改动就再也
    // 不会尝试写盘（F02）。回填时带修订号，不会压掉 flush 期间的新版本。
    if (isCurrentQueue(session, generation)) {
      for (const item of unconfirmed.values()) requeueUnconfirmed(item, true)
      lastError = err instanceof Error ? err.message : String(err)
    }
    report.errors.push({ relPath: '', message: errorText(err) })
  } finally {
    if (isCurrentQueue(session, generation)) {
      flushing = false
      flushingSince = 0
      notify()
      // 本轮产生的后续工作（标签改名带来的引用改写）不能就此搁置。
      // 但已经确定「写不了」的行不自动重试 —— 否则每 350ms 撞一次同一个错；
      // 因冲突停住的行也不再自动重试（基准没变，必然再冲突，见 conflictedKeys）。
      const retryable = [...pending.keys()].some(
        (retryKey) => !conflictedKeys.has(retryKey) && !failedKeys.has(retryKey),
      )
      if (retryable && flushTimer === null) scheduleFlush()
    }
    if (activeFlush === active) activeFlush = null
    // 即使会话已经切换，也要把等待这一轮的 drain 放行（它拿到的是旧库的真实回执）
    settle(report)
  }

  return report
}

/**
 * 切 vault / 关窗 / 备份之前调用：把队列排干。
 *
 * 与 `flushVaultWrites` 的区别（F03）：
 *  1. 有 flush 正在跑时**等它结束**，不在 `flushing` 时返回空报告假装成功；
 *  2. 等完之后把这一轮期间新排进来的写入（标签引用回写等）也处理掉；
 *  3. 每条修订在一次 drain 里只尝试有限次（普通 1 次、覆盖冲突 2 次），
 *     不会因为「失败 → 留在队列 → 再试 → 又失败」无限转圈；
 *  4. 回执是**汇总**：已有 flush 的错误 / 冲突也包含在里面。
 */
/**
 * 排队中的键对应的磁盘路径：已有状态取 `relPath`，尚未写成功的新实体取预留路径。
 * drain 用它判断「最后一轮的回执里，这条路径还算不算未解决」。
 */
function collectPendingPaths(
  session: VaultSession | null,
  keys: Iterable<string>,
  into: Set<string>,
): void {
  for (const key of keys) {
    if (!pending.has(key)) continue
    const relPath = session?.entries.get(key)?.relPath
    if (relPath !== undefined && relPath !== '') into.add(relPath)
    const reserved = reservedPaths.get(key)
    if (reserved !== undefined) into.add(reserved)
  }
}

export async function drainVaultWrites(
  options?: FlushVaultWritesOptions,
): Promise<VaultFlushReport> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const total = emptyFlushReport()
  const attempts = new Map<string, number>()
  // 最终状态与尝试历史分开：每轮先记历史，再按「后来是否确认成功」清掉旧条目。
  // Q03：覆盖冲突第一轮返回 conflict、第二轮写成功，最终回执里不能还留着旧 conflict。
  const rawConflicts = new Set<string>()
  const rawErrors = new Map<string, string>()
  // 覆盖冲突时允许第二次尝试（第一次只把基准 mtime 换成磁盘的）
  const maxAttempts = options?.overwriteConflicts === true ? 2 : 1
  let tagMetaAttempts = 0

  for (let round = 0; round < 64; round += 1) {
    const session = getVaultSession()
    if (session === null) break

    let report: VaultFlushReport
    const inFlight = activeFlush
    if (inFlight !== null) {
      report = await inFlight.promise
    } else {
      const keys = new Set<string>()
      for (const [key, item] of pending) {
        const stamp = `${key}#${item.revision}`
        const used = attempts.get(stamp) ?? 0
        if (used >= maxAttempts) continue
        attempts.set(stamp, used + 1)
        keys.add(key)
      }

      let includeTagMeta = false
      if (session.tagMeta.dirty && tagMetaAttempts < maxAttempts) {
        tagMetaAttempts += 1
        includeTagMeta = true
      }

      if (keys.size === 0 && !includeTagMeta) break

      report = await flushVaultWrites({
        overwriteConflicts: options?.overwriteConflicts,
        keys,
      })
    }

    total.written += report.written
    total.movedToTrash += report.movedToTrash
    total.restored += report.restored
    total.removed += report.removed
    total.resolvedPaths?.push(...(report.resolvedPaths ?? []))

    // 先应用「已确认成功」，再记本轮失败：同一路径后来成功就清掉旧账。
    for (const path of report.resolvedPaths ?? []) {
      rawConflicts.delete(path)
      rawErrors.delete(path)
    }
    for (const path of report.conflicts) {
      rawConflicts.add(path)
      total.attempts?.push({ relPath: path, outcome: 'conflict', message: '磁盘上的文件已被外部修改' })
    }
    for (const error of report.errors) {
      rawErrors.set(error.relPath === '' ? '\u0000global' : error.relPath, error.message)
      total.attempts?.push({ relPath: error.relPath, outcome: 'error', message: error.message })
    }
  }

  const session = getVaultSession()
  const pendingPaths = new Set<string>()
  const failedPaths = new Set<string>()
  const conflictPaths = new Set<string>()
  collectPendingPaths(session, pending.keys(), pendingPaths)
  collectPendingPaths(session, failedKeys, failedPaths)
  collectPendingPaths(session, conflictedKeys, conflictPaths)

  // 冲突只保留「仍停在队列里且仍带冲突标记」的路径
  total.conflicts = [...rawConflicts].filter((path) => conflictPaths.has(path))

  const tagMetaDirty = session?.tagMeta.dirty ?? false
  const unresolvedErrors: { relPath: string; message: string }[] = []
  for (const [key, message] of rawErrors) {
    if (key === '\u0000global') {
      // 整轮 IPC 失败没有路径；只要还有未确认工作（或 tags.json 脏）就仍未解决
      if (pending.size > 0 || tagMetaDirty) unresolvedErrors.push({ relPath: '', message })
      continue
    }
    if (key === TAG_META_REL_PATH) {
      if (tagMetaDirty) unresolvedErrors.push({ relPath: key, message })
      continue
    }
    // 后来已经确认成功 / 有更新的修订在排队（旧错误作废）：不进最终回执
    if (failedPaths.has(key)) {
      unresolvedErrors.push({ relPath: key, message })
      continue
    }
    if (pendingPaths.has(key)) continue
    if (session?.byPath.has(key) === true) continue
    // 移动 / 删除这类没有队列行的失败：仍保留（没有别的重试入口）
    unresolvedErrors.push({ relPath: key, message })
  }
  total.errors = unresolvedErrors

  return total
}

/**
 * 换库 / 关窗前的保存屏障：先把旧库排干；排不干就**拒绝切换**，
 * 由调用方把原会话留在界面上（F03 / 需求 7）。
 *
 * 以前 `loadVault` 一进来就 `resetVaultWriteState()`，未确认的队列被静默丢掉；
 * 现在必须先过这一关。冲突也算「没排干」—— 自动覆盖外部修改不是默认行为，
 * 「仍然退出 / 放弃本地版本」必须是调用方明确的用户动作，不能藏在重读里。
 */
export async function settleVaultWritesBeforeSwitch(): Promise<VaultFlushReport> {
  const session = getVaultSession()
  if (session === null) return emptyFlushReport()

  const report = await drainVaultWrites()
  const leftover = pending.size + (session.tagMeta.dirty ? 1 : 0)
  if (leftover > 0 || report.conflicts.length > 0 || report.errors.length > 0) {
    const reason =
      report.errors[0]?.message ??
      (report.conflicts.length > 0
        ? `${report.conflicts.length} 个文件与磁盘上的版本冲突`
        : lastError ?? '原因不明')
    throw new Error(
      `切换笔记库前仍有${Math.max(leftover, report.conflicts.length)}项改动未写入原笔记库：${reason}。请先重试保存。`,
    )
  }
  return report
}

/** 是否还有未确认的写入（含 tags.json；换库 / 关窗前的判断用） */
export function hasPendingVaultWrites(): boolean {
  const session = getVaultSession()
  return pending.size > 0 || flushing || (session?.tagMeta.dirty ?? false)
}

/** 会话结束时清空队列状态 */
export function resetVaultWriteState(): void {
  // 代次 +1：还在途的 flush 完成后不再回填 / 改会话（F03 需求 7）
  queueGeneration += 1
  pending = new Map()
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  conflictedKeys.clear()
  failedKeys.clear()
  reservedPaths.clear()
  activeFlush = null
  flushing = false
  flushingSince = 0
  tagMetaFailed = false
  lastError = null
  lastFlushedAt = null
  notify()
}

/** 供冲突处理用：放弃本地版本，改为采纳磁盘版本 */
export function discardConflict(relPath: string): void {
  const session = getVaultSession()
  if (session === null) return
  const path = normalizeRelPath(relPath)
  const key = session.byPath.get(path) ?? [...reservedPaths].find(
    ([, reserved]) => normalizeRelPath(reserved) === path,
  )?.[0]
  if (key === undefined) return
  // Keep the loaded baseline until reload succeeds; a blocked reload can still be edited.
  pending.delete(key)
  reservedPaths.delete(key)
  conflictedKeys.delete(key)
  failedKeys.delete(key)
  notify()
}
