import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 落盘队列回归（审查 F01 / F02 / F03 / F12）。
 *
 * 只替换数据库与 IPC：队列、序列化、路径分配、扫描都跑真实实现。
 * 原始探针在 `tmp/review-20261114/`，这里补正式回归，覆盖正常路径、
 * 失败后重试、同批冲突与新修订，不只把失败用例翻绿。
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
  const db = {
    ...Object.fromEntries(names.map((name) => [name, table(name)])),
    table,
    transaction: async (...args: unknown[]) => {
      const run = args.at(-1) as () => Promise<unknown>
      return run()
    },
  }
  return {
    rows,
    db,
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
  appendJournal: async () => {},
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  readJournalLines: async () => [],
  mergeJournalLines: () => [],
}))

import {
  currentStatus,
  drainVaultWrites,
  flushVaultWrites,
  markVaultDirty,
  resetVaultWriteState,
  settleVaultWritesBeforeSwitch,
} from '@/lib/vault/vault-persist'
import { scanVault } from '@/lib/vault/scan'
import {
  createVaultSession,
  getVaultSession,
  setVaultSession,
  type VaultEntryState,
} from '@/lib/vault/vault-session'

interface NoteRow {
  id: number
  title: string
  category: string
  content: string
  parentId: number | null
  tags: number[]
  order: number
  createdAt: number
  updatedAt: number
  deleted: boolean
  [key: string]: unknown
}

function note(id: number, title = '测试笔记', extra: Record<string, unknown> = {}): NoteRow {
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
    ...extra,
  }
}

function row(map: Map<number, Record<string, unknown>>, id: number): NoteRow {
  const value = map.get(id)
  if (value === undefined) throw new Error(`缺少测试行 ${id}`)
  return value as unknown as NoteRow
}

function entryState(rowValue: NoteRow, relPath: string, frontmatter: Record<string, unknown> = {}): VaultEntryState {
  return {
    table: 'worldEntries',
    id: rowValue.id,
    kind: 'worldEntry',
    relPath,
    content: '',
    mtimeMs: 1,
    entity: structuredClone(rowValue),
    frontmatter,
    bodyMarkdown: '',
    bodyDoc: 'null',
    trashed: false,
  }
}

function texts(): { relPath: string; content: string; createOnly?: boolean }[] {
  return h.fs.writeTexts.mock.calls.flatMap((call) => call[1])
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const table of Object.values(h.rows)) table.clear()
  h.files.clear()
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

describe('F01 同批新建的路径唯一性', () => {
  it('同一批两篇同名笔记拿到不同路径', async () => {
    h.rows.worldEntries.set(1, note(1))
    h.rows.worldEntries.set(2, note(2))
    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)

    const report = await drainVaultWrites()

    const paths = h.fs.writeTexts.mock.calls[0][1].map((entry: { relPath: string }) => entry.relPath)
    expect(new Set(paths).size).toBe(2)
    expect(report.written).toBe(2)
    expect(h.files.size).toBe(2)
  })

  it('同批 100 篇同名也不重不漏', async () => {
    for (let id = 1; id <= 100; id += 1) {
      h.rows.worldEntries.set(id, note(id))
      markVaultDirty('worldEntries', id)
    }

    const report = await drainVaultWrites()

    const paths = texts().map((entry) => entry.relPath)
    expect(new Set(paths).size).toBe(100)
    expect(report.written).toBe(100)
    expect(h.files.size).toBe(100)

    // 写入数、不同路径数、重扫实体数三者一致
    const scanned = scanVault({
      root: 'memory-only',
      files: [...h.files].map(([relPath, content]) => ({
        relPath,
        content,
        size: content.length,
        mtimeMs: 2,
      })),
      skippedDirs: [],
      marker: null,
    })
    expect(scanned.dataset.worldEntries).toHaveLength(100)
  })

  it('Windows 大小写等价也算已占用', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.occupied.add('世界观/测试笔记.MD')
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)

    await drainVaultWrites()

    const [write] = texts()
    expect(write.relPath).toBe('世界观/测试笔记 (2).md')
  })

  it('清洗后同名（非法字符被替换）也不撞车', async () => {
    h.rows.worldEntries.set(1, note(1, 'a/b'))
    h.rows.worldEntries.set(2, note(2, 'a:b'))
    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)

    await drainVaultWrites()

    const paths = texts().map((entry) => entry.relPath)
    expect(new Set(paths).size).toBe(2)
  })

  it('不同分类的同名条目也各落一份', async () => {
    h.rows.worldEntries.set(1, note(1, '同名', { category: '宠物' }))
    h.rows.worldEntries.set(2, note(2, '同名', { category: '武器' }))
    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)

    await drainVaultWrites()

    const paths = texts().map((entry) => entry.relPath)
    expect(new Set(paths).size).toBe(2)
  })

  it('新建失败后被删除，预留路径要收回给下一个同名条目', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValueOnce([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])
    await drainVaultWrites()
    expect(currentStatus().pending).toBe(1)

    h.rows.worldEntries.set(1, note(1, '测试笔记', { deleted: true }))
    markVaultDirty('worldEntries', 1)
    await drainVaultWrites()

    h.rows.worldEntries.set(2, note(2))
    markVaultDirty('worldEntries', 2)
    h.fs.writeTexts.mockClear()
    await drainVaultWrites()

    const last = h.fs.writeTexts.mock.calls.at(-1)?.[1] as { relPath: string }[]
    expect(last[0].relPath).toBe('世界观/测试笔记.md')
  })

  it('新建写入带 createOnly，已有文件写入不带', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    await drainVaultWrites()

    const [created] = texts()
    expect(created.createOnly).toBe(true)

    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.entries.set('worldEntries:1', entryState(row(h.rows.worldEntries, 1), '世界观/测试笔记.md', { title: '测试笔记' }))
    h.rows.worldEntries.set(1, note(1, '改过的标题'))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockClear()

    await drainVaultWrites()

    const [updated] = texts()
    expect(updated.createOnly).toBe(false)
  })
})

describe('F02 失败后任务留在队列并可重试', () => {
  it('普通写盘失败：保留 pending，修好后重试用同一个路径', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValueOnce([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])

    const failed = await drainVaultWrites()

    expect(failed.errors).toHaveLength(1)
    expect(currentStatus().pending).toBe(1)
    expect(currentStatus().failed).toBe(1)

    const firstPath = h.fs.writeTexts.mock.calls[0][1][0].relPath
    h.fs.writeTexts.mockClear()
    const retried = await drainVaultWrites()

    expect(retried.written).toBe(1)
    expect(currentStatus().pending).toBe(0)
    expect(currentStatus().failed).toBe(0)
    expect(h.fs.writeTexts.mock.calls[0][1][0].relPath).toBe(firstPath)
  })

  it('整次 IPC 拒绝：所有未确认任务都回填', async () => {
    h.rows.worldEntries.set(1, note(1, '甲'))
    h.rows.worldEntries.set(2, note(2, '乙'))
    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)
    h.fs.writeTexts.mockRejectedValueOnce(new Error('ipc down'))

    const failed = await drainVaultWrites()

    expect(failed.errors.length).toBeGreaterThan(0)
    expect(currentStatus().pending).toBe(2)

    const retried = await drainVaultWrites()
    expect(retried.written).toBe(2)
    expect(currentStatus().pending).toBe(0)
  })

  it('部分成功：成功的确认，失败的那条留在队列', async () => {
    h.rows.worldEntries.set(1, note(1, '成功'))
    h.rows.worldEntries.set(2, note(2, '失败'))
    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)
    h.fs.writeTexts.mockImplementationOnce(
      async (_root: string, entries: { relPath: string; content: string }[]) =>
        entries.map((entry, index) => {
          if (index === 0) h.files.set(entry.relPath, entry.content)
          return index === 0
            ? { relPath: entry.relPath, ok: true, conflict: false, mtimeMs: 2, error: null }
            : { relPath: entry.relPath, ok: false, conflict: false, mtimeMs: null, error: 'disk full' }
        }),
    )

    const partial = await drainVaultWrites()

    expect(partial.written).toBe(1)
    expect(partial.errors).toHaveLength(1)
    expect(currentStatus().pending).toBe(1)
    expect(h.files.size).toBe(1)

    h.fs.writeTexts.mockClear()
    const retried = await drainVaultWrites()
    expect(retried.written).toBe(1)
    expect(h.fs.writeTexts.mock.calls[0][1]).toHaveLength(1)
    expect(currentStatus().pending).toBe(0)
  })

  it('旧失败不覆盖在途新修订：重试写入的是新内容', async () => {
    h.rows.worldEntries.set(1, note(1, '版本 A'))
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

    // flush 读取行之后、写盘回执之前，用户又改了这条（修订号 +1）
    h.rows.worldEntries.set(1, note(1, '版本 B'))
    markVaultDirty('worldEntries', 1)

    release([
      { relPath: '世界观/版本 A.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])
    const report = await writing

    expect(report.errors).toHaveLength(1)
    expect(currentStatus().pending).toBe(1)
    // 旧任务失败不能把新修订标成「失败」并阻止下一次尝试
    expect(currentStatus().failed).toBe(0)

    const retried = await drainVaultWrites()
    expect(retried.written).toBe(1)
    const content = h.fs.writeTexts.mock.calls.at(-1)?.[1][0].content as string
    expect(content).toContain('版本 B')
    expect(content).not.toContain('版本 A')
  })

  it('失败后不会无限自动重试', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValueOnce([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])

    await drainVaultWrites()
    expect(h.fs.writeTexts).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.fs.writeTexts).toHaveBeenCalledTimes(1)
    expect(currentStatus().pending).toBe(1)
  })

  it('tags.json 写失败不会在自动 flush 里反复重试，显式重试仍会写', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.tagMeta.entries.set('标签', { color: '#abc', category: '' })
    session.tagMeta.dirty = true

    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockImplementation(
      async (_root: string, entries: { relPath: string; content: string }[]) =>
        entries.map((entry) =>
          entry.relPath === '.ocstudio/tags.json'
            ? { relPath: entry.relPath, ok: false, conflict: false, mtimeMs: null, error: 'disk full' }
            : { relPath: entry.relPath, ok: true, conflict: false, mtimeMs: 2, error: null },
        ),
    )

    const metaWrites = () => texts().filter((entry) => entry.relPath === '.ocstudio/tags.json').length

    await flushVaultWrites()
    expect(currentStatus().pending).toBe(0)
    expect(metaWrites()).toBe(1)
    expect(session.tagMeta.dirty).toBe(true)

    // 新任务触发的自动 flush：只写实体，不再撞 tags.json 的同一个错
    h.rows.worldEntries.set(2, note(2, '第二个'))
    markVaultDirty('worldEntries', 2)
    await vi.advanceTimersByTimeAsync(400)
    expect(currentStatus().pending).toBe(0)
    expect(metaWrites()).toBe(1)

    // 显式 drain 仍会重试（用户点「重试保存」/ 关窗 / 换库）
    h.fs.writeTexts.mockImplementation(
      async (_root: string, entries: { relPath: string; content: string }[]) =>
        entries.map((entry) => {
          h.files.set(entry.relPath, entry.content)
          return { relPath: entry.relPath, ok: true, conflict: false, mtimeMs: 2, error: null }
        }),
    )
    const report = await drainVaultWrites()
    expect(report.written).toBe(1)
    expect(metaWrites()).toBe(2)
    expect(session.tagMeta.dirty).toBe(false)
  })

  it('用户再改一次会给失败任务新的自动重试机会', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValueOnce([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])
    await drainVaultWrites()
    expect(currentStatus().failed).toBe(1)

    h.rows.worldEntries.set(1, note(1, '改过'))
    markVaultDirty('worldEntries', 1)
    expect(currentStatus().failed).toBe(0)

    await vi.advanceTimersByTimeAsync(1000)
    expect(h.fs.writeTexts).toHaveBeenCalledTimes(2)
    expect(currentStatus().pending).toBe(0)
  })
})

describe('F03 drain 保存屏障', () => {
  it('等待已在跑的 flush，并处理期间新排进来的写入', async () => {
    h.rows.worldEntries.set(1, note(1, '第一个'))
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

    // 在途 flush 的 batch 已经取走；这条只会在 drain 的「后续一轮」里写
    h.rows.worldEntries.set(2, note(2, '第二个'))
    markVaultDirty('worldEntries', 2)

    let drained = false
    const draining = drainVaultWrites().then((report) => {
      drained = true
      return report
    })

    // drain 不能在写入未确认时提前返回
    await Promise.resolve()
    await Promise.resolve()
    expect(drained).toBe(false)

    h.files.set('世界观/第一个.md', '---\ntitle: 第一个\n---\n')
    release([{ relPath: '世界观/第一个.md', ok: true, conflict: false, mtimeMs: 2, error: null }])
    const report = await draining
    await writing

    expect(drained).toBe(true)
    expect(currentStatus().flushing).toBe(false)
    expect(report.written).toBe(2)
    expect(h.files.has('世界观/第一个.md')).toBe(true)
    expect(h.files.has('世界观/第二个.md')).toBe(true)
  })

  it('在途 flush 的错误会出现在 drain 的汇总回执里', async () => {
    h.rows.worldEntries.set(1, note(1, '会失败'))
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
    const draining = drainVaultWrites()
    release([
      { relPath: '世界观/会失败.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])

    const report = await draining
    await writing

    // 第一次失败留下任务，drain 的后续一轮把它写成功：最终回执不报旧错误，
    // 但尝试历史里仍能看到这次失败（Q03 的「最终状态 / 历史」分离）
    expect(report.errors).toEqual([])
    expect(report.attempts?.some((attempt) => attempt.outcome === 'error')).toBe(true)
    expect(report.written).toBe(1)
    expect(currentStatus().pending).toBe(0)
  })

  it('排不干时拒绝换库，而不是清空队列', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)
    h.fs.writeTexts.mockResolvedValue([
      { relPath: '世界观/测试笔记.md', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])

    await expect(settleVaultWritesBeforeSwitch()).rejects.toThrow(/未写入原笔记库/)
    expect(currentStatus().pending).toBe(1)
  })
})

describe('F12 小说落点', () => {
  it('旧小说只在回收站时，新小说不落 .ocstudio', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    const old = note(1, '旧书', { category: '小说', deleted: true })
    session.entries.set('worldEntries:1', {
      ...entryState(old, '.ocstudio/trash/20260101-000000/小说/旧书.md'),
      trashed: true,
    })
    h.rows.worldEntries.set(2, note(2, '新书', { category: '小说' }))
    markVaultDirty('worldEntries', 2)

    await drainVaultWrites()

    expect(texts()[0].relPath).toBe('小说/新书.md')
  })

  it('软删除但还没挪进回收站的旧小说也不参与推断', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    const old = note(1, '旧书', { category: '小说', deleted: true })
    session.entries.set('worldEntries:1', entryState(old, '旧小说/旧书.md'))
    h.rows.worldEntries.set(2, note(2, '新书', { category: '小说' }))
    markVaultDirty('worldEntries', 2)

    await drainVaultWrites()

    expect(texts()[0].relPath).toBe('小说/新书.md')
  })

  it('已有活跃小说时沿用它的目录', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    const old = note(1, '旧书', { category: '小说' })
    session.entries.set('worldEntries:1', entryState(old, '作品/旧书.md'))
    h.rows.worldEntries.set(2, note(2, '新书', { category: '小说' }))
    markVaultDirty('worldEntries', 2)

    await drainVaultWrites()

    expect(texts()[0].relPath).toBe('作品/新书.md')
  })
})
