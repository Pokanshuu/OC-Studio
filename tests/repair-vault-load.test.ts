import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 会话切换回归（审查 F03 的 drain 屏障 / 需求 7：旧库在途写入不能污染新库，
 * loadVault 不能静默丢掉未确认队列）。
 */

const h = vi.hoisted(() => {
  const names = ['characters', 'events', 'countries', 'worldEntries', 'tags', 'periods', 'meta', 'operationLog'] as const
  const rows: Record<string, Map<number, Record<string, unknown>>> = Object.fromEntries(
    names.map((name) => [name, new Map<number, Record<string, unknown>>()]),
  )
  const table = (name: string) => ({
    toArray: async () => structuredClone([...rows[name].values()]),
    get: async (id: number) => {
      if (name === 'meta') await h.beforeMetaRead?.()
      return structuredClone(rows[name].get(id))
    },
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
  const db = {
    ...Object.fromEntries(names.map((name) => [name, table(name)])),
    table,
    transaction: async (...args: unknown[]) => {
      await h.beforeTransaction?.()
      const run = args.at(-1) as () => Promise<unknown>
      return run()
    },
  }
  return {
    rows,
    db,
    files: new Map<string, string>(),
    roots: [] as string[],
    beforeTransaction: null as null | (() => Promise<void>),
    beforeMetaRead: null as null | (() => Promise<void>),
    fs: {
      scan: vi.fn(),
      exists: vi.fn(),
      readBytes: vi.fn(),
      listAssets: vi.fn(),
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
  appendJournal: async () => {},
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  readJournalLines: async () => [],
  mergeJournalLines: () => [],
}))
vi.mock('@/lib/search', () => ({ resetSearchIndex: () => {} }))
vi.mock('@/lib/fields/store', () => ({
  loadFieldConfig: async () => {},
  readFieldConfigFromRoot: async () => ({}),
  syncCustomFieldKeys: () => {},
}))
vi.mock('@/lib/templates/fields', () => ({ collectTemplateFieldKeys: () => [] }))
vi.mock('@/lib/templates/info-groups', () => ({
  INFO_GROUPS_REL_PATH: '.ocstudio/info-groups.json',
  loadInfoGroups: async () => {},
  normalizeInfoGroups: () => [],
}))

import {
  currentStatus,
  drainVaultWrites,
  flushVaultWrites,
  markVaultDirty,
  resetVaultWriteState,
} from '@/lib/vault/vault-persist'
import { createVaultSession, getVaultSession, setVaultSession } from '@/lib/vault/vault-session'
import { loadVault, readVault, applyDataset } from '@/lib/vault/vault-load'
import { scanVault } from '@/lib/vault/scan'

function note(id: number, title = '测试笔记') {
  return {
    id,
    title,
    category: '',
    content: '',
    parentId: null,
    tags: [],
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
  }
}

function emptyScan(root: string) {
  return {
    root,
    files: [],
    skippedDirs: [],
    otherFiles: [],
    dirs: [],
    marker: null,
    warnings: [],
    truncated: false,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const table of Object.values(h.rows)) table.clear()
  h.files.clear()
  h.roots.length = 0
  h.beforeTransaction = null
  h.beforeMetaRead = null
  vi.clearAllMocks()
  resetVaultWriteState()
  h.fs.scan.mockImplementation(async (root: string) => emptyScan(root))
  h.fs.exists.mockResolvedValue(false)
  h.fs.readBytes.mockResolvedValue([])
  h.fs.listAssets.mockResolvedValue([])
  h.fs.mkdir.mockResolvedValue(undefined)
  h.fs.writeTexts.mockImplementation(async (root: string, entries: { relPath: string; content: string }[]) => {
    h.roots.push(root)
    return entries.map((entry) => {
      h.files.set(`A:${entry.relPath}`, entry.content)
      return { relPath: entry.relPath, ok: true, conflict: false, mtimeMs: 2, error: null }
    })
  })
})

afterEach(() => {
  resetVaultWriteState()
  setVaultSession(null)
  vi.useRealTimers()
})

function sessionA() {
  const session = createVaultSession('A')
  setVaultSession(session)
  return session
}

describe('F07 换库前的保存屏障', () => {
  it('checks pending work after the first IDB request acquires the write transaction', async () => {
    sessionA()
    let release!: () => void
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { entered = resolve })
    h.beforeMetaRead = async () => { entered(); await waiting }
    const replacing = applyDataset(scanVault({ root: 'B', files: [], skippedDirs: [], marker: null }))
    await started
    h.rows.worldEntries.set(1, note(1, '原事务提交的最后修改'))
    markVaultDirty('worldEntries', 1)
    const outcome = expect(replacing).rejects.toThrow(/新的未保存改动/)
    release()
    await outcome
    expect(h.rows.worldEntries.get(1)?.title).toBe('原事务提交的最后修改')
    expect(getVaultSession()?.root).toBe('A')
    expect(currentStatus().pending).toBe(1)
  })

  it('keeps the session and aborts replacement if a writer finishes while waiting for its transaction', async () => {
    const session = sessionA()
    let release!: () => void
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { entered = resolve })
    h.beforeTransaction = async () => { entered(); await waiting }
    const scan = scanVault({ root: 'B', files: [], skippedDirs: [], marker: null })
    const replacing = applyDataset(scan)
    await started
    expect(getVaultSession()).toBe(session)
    const human = note(1, '等待期间的人工输入')
    h.rows.worldEntries.set(1, human)
    markVaultDirty('worldEntries', 1)
    const outcome = expect(replacing).rejects.toThrow(/新的未保存改动/)
    release()
    await outcome
    expect(h.rows.worldEntries.get(1)).toEqual(human)
    expect(currentStatus().pending).toBe(1)
    expect(getVaultSession()).toBe(session)
  })

  it('旧库有写不掉的改动时拒绝换库，原会话和队列都保留', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValue([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])

    await expect(loadVault('B')).rejects.toThrow(/未写入原笔记库/)
    expect(getVaultSession()?.root).toBe('A')
    expect(currentStatus().pending).toBe(1)
  })

  it('旧库改动能写成功时，先落盘再开新库', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)

    const result = await loadVault('B')

    expect(result.session.root).toBe('B')
    expect(getVaultSession()?.root).toBe('B')
    expect(h.roots).toContain('A')
    expect(h.files.get('A:世界观/测试笔记.md')).toContain('测试笔记')
    expect(currentStatus().pending).toBe(0)
  })

  it('读盘期间新排进来的写入也要先落到旧库，再切会话', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    h.fs.scan.mockImplementation(async (root: string) => {
      // 扫描是异步的；旧编辑器在这段时间里还能触发一次自动保存
      markVaultDirty('worldEntries', 1)
      return emptyScan(root)
    })

    const result = await loadVault('B')

    expect(result.session.root).toBe('B')
    expect(h.roots).toContain('A')
    expect(h.files.get('A:世界观/测试笔记.md')).toContain('测试笔记')
    expect(currentStatus().pending).toBe(0)
  })

  it('换库要等在途 flush 结束，不在写盘中途切会话', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)

    let release: (value: unknown) => void = () => {}
    let entered: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    h.fs.writeTexts.mockImplementationOnce((root: string) => {
      h.roots.push(root)
      entered()
      return new Promise((resolve) => {
        release = resolve
      })
    })
    const writing = flushVaultWrites()
    await started

    let loaded = false
    const loading = loadVault('B').then((value) => {
      loaded = true
      return value
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(loaded).toBe(false)
    expect(getVaultSession()?.root).toBe('A')

    release([{ relPath: '世界观/测试笔记.md', ok: true, conflict: false, mtimeMs: 2, error: null }])
    await writing
    const result = await loading

    expect(result.session.root).toBe('B')
    expect(h.roots).toContain('A')
    expect(currentStatus().flushing).toBe(false)
  })

  it('刷新同一个库：冲突同样不能静默丢，必须先解决', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValue([
      {
        relPath: '世界观/测试笔记.md',
        ok: false,
        conflict: true,
        mtimeMs: 9,
        error: '磁盘上的文件已被外部修改',
      },
    ])

    const first = await drainVaultWrites()
    expect(first.conflicts).toHaveLength(1)
    expect(currentStatus().pending).toBe(1)

    await expect(loadVault('A')).rejects.toThrow(/未写入原笔记库/)
    expect(getVaultSession()?.root).toBe('A')
    expect(currentStatus().pending).toBe(1)
  })

  it('换到别的库：冲突也必须拒绝，不能顺手覆盖或丢掉', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValue([
      {
        relPath: '世界观/测试笔记.md',
        ok: false,
        conflict: true,
        mtimeMs: 9,
        error: '磁盘上的文件已被外部修改',
      },
    ])
    await drainVaultWrites()

    await expect(loadVault('B')).rejects.toThrow(/未写入原笔记库/)
    expect(getVaultSession()?.root).toBe('A')
  })

  it('刷新同一个库也挡普通写盘失败（不能把写不进去的改动当已采纳）', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValue([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])

    await expect(loadVault('A')).rejects.toThrow(/未写入原笔记库/)
    expect(getVaultSession()?.root).toBe('A')
    expect(currentStatus().pending).toBe(1)
  })

  it('旧库在途失败在换库后不得回填新库队列', async () => {
    sessionA()
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)

    let release: (value: unknown) => void = () => {}
    let entered: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    h.fs.writeTexts.mockImplementationOnce(() => {
      entered()
      return new Promise((resolve) => {
        release = resolve
      })
    })

    const writing = flushVaultWrites()
    await started

    // 强制切会话（模拟 provider 在 drain 之外的竞态）：旧 flush 还在飞
    resetVaultWriteState()
    const next = createVaultSession('B')
    setVaultSession(next)

    release([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])
    await writing

    expect(getVaultSession()?.root).toBe('B')
    expect(getVaultSession()?.entries.size).toBe(0)
    expect(currentStatus().pending).toBe(0)
    expect(currentStatus().lastError).toBeNull()
  })
})

describe('F08 无独立文件标签的装载记录', () => {
  it('普通 frontmatter 标签也登记旧名字（relPath 为空）', async () => {
    h.fs.scan.mockResolvedValue({
      ...emptyScan('B'),
      files: [
        {
          relPath: '世界观/笔记.md',
          content: '---\ntitle: 笔记\ntags: [旧标签]\n---\n正文',
          size: 40,
          mtimeMs: 1,
        },
      ],
    })

    const result = await readVault('B')

    const tag = result.session.entries.get('tags:1')
    expect(tag).toBeDefined()
    expect(tag?.relPath).toBe('')
    expect((tag?.entity as { name?: string } | undefined)?.name).toBe('旧标签')
  })
})
