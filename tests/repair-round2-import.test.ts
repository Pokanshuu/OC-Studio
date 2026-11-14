import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 第二轮返工的正式回归（Codex 独立验收 Q01 / Q02）。
 *
 * Q01：备份里**多个源行覆盖同一个目标**时，引用只能按「最终写进库里的那一版」映射一次。
 *     按源行遍历会把已经映射过的目标 id（如 countryId=50）当成备份编号再查一遍映射表，
 *     查不到就清成 null —— 正常引用就这么丢了。
 *
 * Q02：正文引用的 `attrs.raw` 记的是**源库**的链接原文，序列化优先写 raw。只改 id 不改 raw
 *     的话，写回磁盘的 `[[同名角色|昵称]]` 重扫后会绑到同名的另一条实体上。导入时必须按
 *     目标**实际落盘身份**重建引用，同时保住用户的别名与锚点；缺失目标只能留纯文字。
 *
 * 这里只用内存替身替换存储与 IPC（Dexie 表、vault 文件系统、设置恢复、journal），
 * 导入、重映射、序列化、扫描、物化（export-dir）跑的都是真实实现。
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tableNames = ['characters', 'events', 'countries', 'worldEntries', 'tags', 'periods', 'meta', 'operationLog']
  const rows = new Map<string, Map<number, Row>>()
  for (const name of tableNames) rows.set(name, new Map())

  function tableOf(name: string) {
    const store = () => {
      const found = rows.get(name)
      if (found === undefined) throw new Error(`没有这张表：${name}`)
      return found
    }
    return {
      toArray: async (): Promise<Row[]> => [...store().values()].map((row) => structuredClone(row)),
      get: async (id: number): Promise<Row | undefined> => {
        const row = store().get(id)
        return row === undefined ? undefined : structuredClone(row)
      },
      update: async (id: number, patch: Row): Promise<number> => {
        const row = store().get(id)
        if (row === undefined) return 0
        store().set(id, { ...row, ...structuredClone(patch) })
        return 1
      },
      put: async (row: Row): Promise<number> => {
        const id = Number(row.id)
        store().set(id, structuredClone(row))
        return id
      },
      clear: async (): Promise<void> => {
        store().clear()
      },
      bulkAdd: async (records: Row[]): Promise<number> => {
        let key = Math.max(0, ...store().keys())
        for (const record of records) {
          key = typeof record.id === 'number' ? record.id : key + 1
          store().set(key, { ...structuredClone(record), id: key })
        }
        return key
      },
    }
  }

  const db: Record<string, unknown> = {}
  for (const name of tableNames) db[name] = tableOf(name)
  db.transaction = async (...args: unknown[]): Promise<unknown> => {
    const callback = args[args.length - 1]
    if (typeof callback !== 'function') return undefined
    return (callback as () => Promise<unknown>)()
  }

  const files = new Map<string, string>()
  const fs = {
    mkdir: vi.fn(),
    scan: vi.fn(),
    exists: vi.fn(),
    readBytes: vi.fn(),
    writeTexts: vi.fn(),
    writeBytes: vi.fn(),
    importFile: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    listAssets: vi.fn(),
  }

  return { rows, db, files, fs }
})

vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/vault/vault-fs', () => ({ vaultFs: h.fs, isVaultSupported: () => false }))
vi.mock('@/lib/vault/journal', () => ({
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  appendJournal: async () => {},
  mergeJournalLines: () => [],
  readJournalLines: async () => [],
}))
vi.mock('@/lib/export/backup-config', () => ({
  restoreBackupConfig: async () => ({ restored: [], kept: [], reasons: [] }),
}))

import { importData, type MergeStrategy } from '@/lib/import'
import { remapRowRefs, type IdMaps } from '@/lib/import-remap'
import { applyDocumentBodies, createLinkSerializer, serializeBody } from '@/lib/vault/markdown-bridge'
import { scanVault } from '@/lib/vault/scan'
import { readVault } from '@/lib/vault/vault-load'
import { exportLegacyToFolder } from '@/lib/vault/export-dir'
import { createEntityPathIndex, fileBaseOfRelPath } from '@/lib/vault/reference-paths'

/* ── 内存库 / 内存文件夹 ──────────────────────────────────────── */

function store(name: string): Map<number, Row> {
  const found = h.rows.get(name)
  if (found === undefined) throw new Error(`没有这张表：${name}`)
  return found
}

function seed(table: string, row: Row): void {
  store(table).set(Number(row.id), structuredClone(row))
}

function read(table: string, id: number): Row | undefined {
  const row = store(table).get(id)
  return row === undefined ? undefined : structuredClone(row)
}

function rowsOf(table: string): Row[] {
  return [...store(table).values()].sort((a, b) => Number(a.id) - Number(b.id)).map((row) => structuredClone(row))
}

function note(extra: Row = {}): Row {
  return {
    title: '未命名',
    aliases: [],
    content: '',
    category: '',
    parentId: null,
    order: 0,
    isConcept: false,
    tags: [],
    relations: [],
    references: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...extra,
  }
}

/** 完整角色行：物化到磁盘时要过 `serializeCharacter`（它要求 relatedCharacters 等数组在场） */
function characterOf(id: number, name: string, extra: Row = {}): Row {
  return {
    id,
    name,
    aliases: [],
    race: '',
    element: '',
    occupation: '',
    faction: '',
    nationalityLegacy: '',
    height: '',
    birthday: '',
    avatarUrl: '',
    bio: '',
    lifeStory: '',
    relatedCharacters: [],
    relatedNotes: [],
    gallery: [],
    avatars: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...extra,
  }
}

function countryOf(id: number, name: string, extra: Row = {}): Row {
  return {
    id,
    name,
    aliases: [],
    parentId: null,
    description: '',
    system: '',
    geography: '',
    culture: '',
    gallery: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...extra,
  }
}

function eventOf(id: number, title: string, extra: Row = {}): Row {
  return {
    id,
    title,
    aliases: [],
    time: '',
    location: '',
    summary: '',
    content: '',
    characters: [],
    countries: [],
    parentEventId: null,
    relations: [],
    tags: [],
    images: [],
    isMajor: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...extra,
  }
}

function mention(id: string | number, entityType: string, label: string, raw?: string): Row {
  return { type: 'mention', attrs: { id, entityType, label, ...(raw === undefined ? {} : { raw }) } }
}

function wikiLink(id: string | number, label: string, raw?: string): Row {
  return { type: 'wikiLink', attrs: { id, label, ...(raw === undefined ? {} : { raw }) } }
}

function docWith(...nodes: unknown[]): Row {
  return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] }
}

function payloadOf(data: Partial<Record<string, unknown[]>>): Record<string, unknown> {
  return {
    version: 1,
    exportedAt: '2026-11-14T00:00:00.000Z',
    data: {
      characters: [],
      events: [],
      countries: [],
      worldEntries: [],
      tags: [],
      periods: [],
      meta: [],
      ...data,
    },
  }
}

function mapsOf(input: Partial<Record<keyof IdMaps, ReadonlyArray<readonly [number, number]>>> = {}): IdMaps {
  return {
    characters: new Map(input.characters ?? []),
    countries: new Map(input.countries ?? []),
    events: new Map(input.events ?? []),
    worldEntries: new Map(input.worldEntries ?? []),
    tags: new Map(input.tags ?? []),
  }
}

function firstAttrs(document: unknown, index = 0, paragraph = 0): Record<string, unknown> {
  const doc = document as { content: Array<{ content: Array<{ attrs: Record<string, unknown> }> }> }
  return doc.content[paragraph].content[index].attrs
}

function docOf(entity: { document?: unknown } | undefined): unknown {
  return entity?.document
}

/* ── 内存文件夹（vaultFs 替身）：export-dir 与 readVault 共用 ─── */

function installFakeVaultFs(): void {
  h.fs.mkdir.mockResolvedValue(undefined)
  h.fs.listAssets.mockResolvedValue([])
  h.fs.exists.mockImplementation(async (_root: string, path: string) => h.files.has(path))
  h.fs.readBytes.mockImplementation(async (_root: string, path: string) => {
    const content = h.files.get(path)
    if (content === undefined) throw new Error(`missing file: ${path}`)
    return Array.from(new TextEncoder().encode(content))
  })
  h.fs.scan.mockImplementation(async (root: string) => ({
    root,
    files: [...h.files]
      .filter(([path]) => path.endsWith('.md') && !path.startsWith('.ocstudio/'))
      .map(([relPath, content]) => ({
        relPath,
        content,
        size: new TextEncoder().encode(content).length,
        mtimeMs: 2,
      })),
    skippedDirs: [] as string[],
    otherFiles: [...h.files.keys()].filter((path) => !path.endsWith('.md')),
    dirs: [] as string[],
    marker: null,
    warnings: [] as string[],
    truncated: false,
  }))
  h.fs.writeTexts.mockImplementation(async (_root: string, entries: { relPath: string; content: string }[]) =>
    entries.map((entry) => {
      h.files.set(entry.relPath, entry.content)
      return { relPath: entry.relPath, ok: true, mtimeMs: 2 }
    }),
  )
  h.fs.writeBytes.mockResolvedValue(undefined)
  h.fs.importFile.mockResolvedValue(undefined)
  h.fs.move.mockImplementation(async (_root: string, from: string, to: string) => {
    const content = h.files.get(from)
    if (content === undefined) throw new Error(`missing: ${from}`)
    h.files.delete(from)
    h.files.set(to, content)
  })
  h.fs.remove.mockResolvedValue(undefined)
}

beforeEach(() => {
  for (const name of h.rows.keys()) store(name).clear()
  h.files.clear()
  vi.clearAllMocks()
  installFakeVaultFs()
})

/* ══ Q01：重复源身份 ═══════════════════════════════════════════ */

describe('Q01 · 多个源行覆盖同一个目标：每条目标只映射一次', () => {
  it('两条同名角色覆盖同一目标：countryId 映射到 50，报告与处理一致', async () => {
    seed('countries', { id: 50, name: '既有国家' })
    seed('characters', { id: 90, name: '同名角色', countryId: null })

    const result = await importData(
      payloadOf({
        countries: [{ id: 1, name: '既有国家' }],
        characters: [
          { id: 1, name: '同名角色', countryId: 1 },
          { id: 2, name: '同名角色', countryId: 1 },
        ],
      }),
      'overwrite',
    )

    const character = read('characters', 90)
    // 关键：50 是**目标 id**，不能再当成备份编号映射一次（那会查不到并清空）
    expect(character?.countryId).toBe(50)
    expect(read('countries', 50)?.name).toBe('既有国家')
    expect(result.droppedRefs).toBeUndefined()

    // 日志与实际一致：两条源行只写一条（国家覆盖 1 + 角色覆盖 1）
    expect(result.overwritten).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.added).toBe(0)
    expect(result.conflicts?.[0]?.reason).toContain('只有最后一条会写入')
  })

  it('标签 / 正文 / 命名关系也只映射一次', async () => {
    seed('countries', { id: 50, name: '既有国家' })
    seed('tags', { id: 70, name: '既有标签', color: '#fff', category: '' })
    seed('worldEntries', note({ id: 80, title: '既有笔记' }))
    seed('characters', { id: 90, name: '同名角色', countryId: null, tags: [] })

    const backupRefs = {
      id: 1,
      name: '同名角色',
      countryId: 1,
      tags: [1],
      relatedNotes: [{ targetId: 1, name: '既有笔记', relation: '主角' }],
      document: docWith(
        wikiLink(1, '既有笔记', '既有笔记|旧显示'),
        mention(1, 'country', '既有国家', '既有国家|旧国'),
      ),
    }

    const result = await importData(
      payloadOf({
        countries: [{ id: 1, name: '既有国家' }],
        tags: [{ id: 1, name: '既有标签', color: '#fff', category: '' }],
        worldEntries: [note({ id: 1, title: '既有笔记' })],
        characters: [backupRefs, { ...backupRefs, id: 2 }],
      }),
      'overwrite',
    )

    const character = read('characters', 90)
    expect(character?.countryId).toBe(50)
    expect(character?.tags).toEqual([70])
    expect(character?.relatedNotes).toEqual([{ targetId: 80, name: '既有笔记', relation: '主角' }])
    expect(String(firstAttrs(character?.document, 0).id)).toBe('80')
    expect(firstAttrs(character?.document, 0).label).toBe('既有笔记')
    expect(String(firstAttrs(character?.document, 1).id)).toBe('50')
    expect(result.droppedRefs).toBeUndefined()
    // 正文里两个引用都是「重绑定」：旧 raw 丢掉，不会写回源库的文件身份
    expect(firstAttrs(character?.document, 0).raw).toBeUndefined()
    expect(firstAttrs(character?.document, 1).raw).toBeUndefined()
  })

  it('同名但备份 id 不同：以最后一条源版本为准，且仍只映射一次', async () => {
    seed('countries', { id: 50, name: '甲国' })
    seed('countries', { id: 51, name: '乙国' })
    seed('characters', { id: 90, name: '同名角色', countryId: null })

    const result = await importData(
      payloadOf({
        // 两条国家都是新行（目标库没有同名）→ 分别落成 52 / 53
        countries: [
          { id: 1, name: '甲国新' },
          { id: 2, name: '乙国新' },
        ],
        characters: [
          { id: 1, name: '同名角色', countryId: 1 },
          { id: 2, name: '同名角色', countryId: 2 },
        ],
      }),
      'overwrite',
    )

    // 最后一条源版本（countryId=2 → 乙国新）才是写入的那一版
    const character = read('characters', 90)
    const country = read('countries', Number(character?.countryId))
    expect(country?.name).toBe('乙国新')
    expect(result.droppedRefs).toBeUndefined()
    expect(result.overwritten).toBe(1) // 只有角色被覆盖（国家是新增）
    expect(result.added).toBe(2)
    expect(result.skipped).toBe(1)
  })

  it('重复源 + 目标缺失：引用只断开一次（计数不翻倍）', async () => {
    seed('characters', { id: 90, name: '同名角色', countryId: null })

    const result = await importData(
      payloadOf({
        characters: [
          { id: 1, name: '同名角色', countryId: 9 },
          { id: 2, name: '同名角色', countryId: 9 },
        ],
      }),
      'overwrite',
    )

    expect(read('characters', 90)?.countryId).toBeNull()
    // 只按最终版本映射一次：清掉 1 条，而不是两条各清一次
    expect(result.droppedRefs).toBe(1)
  })

  it('目标库没有同名行时不去重：用户自己的两条同名条目都要导入', async () => {
    const result = await importData(
      payloadOf({
        characters: [
          { id: 1, name: '同名', race: '甲' },
          { id: 2, name: '同名', race: '乙' },
        ],
      }),
      'skip',
    )

    expect(result.added).toBe(2)
    expect(rowsOf('characters')).toHaveLength(2)
    expect(rowsOf('characters').map((row) => row.race).sort()).toEqual(['乙', '甲'])
  })

  it('keep-both：同名两条都导入，各自引用指向自己的新行', async () => {
    const result = await importData(
      payloadOf({
        countries: [
          { id: 1, name: '甲国' },
          { id: 2, name: '乙国' },
        ],
        characters: [
          { id: 1, name: '同名角色', countryId: 1 },
          { id: 2, name: '同名角色', countryId: 2 },
        ],
      }),
      'keep-both',
    )

    expect(result.added).toBe(4)
    const characters = rowsOf('characters')
    expect(characters.map((row) => read('countries', Number(row.countryId))?.name)).toEqual([
      '甲国',
      '乙国',
    ])
  })
})

/* ══ Q02：正文引用的落库身份 ═══════════════════════════════════ */

describe('Q02 · 正文引用按目标实际落盘身份重建', () => {
  it('remap → serializeBody → scan：同名目标写的是实际文件名（(2)），重扫指回导入的那一条', () => {
    const source = note({
      id: 2,
      title: '关系笔记',
      document: docWith(mention('1', 'character', '昵称', '同名角色|昵称')),
    })
    const remapped = { ...source, ...remapRowRefs('worldEntry', source, mapsOf({ characters: [[1, 101]] })).patch }

    // 目标在磁盘上叫 `同名角色 (2).md`（另一条同名条目占了 `同名角色.md`）
    const serialized = serializeBody(
      'worldEntry',
      remapped,
      createLinkSerializer(() => '同名角色', () => '同名角色 (2)'),
    )
    expect(serialized?.markdown).toContain('[[同名角色 (2)|昵称]]')

    const rescanned = scanVault({
      root: 'memory-only',
      files: [
        { relPath: '角色/同名角色.md', content: '---\nname: 同名角色\n---\n原有角色\n', mtimeMs: 1, size: 50 },
        { relPath: '角色/同名角色 (2).md', content: '---\nname: 同名角色\n---\n导入角色\n', mtimeMs: 1, size: 50 },
        { relPath: '世界观/关系笔记.md', content: `---\ntitle: 关系笔记\n---\n${serialized?.markdown ?? ''}`, mtimeMs: 1, size: 100 },
      ],
      skippedDirs: [],
      marker: null,
    })
    applyDocumentBodies(rescanned)

    const imported = rescanned.dataset.characters.find((row) => row.relPath === '角色/同名角色 (2).md')
    const restored = firstAttrs(rescanned.dataset.worldEntries[0].entity.document)
    expect(String(restored.id)).toBe(String(imported?.entity.id))
    expect(restored.label).toBe('昵称')
  })

  it('保留别名与锚点：写出 `[[文件#锚点|别名]]`，重扫后锚点仍在', () => {
    const source = note({
      document: docWith(mention('1', 'character', '昵称', '同名角色#小节|昵称')),
    })
    const remapped = { ...source, ...remapRowRefs('worldEntry', source, mapsOf({ characters: [[1, 101]] })).patch }
    const serialized = serializeBody(
      'worldEntry',
      remapped,
      createLinkSerializer(() => '同名角色', () => '同名角色 (2)'),
    )
    expect(serialized?.markdown).toContain('[[同名角色 (2)#小节|昵称]]')

    const rescanned = scanVault({
      root: 'memory-only',
      files: [
        { relPath: '角色/同名角色 (2).md', content: '---\nname: 同名角色\n---\n', mtimeMs: 1, size: 20 },
        { relPath: '世界观/关系笔记.md', content: `---\ntitle: 关系笔记\n---\n${serialized?.markdown ?? ''}`, mtimeMs: 1, size: 80 },
      ],
      skippedDirs: [],
      marker: null,
    })
    applyDocumentBodies(rescanned)
    const attrs = firstAttrs(rescanned.dataset.worldEntries[0].entity.document)
    expect(attrs.raw).toBe('同名角色 (2)#小节|昵称')
    expect(attrs.label).toBe('昵称')
  })

  it('缺失目标：写成纯文本，不写 [[ ]]，重扫不会误绑同名条目', () => {
    const source = note({
      document: docWith(mention('9', 'character', '已删除的人', '同名角色|已删除的人')),
    })
    const remapped = { ...source, ...remapRowRefs('worldEntry', source, mapsOf()).patch }
    const serialized = serializeBody('worldEntry', remapped, createLinkSerializer(() => '同名角色'))

    expect(serialized?.markdown).not.toContain('[[')
    expect(serialized?.markdown).toContain('已删除的人')
    // 不能因为「没有目标」给整篇正文塞 oc-document 兜底块（那是改写用户文件）
    expect(serialized?.hasFallback).toBe(false)

    const rescanned = scanVault({
      root: 'memory-only',
      files: [
        // 库里另有一条同名角色：如果写回 [[同名角色]] 就会误绑到它
        { relPath: '角色/同名角色.md', content: '---\nname: 同名角色\n---\n', mtimeMs: 1, size: 20 },
        { relPath: '世界观/关系笔记.md', content: `---\ntitle: 关系笔记\n---\n${serialized?.markdown ?? ''}`, mtimeMs: 1, size: 60 },
      ],
      skippedDirs: [],
      marker: null,
    })
    applyDocumentBodies(rescanned)
    const doc = rescanned.dataset.worldEntries[0].entity.document as {
      content: Array<{ content?: Array<{ type: string; attrs?: { id?: string } }> }>
    }
    const nodes = doc.content[0].content ?? []
    expect(nodes.some((node) => node.type === 'mention' || node.type === 'wikiLink')).toBe(false)
  })

  it('没有重映射的行保持逐字保真：raw 原样写回', () => {
    const untouched = note({
      document: docWith(wikiLink(3, '昵称', '小名#小节|昵称')),
    })
    // 不走 remapRowRefs（= 已有行 / 未编辑的笔记）
    const serialized = serializeBody('worldEntry', untouched, createLinkSerializer(() => '小名', () => '02.小名'))
    expect(serialized?.markdown).toContain('[[小名#小节|昵称]]')
    expect(serialized?.hasFallback).toBe(false)
  })

  it('[[#本文锚点]]（就地锚点）不因导入重绑定被改掉', () => {
    const source = note({ document: docWith(wikiLink('', '#小节', '#小节')) })
    const result = remapRowRefs('worldEntry', source, mapsOf())
    expect(result.patch).toBeNull()
  })

  it('循环引用：两条笔记互指，引用各自映射到对方', async () => {
    const result = await importData(
      payloadOf({
        worldEntries: [
          note({
            id: 1,
            title: '甲',
            relations: [{ targetId: 2, name: '乙', relation: '互引' }],
            document: docWith(wikiLink(2, '乙', '乙|另一个名字')),
          }),
          note({
            id: 2,
            title: '乙',
            relations: [{ targetId: 1, name: '甲', relation: '互引' }],
            document: docWith(wikiLink(1, '甲', '甲|另一个名字')),
          }),
        ],
      }),
      'keep-both',
    )
    expect(result.added).toBe(2)
    // 备份 id 1 → 落库 1、2 → 落库 2（空库自增）；两边互相指向
    expect(String(firstAttrs(read('worldEntries', 1)?.document).id)).toBe('2')
    expect(String(firstAttrs(read('worldEntries', 2)?.document).id)).toBe('1')
    expect(read('worldEntries', 1)?.relations).toEqual([{ targetId: 2, name: '乙', relation: '互引' }])
    expect(read('worldEntries', 2)?.relations).toEqual([{ targetId: 1, name: '甲', relation: '互引' }])
  })
})

/* ══ Q02 端到端：导入 → 物化落盘 → 重扫 ════════════════════════ */

describe('Q02 · 端到端：导入 → exportLegacyToFolder → readVault', () => {
  it('目标文件夹已有同名文件（外部遗留）：导入的角色落成 (2)，正文链接重扫后指向导入的那一条', async () => {
    // 外部已存在一条同名角色文件，但库里没有它（例如另一个程序刚写进来）
    h.files.set('角色/同名角色.md', '---\nname: 同名角色\n---\n原有角色\n')

    await importData(
      payloadOf({
        characters: [characterOf(1, '同名角色')],
        worldEntries: [
          note({
            id: 1,
            title: '关系笔记',
            document: docWith(mention('1', 'character', '昵称', '同名角色|昵称')),
          }),
        ],
      }),
      'keep-both',
    )

    const report = await exportLegacyToFolder('memory-only', { strategy: 'keep-both' })
    expect(report.created).toBe(2)
    // 外部文件不被覆盖；导入的角色另起 (2)
    expect(h.files.get('角色/同名角色.md')).toContain('原有角色')
    const noteContent = h.files.get('世界观/关系笔记.md') ?? ''
    expect(noteContent).toContain('[[同名角色 (2)|昵称]]')

    const rescanned = await readVault('memory-only')
    const imported = rescanned.scan.dataset.characters.find((row) => row.relPath === '角色/同名角色 (2).md')
    expect(imported).toBeDefined()
    const noteEntry = rescanned.scan.dataset.worldEntries.find((row) => row.relPath === '世界观/关系笔记.md')
    const attrs = firstAttrs(noteEntry?.entity.document)
    expect(String(attrs.id)).toBe(String(imported?.entity.id))
    expect(attrs.label).toBe('昵称')
  })

  it('skip：同名文件与已有笔记一个字节都不改，新笔记的链接指向已有文件', async () => {
    h.files.set('角色/同名角色.md', '---\nname: 同名角色\n---\n原有角色\n')
    h.files.set('世界观/旧笔记.md', '---\ntitle: 旧笔记\n---\n[[同名角色#小节|昵称]] 正文\n')

    // 先按真实读取装载（库里的 id 来自扫描）
    const loaded = await readVault('memory-only')
    for (const item of loaded.scan.dataset.characters) seed('characters', item.entity as unknown as Row)
    for (const item of loaded.scan.dataset.worldEntries) seed('worldEntries', item.entity as unknown as Row)
    const existedCharacter = loaded.scan.dataset.characters[0].entity
    const characterBefore = h.files.get('角色/同名角色.md')
    const noteBefore = h.files.get('世界观/旧笔记.md')

    const result = await importData(
      payloadOf({
        characters: [characterOf(1, '同名角色')],
        worldEntries: [
          note({
            id: 1,
            title: '新笔记',
            document: docWith(mention('1', 'character', '昵称', '同名角色|昵称')),
          }),
        ],
      }),
      'skip',
    )
    expect(result.skipped).toBe(1) // 同名角色跳过
    expect(result.added).toBe(1) // 新笔记

    await exportLegacyToFolder('memory-only', { strategy: 'skip' })

    // 已有文件逐字节不变
    expect(h.files.get('角色/同名角色.md')).toBe(characterBefore)
    expect(h.files.get('世界观/旧笔记.md')).toBe(noteBefore)
    // 新笔记指向已有文件（同名 → 不加 (2)）
    expect(h.files.get('世界观/新笔记.md')).toContain('[[同名角色|昵称]]')

    const rescanned = await readVault('memory-only')
    const importedNote = rescanned.scan.dataset.worldEntries.find((row) => row.relPath === '世界观/新笔记.md')
    const attrs = firstAttrs(importedNote?.entity.document)
    expect(String(attrs.id)).toBe(String(existedCharacter.id))
    // 旧笔记照旧：raw 原样保留（锚点 + 别名）
    const oldNote = rescanned.scan.dataset.worldEntries.find((row) => row.relPath === '世界观/旧笔记.md')
    expect(firstAttrs(oldNote?.entity.document).raw).toBe('同名角色#小节|昵称')
  })

  it('循环引用的两条新笔记物化后互相指向对方', async () => {
    await importData(
      payloadOf({
        worldEntries: [
          note({
            id: 1,
            title: '甲',
            relations: [{ targetId: 2, name: '乙', relation: '互引' }],
            document: docWith(wikiLink(2, '别名乙', '乙|别名乙')),
          }),
          note({
            id: 2,
            title: '乙',
            relations: [{ targetId: 1, name: '甲', relation: '互引' }],
            document: docWith(wikiLink(1, '别名甲', '甲|别名甲')),
          }),
        ],
      }),
      'keep-both',
    )

    await exportLegacyToFolder('memory-only', { strategy: 'keep-both' })

    expect(h.files.get('世界观/甲.md')).toContain('[[乙|别名乙]]')
    expect(h.files.get('世界观/乙.md')).toContain('[[甲|别名甲]]')

    const rescanned = await readVault('memory-only')
    const entries = rescanned.scan.dataset.worldEntries
    const a = entries.find((row) => row.relPath === '世界观/甲.md')
    const b = entries.find((row) => row.relPath === '世界观/乙.md')
    expect(firstAttrs(a?.entity.document).id).toBe(String(b?.entity.id))
    expect(firstAttrs(b?.entity.document).id).toBe(String(a?.entity.id))
    // 命名关系也在重扫后解析回对方
    expect(a?.entity.relations?.[0]?.targetId).toBe(b?.entity.id)
    expect(b?.entity.relations?.[0]?.targetId).toBe(a?.entity.id)
  })

  it('标题含非法字符：链接写清洗后的文件名，显示名保留原标题（别名不动）', async () => {
    await importData(
      payloadOf({
        characters: [characterOf(1, '甲/乙')],
        worldEntries: [
          note({
            id: 1,
            title: '引用笔记',
            document: docWith(mention(1, 'character', '小乙', '甲/乙|小乙')),
          }),
        ],
      }),
      'keep-both',
    )

    await exportLegacyToFolder('memory-only', { strategy: 'keep-both' })

    const content = h.files.get('世界观/引用笔记.md') ?? ''
    // `/` 在文件名里非法 → 落成 `甲 乙.md`；链接必须指向这个真实文件，别名仍是「小乙」
    expect(content).toContain('[[甲 乙|小乙]]')

    const rescanned = await readVault('memory-only')
    const target = rescanned.scan.dataset.characters.find((row) => row.relPath === '角色/甲 乙.md')
    const noteEntry = rescanned.scan.dataset.worldEntries.find((row) => row.relPath === '世界观/引用笔记.md')
    expect(String(firstAttrs(noteEntry?.entity.document).id)).toBe(String(target?.entity.id))
    expect(firstAttrs(noteEntry?.entity.document).label).toBe('小乙')
  })

  it('跨类型同号：正文里的 mention / wikiLink 各按类型换 id，物化后仍指对', async () => {
    // 目标库各类各有一条（同号 1），新导入的条目因此落在不同编号上：
    // 角色 91 / 事件 71 / 国家 51 / 词条 81，本笔记 82
    seed('characters', characterOf(1, '无关角色'))
    seed('events', eventOf(1, '无关事件'))
    seed('countries', countryOf(1, '无关国家'))
    seed('worldEntries', note({ id: 1, title: '无关词条' }))

    await importData(
      payloadOf({
        characters: [characterOf(1, '角色甲')],
        events: [eventOf(1, '事件乙')],
        countries: [countryOf(1, '国家丙')],
        worldEntries: [
          note({
            id: 1,
            title: '词条丁',
            document: docWith(
              mention(1, 'character', '角色'),
              mention(1, 'event', '事件'),
              mention(1, 'country', '国家'),
              wikiLink(1, '词条'),
            ),
          }),
        ],
      }),
      'keep-both',
    )

    await exportLegacyToFolder('memory-only', { strategy: 'keep-both' })

    const content = h.files.get('世界观/词条丁.md') ?? ''
    expect(content).toContain('[[角色甲|角色]]')
    expect(content).toContain('[[事件乙|事件]]')
    expect(content).toContain('[[国家丙|国家]]')
    expect(content).toContain('[[词条丁|词条]]')

    const rescanned = await readVault('memory-only')
    const noteEntry = rescanned.scan.dataset.worldEntries.find((row) => row.relPath === '世界观/词条丁.md')
    const ids = [
      firstAttrs(noteEntry?.entity.document).id,
      firstAttrs(noteEntry?.entity.document, 1).id,
      firstAttrs(noteEntry?.entity.document, 2).id,
      firstAttrs(noteEntry?.entity.document, 3).id,
    ].map(String)
    const entityId = (list: ReadonlyArray<{ relPath: string; entity: { id: number } }>, relPath: string): string =>
      String(list.find((row) => row.relPath === relPath)?.entity.id)
    expect(ids).toEqual([
      entityId(rescanned.scan.dataset.characters, '角色/角色甲.md'),
      entityId(rescanned.scan.dataset.events, '事件/事件乙.md'),
      entityId(rescanned.scan.dataset.countries, '国家/国家丙.md'),
      entityId(rescanned.scan.dataset.worldEntries, '世界观/词条丁.md'),
    ])
    // id 在各表里各自从 1 开始，所以「是不是指对了类型」要看重扫后的 raw（它带目标文件名）
    const raws = [0, 1, 2, 3].map((index) => firstAttrs(noteEntry?.entity.document, index).raw)
    expect(raws).toEqual(['角色甲|角色', '事件乙|事件', '国家丙|国家', '词条丁|词条'])
  })
})

/* ══ 引用身份登记表（供落盘队列接线） ═══════════════════════════ */

describe('reference-paths：实体 → 落盘文件基名', () => {
  it('按 kind:id 登记，跨表同号不串；键函数可替换成落盘队列的写法', () => {
    const index = createEntityPathIndex()
    index.set('character', 1, '角色/同名角色 (2).md')
    index.set('worldEntry', 1, '世界观/词条.md')

    expect(index.fileBaseOf('character', 1)).toBe('同名角色 (2)')
    expect(index.fileBaseOf('worldEntry', 1)).toBe('词条')
    expect(index.fileBaseOf('country', 1)).toBeUndefined()
    expect(index.relPathOf('character', 1)).toBe('角色/同名角色 (2).md')

    // 落盘队列的键是 `entityKey(表名, id)`（characters:1），传适配器即可复用
    const tableKeyed = createEntityPathIndex((kind, id) => `${kind}s:${id}`)
    tableKeyed.set('character', 1, '角色/甲.md')
    expect(tableKeyed.fileBaseOf('character', 1)).toBe('甲')
    expect(fileBaseOfRelPath('a/b/c.MD')).toBe('c')
    expect(fileBaseOfRelPath('')).toBeUndefined()
  })
})

/* ══ 合并策略的边界（避免回归） ═══════════════════════════════ */

describe('Q01/Q02 边界', () => {
  it('不支持的合并策略仍在写库前被拒', async () => {
    await expect(
      importData(payloadOf({ characters: [{ id: 1, name: '甲' }] }), 'merge' as MergeStrategy),
    ).rejects.toThrow(/不支持的合并策略/)
    expect(rowsOf('characters')).toHaveLength(0)
  })

  it('replace 也会重映射正文引用（旧实现只清空 + 插入）', async () => {
    seed('characters', { id: 9, name: '旧角色' })
    await importData(
      payloadOf({
        characters: [{ id: 3, name: '新角色' }],
        worldEntries: [
          note({ id: 7, title: '笔记', document: docWith(mention('3', 'character', '新角色', '新角色|别名')) }),
        ],
      }),
      'replace',
    )

    const entry = rowsOf('worldEntries')[0]
    expect(String(firstAttrs(entry?.document).id)).toBe('1')
    expect(firstAttrs(entry?.document).raw).toBeUndefined()
    expect(docOf(entry)).toBeDefined()
  })
})
