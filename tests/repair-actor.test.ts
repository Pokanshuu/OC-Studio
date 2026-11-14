import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 身份留痕回归（审查 F14）。
 *
 * 关键错误路径不是「函数被调用」，而是**时序**：
 * - 助手一次 await 期间，外部人工操作不能读/记成 agent（R16）；
 * - 两个事务交错时各拿各的身份；
 * - 失败重试与标签引用回写用**入队时**的身份，不在稍后的 flush 里重猜。
 */

const h = vi.hoisted(() => {
  const names = ['characters', 'events', 'countries', 'worldEntries', 'tags', 'periods', 'meta', 'operationLog'] as const
  const rows: Record<string, Map<number, Record<string, unknown>>> = Object.fromEntries(
    names.map((name) => [name, new Map<number, Record<string, unknown>>()]),
  )
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
  const transaction = {}
  const db = {
    ...Object.fromEntries(names.map((name) => [name, table(name)])),
    table,
    tables: [],
    transaction: async (...args: unknown[]) => {
      const run = args.at(-1) as (tx: object) => Promise<unknown>
      return run(transaction)
    },
  }
  return {
    rows,
    db,
    transaction,
    files: new Map<string, string>(),
    journal: [] as { actor?: string; relPath?: string; kind?: string }[],
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

import {
  actorOfTransaction,
  bindActorToTransaction,
  currentActor,
  runAsActor,
  runAsActorAsync,
  runAsActorTransaction,
} from '@/lib/vault/actor'
import {
  drainVaultWrites,
  markVaultDirty,
  resetVaultWriteState,
  stampVaultWriteActor,
} from '@/lib/vault/vault-persist'
import { createVaultSession, setVaultSession, type VaultEntryState } from '@/lib/vault/vault-session'

function note(id: number, title = '测试笔记', extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    category: '',
    content: '',
    parentId: null,
    tags: [] as number[],
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    ...extra,
  }
}

function entryState(row: ReturnType<typeof note>, relPath: string, frontmatter: Record<string, unknown> = {}): VaultEntryState {
  return {
    table: 'worldEntries',
    id: row.id,
    kind: 'worldEntry',
    relPath,
    content: '',
    mtimeMs: 1,
    entity: structuredClone(row),
    frontmatter,
    bodyMarkdown: '',
    bodyDoc: 'null',
    trashed: false,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const table of Object.values(h.rows)) table.clear()
  h.files.clear()
  h.journal.length = 0
  vi.clearAllMocks()
  resetVaultWriteState()
  setVaultSession(createVaultSession('memory-only'))
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

describe('F14 同步作用域与异步事务身份', () => {
  it('同步作用域内是助手，退出（含抛错）后复原', () => {
    expect(currentActor()).toBe('human')
    expect(runAsActor('agent:assistant', () => currentActor())).toBe('agent:assistant')
    expect(currentActor()).toBe('human')
    try {
      runAsActor('agent:assistant', () => {
        throw new Error('boom')
      })
    } catch {
      // 故意抛
    }
    expect(currentActor()).toBe('human')
  })

  it('R16：助手 await 期间，外部人工操作读到 human', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = runAsActorAsync('agent:assistant', async () => {
      await gate
    })
    expect(currentActor()).toBe('human')
    release()
    await pending
    expect(currentActor()).toBe('human')
  })

  it('两个交错事务各拿各的身份，子事务沿 parent 继承', async () => {
    const first = {}
    const second = {}
    const child = { parent: first }
    bindActorToTransaction(first, 'agent:assistant')
    bindActorToTransaction(second, 'plugin:official.map-generator')
    expect(actorOfTransaction(first)).toBe('agent:assistant')
    expect(actorOfTransaction(second)).toBe('plugin:official.map-generator')
    expect(actorOfTransaction(child)).toBe('agent:assistant')
    expect(actorOfTransaction({})).toBe('human')
  })

  it('runAsActorTransaction 把身份绑在当前事务上，事务外仍是 human', async () => {
    let seen = ''
    await runAsActorTransaction('agent:assistant', async () => {
      seen = actorOfTransaction(h.transaction)
      expect(currentActor()).toBe('human')
    })
    expect(seen).toBe('agent:assistant')
  })
})

describe('F14 入队、重试与引用回写保持原始身份', () => {
  it('助手新建后补记身份：stamp 改的是队列身份，不是内容', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1, 'human')
    stampVaultWriteActor('worldEntries', 1, 'agent:assistant')
    await drainVaultWrites()
    expect(h.journal).toHaveLength(1)
    expect(h.journal[0].actor).toBe('agent:assistant')
  })

  it('失败重试不重猜身份：第一次失败、第二次成功仍是 agent', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1, 'agent:assistant')
    h.fs.writeTexts.mockResolvedValueOnce([{ relPath: '世界观/测试笔记.md', ok: false, error: 'disk full' }])

    const failed = await drainVaultWrites()
    expect(failed.errors).toHaveLength(1)
    expect(h.journal).toHaveLength(0)

    await drainVaultWrites()
    expect(h.journal).toHaveLength(1)
    expect(h.journal[0].actor).toBe('agent:assistant')
  })

  it('标签改名带出的引用回写沿用发起任务的 actor', async () => {
    const tagged = note(1, '带标签的笔记', { tags: [1] })
    h.rows.worldEntries.set(1, tagged)
    h.rows.tags.set(1, { id: 1, name: '新标签', color: '#abc', category: '' })
    const session = createVaultSession('memory-only')
    session.entries.set('worldEntries:1', entryState(tagged, '世界观/笔记.md', { tags: ['旧标签'] }))
    session.tagMeta.entries.set('旧标签', { color: '#abc', category: '' })
    setVaultSession(session)

    markVaultDirty('tags', 1, 'agent:assistant')
    await drainVaultWrites()
    await drainVaultWrites()

    const reference = h.journal.find((draft) => draft.relPath === '世界观/笔记.md')
    expect(reference).toBeDefined()
    expect(reference?.actor).toBe('agent:assistant')
  })
})
