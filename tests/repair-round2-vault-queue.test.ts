import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 第二轮 A2 回归：Q03（最终回执只含未解决项）与 Q06（项目元信息失败可重试）。
 *
 * 只替换数据库与 IPC；队列、序列化、扫描跑真实实现。
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
    tables: [],
    transaction: async (...args: unknown[]) => {
      const run = args.at(-1) as (tx: object) => Promise<unknown>
      return run({})
    },
  }
  return {
    rows,
    db,
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
  currentStatus,
  drainVaultWrites,
  markVaultDirty,
  resetVaultWriteState,
} from '@/lib/vault/vault-persist'
import { createVaultSession, getVaultSession, setVaultSession } from '@/lib/vault/vault-session'
import { scanVault } from '@/lib/vault/scan'
import { applyDocumentBodies } from '@/lib/vault/markdown-bridge'
import { discardConflict } from '@/lib/vault/vault-persist'

const note = (id: number, title = '测试笔记', extra: Record<string, unknown> = {}) => ({
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
})

const stateOf = (row: Record<string, unknown>, relPath: string, frontmatter: Record<string, unknown> = {}) => ({
  table: 'worldEntries' as const,
  id: row.id as number,
  kind: 'worldEntry' as const,
  relPath,
  content: '',
  mtimeMs: 1,
  entity: structuredClone(row),
  frontmatter,
  bodyMarkdown: '',
  bodyDoc: 'null',
  trashed: false,
})

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

describe('Q03 drain 最终回执', () => {
  it('plans forward and circular links before serializing a batch of same-name notes', async () => {
    const body = (id: number) => ({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'wikiLink', attrs: { id: String(id), label: '链接' } },
    ] }] })
    h.rows.worldEntries.set(1, note(1, '同名', { document: body(2) }))
    h.rows.worldEntries.set(2, note(2, '同名', { document: body(1) }))
    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)
    const report = await drainVaultWrites()
    expect(report.errors).toEqual([])
    expect(report.written).toBe(2)
    const scan = scanVault({ root: 'memory-only', files: [...h.files].map(([relPath, content]) => ({
      relPath, content, mtimeMs: 2, size: content.length,
    })), skippedDirs: [], marker: null })
    applyDocumentBodies(scan)
    const first = scan.dataset.worldEntries.find((item) => item.relPath.endsWith('/同名.md'))!
    const second = scan.dataset.worldEntries.find((item) => item.relPath.endsWith('/同名 (2).md'))!
    const target = (entity: unknown): string | undefined =>
      (entity as { document?: { content?: { content?: { attrs?: { id?: string } }[] }[] } })
        .document?.content?.[0]?.content?.[0]?.attrs?.id
    expect(String(target(first.entity))).toBe(String(second.entity.id))
    expect(String(target(second.entity))).toBe(String(first.entity.id))
  })

  it('can discard a new-file collision before that entity has a loaded byPath entry', async () => {
    h.rows.worldEntries.set(1, note(1, '外部已新建'))
    h.fs.writeTexts.mockResolvedValueOnce([{ relPath: '世界观/外部已新建.md', ok: false, conflict: true, mtimeMs: 8 }])
    markVaultDirty('worldEntries', 1)
    await drainVaultWrites()
    expect(currentStatus().pending).toBe(1)
    discardConflict('世界观/外部已新建.md')
    expect(currentStatus().pending).toBe(0)
    expect((await drainVaultWrites()).written).toBe(0)
  })

  it('Q07 正常写入对照：成功写盘没有冲突/错误', async () => {
    h.rows.worldEntries.set(1, note(1))
    markVaultDirty('worldEntries', 1)

    const report = await drainVaultWrites()

    expect(report.written).toBe(1)
    expect(report.conflicts).toEqual([])
    expect(report.errors).toEqual([])
    expect(report.attempts).toEqual([])
    expect(currentStatus().pending).toBe(0)
  })

  it('覆盖冲突第二轮成功后，最终回执不再报旧 conflict，但尝试历史保留', async () => {
    const source = note(1, '冲突笔记', { summary: '盘上旧版' })
    h.rows.worldEntries.set(1, { ...source, summary: '编辑器新版' })
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.entries.set(
      'worldEntries:1',
      stateOf(source, '世界观/冲突笔记.md', { title: '冲突笔记', summary: '盘上旧版' }),
    )
    session.byPath.set('世界观/冲突笔记.md', 'worldEntries:1')

    h.fs.writeTexts.mockImplementationOnce(async (_root, entries) =>
      entries.map((entry: { relPath: string }) => ({
        relPath: entry.relPath,
        ok: false,
        conflict: true,
        mtimeMs: 8,
        error: 'external edit',
      })),
    )

    markVaultDirty('worldEntries', 1)
    const report = await drainVaultWrites({ overwriteConflicts: true })

    expect(currentStatus().pending).toBe(0)
    expect([...h.files.values()].join('')).toContain('编辑器新版')
    expect(report.conflicts).toEqual([])
    expect(report.errors).toEqual([])
    expect(report.attempts).toEqual([
      { relPath: '世界观/冲突笔记.md', outcome: 'conflict', message: '磁盘上的文件已被外部修改' },
    ])
    expect(report.resolvedPaths).toContain('世界观/冲突笔记.md')
  })

  it('混合：已覆盖成功的冲突不再报，仍未解决的冲突保留', async () => {
    const a = note(1, '已解决', { summary: '编辑器新版' })
    const b = note(2, '仍冲突', { summary: '编辑器新版' })
    const aState = note(1, '已解决', { summary: '盘上旧版' })
    const bState = note(2, '仍冲突', { summary: '盘上旧版' })
    h.rows.worldEntries.set(1, a)
    h.rows.worldEntries.set(2, b)
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.entries.set(
      'worldEntries:1',
      stateOf(aState, '世界观/已解决.md', { title: '已解决', summary: '盘上旧版' }),
    )
    session.entries.set(
      'worldEntries:2',
      stateOf(bState, '世界观/仍冲突.md', { title: '仍冲突', summary: '盘上旧版' }),
    )
    session.byPath.set('世界观/已解决.md', 'worldEntries:1')
    session.byPath.set('世界观/仍冲突.md', 'worldEntries:2')

    markVaultDirty('worldEntries', 1)
    markVaultDirty('worldEntries', 2)

    let resolvedConflictServed = false
    h.fs.writeTexts.mockImplementation(async (_root, entries: { relPath: string; content: string }[]) =>
      entries.map((entry) => {
        if (entry.relPath === '世界观/已解决.md' && !resolvedConflictServed) {
          resolvedConflictServed = true
          return {
            relPath: entry.relPath,
            ok: false,
            conflict: true,
            mtimeMs: 8,
            error: 'external edit',
          }
        }
        if (entry.relPath === '世界观/仍冲突.md') {
          return {
            relPath: entry.relPath,
            ok: false,
            conflict: true,
            mtimeMs: 9,
            error: 'external edit',
          }
        }
        h.files.set(entry.relPath, entry.content)
        return { relPath: entry.relPath, ok: true, conflict: false, mtimeMs: 2, error: null }
      }),
    )

    const report = await drainVaultWrites({ overwriteConflicts: true })

    expect(report.conflicts).toEqual(['世界观/仍冲突.md'])
    expect(report.conflicts).not.toContain('世界观/已解决.md')
    expect(report.errors).toEqual([])
    expect(currentStatus().pending).toBe(1)
    expect(h.files.get('世界观/已解决.md')).toContain('编辑器新版')
  })
})

describe('Q06 项目元信息失败可重试', () => {
  it('普通失败：任务留在队列；解除故障后重试写盘并可重扫恢复', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.marker = {
      relPath: 'oc-studio.json',
      content: JSON.stringify({
        app: 'oc-studio',
        schemaVersion: 1,
        project: { worldName: '旧世界', tagline: '旧简介', cover: '旧封面.png' },
      }),
    }
    h.rows.meta.set(1, {
      id: 1,
      worldName: '新世界',
      tagline: '新简介',
      coverUrl: '新封面.png',
    })
    markVaultDirty('meta', 1)

    h.fs.writeTexts.mockResolvedValueOnce([
      { relPath: 'oc-studio.json', ok: false, conflict: false, mtimeMs: null, error: 'disk full' },
    ])
    const first = await drainVaultWrites()

    expect(first.errors).toEqual([{ relPath: 'oc-studio.json', message: 'disk full' }])
    expect(currentStatus().pending).toBe(1)
    expect(currentStatus().failed).toBe(1)

    const second = await drainVaultWrites()

    expect(second.written).toBe(1)
    expect(second.errors).toEqual([])
    expect(currentStatus().pending).toBe(0)

    const marker = h.files.get('oc-studio.json')
    expect(marker).toContain('新世界')
    expect(marker).toContain('新简介')
    expect(marker).toContain('新封面.png')

    const scanned = scanVault({
      root: 'memory-only',
      files: [],
      skippedDirs: [],
      marker: marker ?? null,
    })
    expect(scanned.dataset.project?.entity.worldName).toBe('新世界')
    expect(scanned.dataset.project?.entity.tagline).toBe('新简介')
    expect(scanned.dataset.project?.entity.coverUrl).toBe('新封面.png')
  })

  it('空回执也算未确认：任务留在队列，重试成功后才确认', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.marker = {
      relPath: 'oc-studio.json',
      content: JSON.stringify({ app: 'oc-studio', schemaVersion: 1, project: { worldName: '旧世界' } }),
    }
    h.rows.meta.set(1, { id: 1, worldName: '新世界', tagline: '', coverUrl: '' })
    markVaultDirty('meta', 1)

    h.fs.writeTexts.mockResolvedValueOnce([])
    const first = await drainVaultWrites()

    expect(first.errors).toEqual([{ relPath: 'oc-studio.json', message: '写盘回执缺失' }])
    expect(currentStatus().pending).toBe(1)

    const second = await drainVaultWrites()
    expect(second.written).toBe(1)
    expect(second.errors).toEqual([])
    expect(h.files.get('oc-studio.json')).toContain('新世界')
  })

  it('整次 IPC 拒绝同样保留任务，重试后恢复', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.marker = {
      relPath: 'oc-studio.json',
      content: JSON.stringify({ app: 'oc-studio', schemaVersion: 1, project: { worldName: '旧世界' } }),
    }
    h.rows.meta.set(1, { id: 1, worldName: '新世界', tagline: '', coverUrl: '' })
    markVaultDirty('meta', 1)

    h.fs.writeTexts.mockRejectedValueOnce(new Error('ipc down'))
    const first = await drainVaultWrites()
    expect(first.errors.length).toBeGreaterThan(0)
    expect(currentStatus().pending).toBe(1)

    const second = await drainVaultWrites()
    expect(second.errors).toEqual([])
    expect(h.files.get('oc-studio.json')).toContain('新世界')
  })

  it('没有标记文件时不建文件，也不留任务', async () => {
    h.rows.meta.set(1, { id: 1, worldName: '新世界', tagline: '', coverUrl: '' })
    markVaultDirty('meta', 1)

    const report = await drainVaultWrites()

    expect(report.written).toBe(0)
    expect(report.errors).toEqual([])
    expect(currentStatus().pending).toBe(0)
    expect(h.files.has('oc-studio.json')).toBe(false)
  })

  it('tags.json 空回执同样不能确认：留下 dirty 并报错，重试成功后才清', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')
    session.tagMeta.entries.set('标签', { color: '#abc', category: '' })
    session.tagMeta.dirty = true

    h.fs.writeTexts.mockResolvedValueOnce([])
    const first = await drainVaultWrites()

    expect(first.errors).toEqual([{ relPath: '.ocstudio/tags.json', message: '写盘回执缺失' }])
    expect(session.tagMeta.dirty).toBe(true)

    const second = await drainVaultWrites()
    expect(second.written).toBe(1)
    expect(second.errors).toEqual([])
    expect(session.tagMeta.dirty).toBe(false)
    expect(h.files.get('.ocstudio/tags.json')).toContain('标签')
  })
})
