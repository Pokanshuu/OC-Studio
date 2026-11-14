import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 引用持久化回归（审查 F08 / F10）。
 *
 * 关键点是「按磁盘上的旧语义比较」：标签 id 不变、名字变了时，
 * 不能用当前标签表把装载值与新值都展开成同一个名字，否则永远判成「没改」。
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
  drainVaultWrites,
  markVaultDirty,
  resetVaultWriteState,
} from '@/lib/vault/vault-persist'
import { createVaultSession, getVaultSession, setVaultSession } from '@/lib/vault/vault-session'
import { setFrontmatterKeys } from '@/lib/vault/frontmatter'
import {
  serializeCharacter,
  serializeCountry,
  serializeEvent,
  serializeWorldEntry,
  type SerializeContext,
} from '@/lib/vault/serialize'
import type { Character, Country, Event, WorldEntry } from '@/types'

function note(id: number, extra: Record<string, unknown> = {}): WorldEntry {
  return {
    id,
    title: `笔记 ${id}`,
    content: '',
    category: '',
    parentId: null,
    order: 0,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
    ...extra,
  } as WorldEntry
}

function character(id: number, tags: number[]): Character {
  return {
    id,
    name: `角色 ${id}`,
    aliases: [],
    race: '',
    element: '',
    occupation: '',
    faction: '',
    height: '',
    birthday: '',
    bio: '',
    lifeStory: '',
    isMajor: false,
    tags,
    gallery: [],
    avatars: [],
    relatedCharacters: [],
    relatedNotes: [],
    custom: {},
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  } as unknown as Character
}

function country(id: number, tags: number[]): Country {
  return {
    id,
    name: `国家 ${id}`,
    aliases: [],
    description: '',
    system: '',
    geography: '',
    culture: '',
    tags,
    custom: {},
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  } as unknown as Country
}

function event(id: number, tags: number[]): Event {
  return {
    id,
    title: `事件 ${id}`,
    aliases: [],
    time: '',
    location: '',
    summary: '',
    isMajor: false,
    characters: [],
    countries: [],
    tags,
    relations: [],
    images: [],
    custom: {},
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 1,
  } as unknown as Event
}

const ctx: SerializeContext = {
  nameOf: () => undefined,
  tagName: (id) => (id === 1 ? '新标签' : id === 2 ? '目标标签' : undefined),
}

function stateOf(entity: WorldEntry, relPath: string, frontmatter: Record<string, unknown>) {
  return {
    table: 'worldEntries' as const,
    id: entity.id,
    kind: 'worldEntry' as const,
    relPath,
    content: '',
    mtimeMs: 1,
    entity,
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

function writes(): { relPath: string; content: string }[] {
  return h.fs.writeTexts.mock.calls.flatMap((call) => call[1])
}

describe('F08 标签改名的序列化差异', () => {
  it('id 不变、解析名变了时仍产出新名字（世界笔记）', () => {
    const previous = note(1, { tags: [1] })
    const current = note(1, { tags: [1] })
    const patch = serializeWorldEntry(current, previous, {
      entity: previous,
      frontmatter: { tags: ['旧标签'] },
    }, ctx)

    expect(patch.tags).toEqual(['新标签'])
  })

  it('四类实体都按磁盘旧名字比较', () => {
    const charPrevious = character(1, [1])
    const charPatch = serializeCharacter(charPrevious, charPrevious, {
      entity: charPrevious,
      frontmatter: { tags: ['旧标签'] },
    }, ctx)
    expect(charPatch.tags).toEqual(['新标签'])

    const countryPrevious = country(1, [1])
    const countryPatch = serializeCountry(countryPrevious, countryPrevious, {
      entity: countryPrevious,
      frontmatter: { tags: ['旧标签'] },
    }, ctx)
    expect(countryPatch.tags).toEqual(['新标签'])

    const eventPrevious = event(1, [1])
    const eventPatch = serializeEvent(eventPrevious, eventPrevious, {
      entity: eventPrevious,
      frontmatter: { tags: ['旧标签'] },
    }, ctx)
    expect(eventPatch.tags).toEqual(['新标签'])
  })

  it('标签全被移除时删掉 tags 键，而不是留下旧名字', () => {
    const previous = note(1, { tags: [1] })
    const current = note(1, { tags: [] })
    const patch = serializeWorldEntry(current, previous, {
      entity: previous,
      frontmatter: { tags: ['旧标签'] },
    }, ctx)

    expect(patch.tags).toBeUndefined()
    const source = '---\ntitle: 笔记\ntags:\n  - 旧标签\n---\n正文'
    expect(setFrontmatterKeys(source, patch)).not.toContain('旧标签')
  })

  it('标签合并后写入目标名字', () => {
    const previous = note(1, { tags: [1] })
    const current = note(1, { tags: [2] })
    const patch = serializeWorldEntry(current, previous, {
      entity: previous,
      frontmatter: { tags: ['旧标签'] },
    }, ctx)

    expect(patch.tags).toEqual(['目标标签'])
  })

  it('标签改名会重写四类实体的文件，tags.json 只留新名字', async () => {
    const session = getVaultSession()
    if (session === null) throw new Error('会话未建立')

    const char = character(1, [1])
    const countryRow = country(1, [1])
    const eventRow = event(1, [1])
    const worldRow = note(1, { tags: [1] })

    h.rows.characters.set(1, char as unknown as Record<string, unknown>)
    h.rows.countries.set(1, countryRow as unknown as Record<string, unknown>)
    h.rows.events.set(1, eventRow as unknown as Record<string, unknown>)
    h.rows.worldEntries.set(1, worldRow as unknown as Record<string, unknown>)
    h.rows.tags.set(1, { id: 1, name: '新标签', color: '#abc', category: '' })

    // 装载时的旧名字：标签没有独立文件，也必须登记（F08 的前置）
    session.entries.set('tags:1', {
      table: 'tags',
      id: 1,
      kind: 'tag',
      relPath: '',
      content: '',
      mtimeMs: 0,
      entity: { id: 1, name: '旧标签', color: '#abc', category: '' },
      frontmatter: {},
      bodyMarkdown: '',
      bodyDoc: 'null',
      trashed: false,
    })
    session.tagMeta.entries.set('旧标签', { color: '#abc', category: '' })
    session.entries.set(
      'worldEntries:1',
      stateOf(worldRow, '世界观/笔记.md', { title: worldRow.title, tags: ['旧标签'] }),
    )
    session.entries.set('characters:1', {
      table: 'characters',
      id: 1,
      kind: 'character',
      relPath: '角色/甲.md',
      content: '---\ntitle: 角色 1\ntags:\n  - 旧标签\n---\n',
      mtimeMs: 1,
      entity: char,
      frontmatter: { title: '角色 1', tags: ['旧标签'] },
      bodyMarkdown: '',
      bodyDoc: 'null',
      trashed: false,
    })
    session.entries.set('countries:1', {
      table: 'countries',
      id: 1,
      kind: 'country',
      relPath: '国家/甲.md',
      content: '---\ntitle: 国家 1\ntags:\n  - 旧标签\n---\n',
      mtimeMs: 1,
      entity: countryRow,
      frontmatter: { title: '国家 1', tags: ['旧标签'] },
      bodyMarkdown: '',
      bodyDoc: 'null',
      trashed: false,
    })
    session.entries.set('events:1', {
      table: 'events',
      id: 1,
      kind: 'event',
      relPath: '事件/甲.md',
      content: '---\ntitle: 事件 1\ntags:\n  - 旧标签\n---\n',
      mtimeMs: 1,
      entity: eventRow,
      frontmatter: { title: '事件 1', tags: ['旧标签'] },
      bodyMarkdown: '',
      bodyDoc: 'null',
      trashed: false,
    })

    markVaultDirty('tags', 1)
    await drainVaultWrites()

    const noteWrites = writes().filter((entry) => entry.relPath.endsWith('.md'))
    expect(noteWrites).toHaveLength(4)
    for (const entry of noteWrites) {
      expect(entry.content).toContain('新标签')
      expect(entry.content).not.toContain('旧标签')
    }

    const tagMetaWrite = writes().find((entry) => entry.relPath === '.ocstudio/tags.json')
    expect(tagMetaWrite).toBeDefined()
    expect(tagMetaWrite?.content).toContain('新标签')
    expect(tagMetaWrite?.content).not.toContain('旧标签')
  })
})

describe('F10 显式清空分类', () => {
  it('清空 category 会删掉磁盘上的分类键（含中文键名）', () => {
    const previous = note(1, { category: '宠物' })
    const current = note(1, { category: '' })
    const patch = serializeWorldEntry(current, previous, {
      entity: previous,
      frontmatter: { title: '某条目', 分类: '宠物' },
    }, ctx)

    expect(Object.hasOwn(patch, '分类')).toBe(true)
    expect(patch['分类']).toBeUndefined()

    const source = '---\ntitle: 某条目\n分类: 宠物\n---\n正文'
    expect(setFrontmatterKeys(source, patch)).toBe('---\ntitle: 某条目\n---\n正文')
  })

  it('清空 classification 时一并清掉分类文件夹键', () => {
    const previous = note(1, { category: '宠物', folder: '幼年' })
    const current = note(1, { category: '', folder: undefined })
    const patch = serializeWorldEntry(current, previous, {
      entity: previous,
      frontmatter: { title: '某条目', 分类: '宠物', 文件夹: '幼年' },
    }, ctx)

    expect(patch['分类']).toBeUndefined()
    expect(patch['文件夹']).toBeUndefined()
  })

  it('删除分类（笔记上的名字不变）不产生写入', () => {
    const previous = note(1, { category: '宠物' })
    const current = note(1, { category: '宠物' })
    const patch = serializeWorldEntry(current, previous, {
      entity: previous,
      frontmatter: { title: '某条目', 分类: '宠物' },
    }, ctx)

    expect(Object.keys(patch)).toHaveLength(0)
  })

  it('新建空分类的笔记不会凭空写分类键', () => {
    const current = note(1)
    const patch = serializeWorldEntry(current, null, { entity: null, frontmatter: {} }, ctx)
    expect(Object.hasOwn(patch, 'category')).toBe(false)
    expect(Object.hasOwn(patch, '分类')).toBe(false)
  })
})
