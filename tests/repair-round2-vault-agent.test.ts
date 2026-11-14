import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 第二轮 A2 回归：Q07（助手 create 不得全局暂停落盘、身份绑到具体写入）。
 *
 * 这里跑真实的 create service + 真实的 Dexie 中间件接线，只替换数据库与 IPC；
 * `db.transaction` 会模拟 Dexie 的「当前事务」zone，让 `actorOfTransaction` 能取到
 * 绑定在事务上的身份（否则只能测到 human）。
 */

const h = vi.hoisted(() => {
  const names = ['characters', 'events', 'countries', 'worldEntries', 'tags', 'periods', 'meta', 'operationLog'] as const
  const rows: Record<string, Map<number, Record<string, unknown>>> = Object.fromEntries(
    names.map((name) => [name, new Map<number, Record<string, unknown>>()]),
  )
  const dispatch: { current: ((name: string, req: { type: string; values?: unknown[]; keys?: unknown[] }) => Promise<{ results?: unknown[] }>) | null } = { current: null }
  const table = (name: string) => ({
    toArray: async () => structuredClone([...rows[name].values()]),
    get: async (id: number) => structuredClone(rows[name].get(id)),
    update: async (id: number, patch: Record<string, unknown>) => {
      const row = rows[name].get(id)
      if (!row) return 0
      rows[name].set(id, { ...row, ...structuredClone(patch) })
      return 1
    },
    put: async (row: { id: number }) => {
      rows[name].set(row.id, structuredClone(row))
      return row.id
    },
    add: async (row: { id?: number }) => {
      if (dispatch.current === null) {
        const id = row.id ?? Math.max(0, ...rows[name].keys()) + 1
        rows[name].set(id, { ...structuredClone(row), id })
        return id
      }
      const result = await dispatch.current(name, { type: 'add', values: [row] })
      return result.results?.[0] ?? rows[name].size
    },
    delete: async (id: number) => {
      rows[name].delete(id)
    },
    clear: async () => rows[name].clear(),
    bulkAdd: async (records: { id?: number }[]) => {
      let key = Math.max(0, ...rows[name].keys())
      for (const record of records) {
        key = record.id ?? key + 1
        rows[name].set(key, { ...structuredClone(record), id: key })
      }
      return key
    },
  })
  const db = {
    ...Object.fromEntries(names.map((name) => [name, table(name)])),
    table,
    tables: names.map((name) => table(name)),
    use: (config: unknown) => {
      hConfig.value = config as typeof hConfig.value
    },
    transaction: async (...args: unknown[]) => {
      const run = args.at(-1) as (tx: object) => Promise<unknown>
      const tx = {}
      return runInTx.current(tx, () => run(tx))
    },
  }
  const hConfig: { value: { create?: (down: unknown) => { table: (name: string) => { mutate: (req: unknown) => Promise<{ results?: unknown[] }> } } } | null } = { value: null }
  const runInTx = {
    current: async <T>(_tx: object, run: () => Promise<T>): Promise<T> => run(),
  }
  return {
    rows,
    db,
    dispatch,
    hConfig,
    runInTx,
    journal: [] as { actor?: string; relPath?: string; kind?: string }[],
    bodyPreset: vi.fn(),
    logHook: null as null | ((table: string, id: number) => Promise<void>),
    files: new Map<string, string>(),
    fs: {
      writeTexts: vi.fn(),
      mkdir: vi.fn(),
      move: vi.fn(),
      remove: vi.fn(),
    },
  }
})

vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/vault/vault-fs', () => ({ vaultFs: h.fs, isVaultSupported: () => false }))
vi.mock('@/lib/vault/journal', () => ({
  appendJournal: async (drafts: { actor?: string; relPath?: string; kind?: string }[]) => {
    h.journal.push(...drafts)
  },
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  readJournalLines: async () => [],
  mergeJournalLines: () => [],
}))
vi.mock('@/lib/templates/body-preset', () => ({
  bodyPresetDoc: (...args: unknown[]) => h.bodyPreset(...args),
}))
vi.mock('@/lib/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sync')>()
  return {
    ...actual,
    logOperation: async (table: string, id: number) => {
      if (h.logHook !== null) await h.logHook(table, id)
    },
  }
})

import Dexie from 'dexie'
import { newCharacterData } from '@/lib/entity-defaults'
import { createCharacter } from '@/features/characters/services'
import {
  currentStatus,
  drainVaultWrites,
  installVaultPersist,
  resetVaultWriteState,
  excludeVaultLoadTransaction,
} from '@/lib/vault/vault-persist'
import { createVaultSession, setVaultSession } from '@/lib/vault/vault-session'

let middlewareReady = false

function ensureMiddleware(): void {
  if (middlewareReady) return
  middlewareReady = true
  // 模拟 Dexie 的 promise-zone：事务执行期间 `Dexie.currentTransaction` 指向 tx
  h.runInTx.current = async <T>(tx: object, run: () => Promise<T>): Promise<T> => {
    const previous = Object.getOwnPropertyDescriptor(Dexie, 'currentTransaction')
    Object.defineProperty(Dexie, 'currentTransaction', { configurable: true, value: tx })
    try {
      return await run()
    } finally {
      if (previous === undefined) {
        delete (Dexie as unknown as { currentTransaction?: unknown }).currentTransaction
      } else {
        Object.defineProperty(Dexie, 'currentTransaction', previous)
      }
    }
  }

  installVaultPersist()
  const config = h.hConfig.value
  if (config?.create === undefined) throw new Error('中间件没有装上')
  const core = config.create({
    table: (name: string) => ({
      mutate: async (req: { type: string; values?: unknown[]; keys?: unknown[] }) => {
        if (req.type === 'add' || req.type === 'put') {
          const values = (req.values ?? []) as { id?: number }[]
          const results = values.map((value) => {
            const id = value.id ?? Math.max(0, ...h.rows[name].keys()) + 1
            h.rows[name].set(id, { ...structuredClone(value), id })
            return id
          })
          return { results }
        }
        return { results: [] }
      },
    }),
  })
  h.dispatch.current = (name, req) => core.table(name).mutate(req)
}

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const table of Object.values(h.rows)) table.clear()
  h.files.clear()
  h.journal.length = 0
  h.bodyPreset.mockReset()
  h.bodyPreset.mockResolvedValue(null)
  h.logHook = null
  vi.clearAllMocks()
  resetVaultWriteState()
  setVaultSession(createVaultSession('memory-only'))
  ensureMiddleware()
  h.fs.mkdir.mockResolvedValue(undefined)
  h.fs.writeTexts.mockImplementation(async (_root: string, entries: { relPath: string; content: string }[]) =>
    entries.map((entry) => {
      h.files.set(entry.relPath, entry.content)
      return { relPath: entry.relPath, ok: true, conflict: false, mtimeMs: 2, error: null }
    }),
  )
})

afterEach(() => {
  resetVaultWriteState()
  setVaultSession(null)
  vi.useRealTimers()
})

describe('Q07 助手 create 与人工保存交错', () => {
  it('excludes only a tagged load transaction and its children, while human writes still queue', async () => {
    const loading = {}
    const release = excludeVaultLoadTransaction(loading)
    try {
      await h.runInTx.current({ parent: loading }, async () => {
        await h.dispatch.current?.('characters', { type: 'put', values: [{ ...newCharacterData(), id: 1, name: '从盘上载入' }] })
      })
      expect(currentStatus().pending).toBe(0)
      await h.dispatch.current?.('characters', { type: 'put', values: [{ ...newCharacterData(), id: 2, name: '人工新输入' }] })
      expect(currentStatus().pending).toBe(1)
    } finally {
      release()
    }
    await h.runInTx.current(loading, async () => {
      await h.dispatch.current?.('characters', { type: 'put', values: [{ ...newCharacterData(), id: 3, name: '取消排除后' }] })
    })
    expect(currentStatus().pending).toBe(2)
  })

  it('正常写入对照：中间件排队并落盘', async () => {
    await h.dispatch.current?.('characters', {
      type: 'put',
      values: [{ ...newCharacterData(), id: 50, name: '中间件对照' }],
    })

    expect(currentStatus().pending).toBe(1)
    const report = await drainVaultWrites()
    expect(report.written).toBe(1)
    expect(report.errors).toEqual([])
    expect(currentStatus().pending).toBe(0)
    expect(h.files.size).toBe(1)
  })

  it('模板 / 正文准备期间的人工保存不会被吞（Q07 核心）', async () => {
    const preparation = deferred<unknown>()
    h.bodyPreset.mockReturnValueOnce(preparation.promise)

    const creating = createCharacter(
      { ...newCharacterData(), name: '助手新建' },
      { actor: 'agent:assistant' },
    )
    // create 在第一个 await（模板 / 正文准备）处让出；此处它已经在 await 上
    expect(h.bodyPreset).toHaveBeenCalledTimes(1)

    // 助手还在模板准备里 await；人工保存必须独立入队
    await h.dispatch.current?.('characters', {
      type: 'put',
      values: [{ ...newCharacterData(), id: 99, name: '人工正在编辑' }],
    })

    preparation.resolve(null)
    const createdId = await creating

    expect(createdId).toBeGreaterThan(0)
    expect(currentStatus().pending).toBe(2)

    await drainVaultWrites()

    const created = h.journal.find((entry) => entry.relPath?.includes('助手新建'))
    const human = h.journal.find((entry) => entry.relPath?.includes('人工正在编辑'))
    expect(created?.actor).toBe('agent:assistant')
    expect(human?.actor).toBe('human')
    expect(h.files.size).toBe(2)
  })

  it('助手准备阶段失败：不产生队列任务，也不误伤人工写入', async () => {
    h.bodyPreset.mockRejectedValueOnce(new Error('template read failed'))

    await expect(
      createCharacter({ ...newCharacterData(), name: '会失败的助手新建' }, { actor: 'agent:assistant' }),
    ).rejects.toThrow(/template read failed/)

    expect(currentStatus().pending).toBe(0)
    expect(h.rows.characters.size).toBe(0)
  })

  it('新建 add 之后、service 返回之前的人工修订保持 human，不被补记成 agent', async () => {
    let updatedId = 0
    h.logHook = async (table, id) => {
      if (table !== 'characters' || updatedId !== 0) return
      updatedId = id
      const row = h.rows.characters.get(id)
      if (row === undefined) return
      // 模拟 create 返回 id 后、调用方 stamp 之前，用户对同一实体又保存了一次
      await h.dispatch.current?.('characters', {
        type: 'put',
        values: [{ ...row, name: '人工改名' }],
      })
    }

    const id = await createCharacter(
      { ...newCharacterData(), name: '助手初建' },
      { actor: 'agent:assistant' },
    )
    expect(updatedId).toBe(id)
    expect(currentStatus().pending).toBe(1)

    await drainVaultWrites()

    // 盘上最后一版是人工改名；不能因为「助手新建」就把它记成 agent
    expect(h.journal).toHaveLength(1)
    expect(h.journal[0].actor).toBe('human')
    const content = h.files.get('角色/人工改名.md')
    expect(content).toContain('人工改名')
    expect(content).not.toContain('助手初建')
  })
})
