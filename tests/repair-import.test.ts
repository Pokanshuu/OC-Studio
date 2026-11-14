import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 导入合并 / 引用重映射的**正式回归**（审查报告 F06 / F07 / F09 / F11，
 * 探针 R05 / R06 / R07 / R09 / R12）。
 *
 * 只用内存替身替换**存储与周边服务**（Dexie 表、设置恢复、vault / journal），
 * 合并、规范化、重映射跑的都是真实实现。断言看的是**对象身份**与**已有行逐字段不变**，
 * 不是只看行数。
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {  const tableNames = [
    'characters',
    'events',
    'countries',
    'worldEntries',
    'tags',
    'periods',
    'meta',
    'operationLog',
  ]
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

  return { rows, db }
})

vi.mock('@/lib/db', () => ({ db: h.db }))
vi.mock('@/lib/export/backup-config', () => ({
  restoreBackupConfig: async () => ({ restored: [], kept: [], reasons: [] }),
}))
vi.mock('@/lib/vault/vault-fs', () => ({ isVaultSupported: () => false, vaultFs: {} }))
vi.mock('@/lib/vault/vault-session', () => ({ getVaultSession: () => null }))
vi.mock('@/lib/vault/journal', () => ({
  JOURNAL_REL_PATH: '.ocstudio/journal.jsonl',
  mergeJournalLines: () => [],
  readJournalLines: async () => [],
}))

import { importData, validateImportData, type MergeStrategy } from '@/lib/import'
import { parseBackupPayload } from '@/lib/import-normalize'

it('preserves declared incomplete-backup sections in preview and import results', async () => {
  const input = payloadOf({}, { manifest: { complete: false, unavailable: [
    { id: 'inspirations', label: '灵感', reason: '读取失败' },
    { id: 'images', label: '图片', reason: '原件缺失' },
  ] } })
  expect(validateImportData(input).incomplete).toEqual(['灵感', '图片'])
  expect((await importData(input, 'skip')).incomplete).toEqual(['灵感', '图片'])
  expect(validateImportData(payloadOf({})).incomplete).toBeUndefined()
  expect(validateImportData(payloadOf({}, { manifest: { complete: false } })).incomplete).toEqual(['部分内容（原备份未列明）'])
})

/* ── 内存库的读写小工具 ─────────────────────────────────────── */

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

function rows(table: string): Row[] {
  return [...store(table).values()]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((row) => structuredClone(row))
}

/** 全库快照：用来断言「已有行逐字段不变」 */
function snapshotAll(): Record<string, Row[]> {
  const out: Record<string, Row[]> = {}
  for (const name of h.rows.keys()) out[name] = rows(name)
  return out
}

function mention(id: string | number, entityType: string, label = '引用'): Row {
  return { type: 'mention', attrs: { id, entityType, label } }
}

function wikiLink(id: string | number, label = '链接'): Row {
  return { type: 'wikiLink', attrs: { id, label } }
}

function docWith(...nodes: unknown[]): Row {
  return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] }
}

function payloadOf(
  data: Partial<Record<string, unknown[]>>,
  extra: Record<string, unknown> = {},
): RawPayload {
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
    ...extra,
  }
}

interface RawPayload {
  version: number
  exportedAt: string
  data: Record<string, unknown[]>
  [key: string]: unknown
}

/** 取正文里第一段的节点 attrs（断言目标身份） */
function bodyAttrs(document: unknown, index = 0): Record<string, unknown> {
  const doc = document as { content: Array<{ content: Array<{ attrs: Record<string, unknown> }> }> }
  return doc.content[0].content[index].attrs
}

/** 断言快照里的每一行现在都还在，且逐字段没变（允许新增行） */
function expectExistingRowsUnchanged(before: Record<string, Row[]>): void {
  for (const [table, list] of Object.entries(before)) {
    for (const row of list) {
      expect(read(table, Number(row.id))).toEqual(row)
    }
  }
}

function note(extra: Row = {}): Row {
  return {
    title: '未命名',
    category: '',
    parentId: null,
    tags: [],
    relations: [],
    references: [],
    ...extra,
  }
}

beforeEach(() => {
  for (const name of h.rows.keys()) store(name).clear()
})

/* ── 引用映射要看目标身份，不是只看数字 ───────────────────────── */

describe('非空目标库 + 跨类型同号（F06 / R05 / R06）', () => {
  it('四种实体各自从 1 开始：导入后每个引用都指向本类型的新行，旧行一个字段都不动', async () => {
    seed('tags', { id: 1, name: '旧标签', color: '#000000', category: '' })
    seed('characters', { id: 1, name: '旧角色', countryId: null, tags: [] })
    seed('countries', { id: 1, name: '旧国', parentId: null, tags: [] })
    seed('events', {
      id: 1,
      title: '旧事件',
      characters: [],
      countries: [],
      parentEventId: null,
      relations: [],
      tags: [],
    })
    seed('worldEntries', note({ id: 1, title: '旧笔记' }))
    const before = snapshotAll()

    const result = await importData(
      payloadOf({
        tags: [{ id: 1, name: '新标签', color: '#ffffff', category: '' }],
        countries: [{ id: 1, name: '新国', parentId: null, tags: [1] }],
        characters: [
          {
            id: 1,
            name: '新角色甲',
            countryId: 1,
            tags: [1],
            document: docWith(
              mention('1', 'event', '事件'),
              mention('1', 'country', '国家'),
              mention('2', 'character', '角色乙'),
            ),
          },
          { id: 2, name: '新角色乙' },
        ],
        events: [
          {
            id: 1,
            title: '新事件',
            characters: [1],
            countries: [1],
            parentEventId: null,
            relations: [],
            tags: [],
          },
        ],
        worldEntries: [
          note({ id: 1, title: '新笔记', document: docWith(wikiLink('1', '另一个词条')) }),
          note({ id: 2, title: '新词条的下一层', parentId: 1 }),
        ],
      }),
      'keep-both',
    )

    // 标签：1 行 → 新 id 2；国家：1 行 → 新 id 2；角色 2 行 → 2 / 3；
    // 事件 1 行 → 2；词条 2 行 → 2 / 3
    expect(result.added).toBe(7)
    expect(result.skipped).toBe(0)
    expect(result.overwritten).toBe(0)

    const character = read('characters', 2)
    expect(character?.name).toBe('新角色甲')
    expect(read('countries', Number(character?.countryId))?.name).toBe('新国')
    expect(read('tags', (character?.tags as number[])[0])?.name).toBe('新标签')

    // 正文里的引用按类型各自查表：事件 1→2、国家 1→2、角色 2→3
    expect(bodyAttrs(character?.document, 0).id).toBe('2')
    expect(bodyAttrs(character?.document, 1).id).toBe('2')
    expect(bodyAttrs(character?.document, 2).id).toBe('3')
    expect(read('characters', 3)?.name).toBe('新角色乙')

    const event = read('events', 2)
    expect(event?.title).toBe('新事件')
    expect(event?.characters).toEqual([2])
    expect(event?.countries).toEqual([2])
    // 参与者 2 是新角色甲，不是目标库里原本的角色 1
    expect(read('characters', (event?.characters as number[])[0])?.name).toBe('新角色甲')

    expect(read('worldEntries', 2)?.document).toBeDefined()
    expect(bodyAttrs(read('worldEntries', 2)?.document).id).toBe('2')
    expect(read('worldEntries', 3)?.parentId).toBe(2)

    // 旧行逐字段不变（含 id 本身）
    const after = snapshotAll()
    for (const table of ['tags', 'characters', 'countries', 'events', 'worldEntries']) {
      expect(after[table].filter((row) => Number(row.id) === 1)).toEqual(
        before[table].filter((row) => Number(row.id) === 1),
      )
    }
    expect(read('characters', 1)).toEqual(before.characters[0])
    expect(read('countries', 1)).toEqual(before.countries[0])
    expect(read('events', 1)).toEqual(before.events[0])
    expect(read('worldEntries', 1)).toEqual(before.worldEntries[0])
  })

  it('国家层级：keep-both 下父国 / 子国各自换成新 id（R06）', async () => {
    seed('countries', { id: 1, name: '无关国家' })

    const result = await importData(
      payloadOf({
        countries: [
          { id: 1, name: '母国', parentId: null },
          { id: 2, name: '子国', parentId: 1 },
        ],
      }),
      'keep-both',
    )

    expect(result.added).toBe(2)
    expect(read('countries', 2)?.name).toBe('母国')
    expect(read('countries', 3)?.name).toBe('子国')
    // 子国挂到新母国（2）上，不是目标库原本的 1
    expect(read('countries', 3)?.parentId).toBe(2)
    expect(read('countries', 1)).toEqual({ id: 1, name: '无关国家' })
  })
})

describe('skip 策略不得修改任何已有行（F07 / R07）', () => {
  it('不同祖先下的同名父节点要分开认：乙卷下的「细节」不动，甲卷那条是新增', async () => {
    seed('worldEntries', note({ id: 10, title: '甲卷' }))
    seed('worldEntries', note({ id: 20, title: '乙卷' }))
    seed('worldEntries', note({ id: 11, title: '共同章节', parentId: 10 }))
    seed('worldEntries', note({ id: 12, title: '共同章节', parentId: 20 }))
    seed('worldEntries', note({ id: 50, title: '细节', parentId: 12, relations: [{ targetId: 12, name: '共同章节', relation: '前情' }] }))
    const before = snapshotAll()

    const result = await importData(
      payloadOf({
        worldEntries: [
          note({ id: 100, title: '甲卷' }),
          note({ id: 1, title: '共同章节', parentId: 100 }),
          note({ id: 2, title: '细节', parentId: 1 }),
        ],
      }),
      'skip',
    )

    // 甲卷、甲卷/共同章节 都同名跳过；甲卷/共同章节/细节 与乙卷那条不同 → 新增
    expect(result.added).toBe(1)
    expect(result.skipped).toBe(2)
    expect(result.overwritten).toBe(0)

    // 已有行逐字段不变（不只是「父级没动」）
    expectExistingRowsUnchanged(before)
    expect(read('worldEntries', 50)?.parentId).toBe(12)

    // 新行的父级是甲卷下面的共同章节（11），不是乙卷下面的 12
    const added = rows('worldEntries').find((row) => Number(row.id) > 50)
    expect(added?.title).toBe('细节')
    expect(added?.parentId).toBe(11)
  })

  it('新章节挂到已存在的同名父级上：跳过的是父级，新行照样接上去', async () => {
    seed('worldEntries', note({ id: 10, title: '甲卷' }))

    const result = await importData(
      payloadOf({
        worldEntries: [note({ id: 100, title: '甲卷' }), note({ id: 101, title: '第二章', parentId: 100 })],
      }),
      'skip',
    )

    expect(result.added).toBe(1)
    expect(result.skipped).toBe(1)
    const added = rows('worldEntries').find((row) => Number(row.id) !== 10)
    expect(added?.parentId).toBe(10)
  })

  it('目标库有同名歧义时明确报冲突，不猜其中一条', async () => {
    seed('characters', { id: 1, name: '同名', race: '旧甲' })
    seed('characters', { id: 2, name: '同名', race: '旧乙' })
    const before = snapshotAll()

    const result = await importData(
      payloadOf({ characters: [{ id: 9, name: '同名', race: '导入的' }] }),
      'skip',
    )

    expect(result.added).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts?.[0].reason).toContain('无法判断')
    expect(snapshotAll()).toEqual(before)
  })

  it('歧义时 overwrite 也不覆盖任何一条', async () => {
    seed('characters', { id: 1, name: '同名', race: '旧甲' })
    seed('characters', { id: 2, name: '同名', race: '旧乙' })
    const before = snapshotAll()

    const result = await importData(
      payloadOf({ characters: [{ id: 9, name: '同名', race: '导入的' }] }),
      'overwrite',
    )

    expect(result.overwritten).toBe(0)
    expect(result.conflicts).toHaveLength(1)
    expect(snapshotAll()).toEqual(before)
  })

  it('不同祖先下的同名条目在 overwrite 下同样不会被误覆盖', async () => {
    seed('worldEntries', note({
      id: 20,
      title: '乙卷',
    }))
    seed('worldEntries', note({
      id: 21,
      title: '共同章节',
      parentId: 20,
    }))
    seed('worldEntries', note({
      id: 22,
      title: '细节',
      parentId: 21,
      relations: [{ name: '原样保留', relation: '线索' }],
    }))

    const result = await importData(
      payloadOf({
        worldEntries: [
          note({ id: 100, title: '甲卷' }),
          note({ id: 101, title: '共同章节', parentId: 100 }),
          note({ id: 102, title: '细节', parentId: 101, relations: [{ name: '备份里的关系', relation: '新线索' }] }),
        ],
      }),
      'overwrite',
    )

    // 22（乙卷/共同章节/细节）不在导入路径上：一个字都不能变
    expect(read('worldEntries', 22)).toEqual(
      note({ id: 22, title: '细节', parentId: 21, relations: [{ name: '原样保留', relation: '线索' }] }),
    )
    expect(result.added).toBe(3)
    expect(result.overwritten).toBe(0)
  })
})

describe('四种合并策略', () => {
  it('skip：同名行一个字段都不改，引用仍解析到已有那条', async () => {
    // countryId 999 是「目标库里本来就不存在」的悬空引用：skip 也不许顺手修它
    seed('characters', { id: 5, name: '甲', race: '旧种族', countryId: 999, tags: [] })
    seed('countries', { id: 3, name: '旧国', parentId: null, tags: [] })
    const before = snapshotAll()

    const result = await importData(
      payloadOf({
        characters: [{ id: 1, name: '甲', race: '导入的种族', countryId: 1, tags: [] }],
        countries: [{ id: 1, name: '旧国', parentId: null, tags: [] }],
        worldEntries: [note({ id: 7, title: '新笔记', document: docWith(mention('1', 'character', '甲')) })],
      }),
      'skip',
    )

    expect(result.added).toBe(1) // 只有笔记是新的
    expect(result.skipped).toBe(2) // 角色 + 国家
    expect(read('characters', 5)).toEqual(before.characters[0])
    expect(read('characters', 5)?.countryId).toBe(999)
    // 新笔记里的「@甲」指到已有角色 5（备份 id 1 → 跳过映射到 5）
    expect(bodyAttrs(read('worldEntries', 1)?.document).id).toBe('5')
  })

  it('overwrite：同名行被替换、id 保留，引用按新 id 重映射', async () => {
    seed('characters', { id: 5, name: '甲', race: '旧种族', countryId: null, tags: [] })
    seed('countries', { id: 3, name: '旧国', parentId: null, tags: [] })

    const result = await importData(
      payloadOf({
        characters: [{ id: 1, name: '甲', race: '新种族', countryId: 1, tags: [] }],
        countries: [{ id: 1, name: '新国', parentId: null, tags: [] }],
      }),
      'overwrite',
    )

    expect(result.overwritten).toBe(1)
    expect(result.added).toBe(1) // 「新国」与「旧国」不同名 → 新增
    const character = read('characters', 5)
    expect(character?.race).toBe('新种族')
    expect(read('countries', Number(character?.countryId))?.name).toBe('新国')
    // 旧国还在（不会被 overwrite 误删）
    expect(read('countries', 3)?.name).toBe('旧国')
  })

  it('keep-both：同名也生成新条目，已有行不动', async () => {
    seed('characters', { id: 1, name: '甲', race: '旧的' })
    const before = snapshotAll()

    const result = await importData(payloadOf({ characters: [{ id: 1, name: '甲', race: '导入的' }] }), 'keep-both')

    expect(result.added).toBe(1)
    expect(read('characters', 1)).toEqual(before.characters[0])
    expect(read('characters', 2)?.race).toBe('导入的')
  })

  it('事件层级 parentEventId 跟着换成本库 id', async () => {
    seed('events', { id: 5, title: '旧事件', characters: [], relations: [] })

    const result = await importData(
      payloadOf({
        events: [
          { id: 1, title: '父事件', parentEventId: null, characters: [], relations: [] },
          { id: 2, title: '子事件', parentEventId: 1, characters: [], relations: [] },
        ],
      }),
      'keep-both',
    )

    expect(result.added).toBe(2)
    expect(read('events', 6)?.title).toBe('父事件')
    expect(read('events', 7)?.title).toBe('子事件')
    expect(read('events', 7)?.parentEventId).toBe(6)
    expect(read('events', 5)).toEqual({ id: 5, title: '旧事件', characters: [], relations: [] })
  })

  it('导入不会改动调用方的原始载荷（预览与执行可以共用同一个对象）', async () => {
    const raw = payloadOf({
      characters: [{ id: 1, name: '甲', countryId: 1, tags: [1] }],
      countries: [{ id: 1, name: '国', parentId: null }],
      tags: [{ id: 1, name: '标签', color: '#fff', category: '' }],
    })
    // periods 缺失：旧代码会往 records 上补一个字段
    delete raw.data.periods
    const before = structuredClone(raw)

    await importData(raw, 'keep-both')

    expect(raw).toEqual(before)
    expect(raw.data.periods).toBeUndefined()
  })

  it('replace：清空后重建，并按新 id 重映射层级 / 正文 / 国籍', async () => {
    seed('characters', { id: 1, name: '旧角色' })
    seed('worldEntries', note({ id: 1, title: '旧笔记' }))
    seed('meta', { id: 1, worldName: '旧世界' })

    const result = await importData(
      payloadOf({
        countries: [
          { id: 3, name: '母国', parentId: null, tags: [] },
          { id: 7, name: '子国', parentId: 3, tags: [] },
        ],
        characters: [
          {
            id: 9,
            name: '新角色',
            countryId: 7,
            document: docWith(mention('7', 'country', '子国')),
          },
        ],
        worldEntries: [note({ id: 4, title: '新笔记', document: docWith(wikiLink('4', '自己')) })],
        meta: [{ id: 1, worldName: '新世界' }],
      }),
      'replace',
    )

    expect(Object.keys(snapshotAll()).length).toBeGreaterThan(0)
    expect(read('characters', 1)?.name).toBe('新角色') // 旧行已清空，新编号从 1 开始
    expect(read('worldEntries', 1)?.title).toBe('新笔记')
    expect(read('worldEntries', 2)).toBeUndefined()

    const parent = read('countries', 1)
    expect(parent?.name).toBe('母国')
    expect(read('countries', 2)?.name).toBe('子国')
    expect(read('countries', 2)?.parentId).toBe(1)

    const character = read('characters', 1)
    expect(read('countries', Number(character?.countryId))?.name).toBe('子国')
    expect(bodyAttrs(character?.document).id).toBe('2')

    expect(bodyAttrs(read('worldEntries', 1)?.document).id).toBe('1')
    expect(read('meta', 1)?.worldName).toBe('新世界')
    expect(result.added).toBe(5) // 2 国家 + 1 角色 + 1 词条 + 1 元信息
  })
})

describe('目标缺失（F09 / R12）', () => {
  it('成员事实断开并计数；命名关系保留原文；正文保留 label、解除跳转', async () => {
    const result = await importData(
      payloadOf({
        characters: [
          {
            id: 1,
            name: '甲',
            countryId: 99,
            tags: [1],
            relatedCharacters: [{ characterId: 5, name: '乙', relation: '朋友' }],
            relatedNotes: [{ targetId: 3, name: '消失的笔记', relation: '主角', color: 'amber', arrow: 'forward' }],
            document: docWith(mention('9', 'character', '消失的人')),
          },
        ],
        worldEntries: [
          note({
            id: 1,
            title: '笔记',
            relations: [{ targetId: 9, name: '已删除的故乡', relation: '出生地', color: 'vermilion', arrow: 'both' }],
          }),
        ],
        events: [
          {
            id: 1,
            title: '事件',
            characters: [],
            countries: [],
            parentEventId: 8,
            relations: [{ targetId: 9, relation: '前因', color: 'amber' }],
          },
        ],
      }),
      'keep-both',
    )

    const character = read('characters', 1)
    expect(character?.countryId).toBeNull()
    expect(character?.tags).toEqual([])
    expect(character?.relatedCharacters).toEqual([])
    expect(character?.relatedNotes).toEqual([
      { name: '消失的笔记', relation: '主角', color: 'amber', arrow: 'forward' },
    ])
    expect(bodyAttrs(character?.document)).toEqual({ entityType: 'character', label: '消失的人' })

    expect(read('worldEntries', 1)?.relations).toEqual([
      { name: '已删除的故乡', relation: '出生地', color: 'vermilion', arrow: 'both' },
    ])
    // 事件父级缺失 → 当根（null），但关系文字保留
    expect(read('events', 1)?.parentEventId).toBeNull()
    expect(read('events', 1)?.relations).toEqual([{ relation: '前因', color: 'amber' }])

    expect(result.droppedRefs).toBe(4) // 国籍 1 + 标签 1 + 相关角色 1 + 事件父级 1
    expect(result.namedRefsKept).toBe(3) // 角色相关笔记 + 笔记关系 + 事件关系
    expect(result.bodyRefsUnlinked).toBe(1)
  })

  it('目标被跳过（同名已有）时，引用解析到已有那条而不是断开', async () => {
    seed('characters', { id: 5, name: '甲' })

    const result = await importData(
      payloadOf({
        characters: [{ id: 1, name: '甲' }],
        events: [{ id: 2, title: '事件', characters: [1], relations: [] }],
      }),
      'skip',
    )

    expect(result.added).toBe(1)
    expect(read('events', 1)?.characters).toEqual([5])
    expect(result.droppedRefs).toBeUndefined()
  })
})

describe('坏载荷在写库之前被拦下（F11 / R09）', () => {
  it('数组里的 null / 基本类型 / 数组：预检与导入消费同一份规范化结果', async () => {
    const raw = payloadOf({
      characters: [null, 'x', [], { id: 1, name: '好角色' }],
      events: [{ id: 2, title: '好事件' }],
    })

    const summary = validateImportData(raw)
    expect(summary.characters).toBe(1)
    expect(summary.events).toBe(1)
    expect(summary.issues?.length).toBe(3)

    const result = await importData(raw, 'keep-both')
    expect(result.added).toBe(summary.characters + summary.events)
    expect(read('characters', 1)?.name).toBe('好角色')
    expect(result.ignored?.length).toBe(3)
  })

  it('版本不认识 / 缺 data / 前置表不是数组 → 抛可读错误，库不动', async () => {
    const before = snapshotAll()
    await expect(importData({ version: 9, data: {} }, 'skip')).rejects.toThrow(/不支持的版本：9/)
    await expect(importData({ version: 1 }, 'skip')).rejects.toThrow(/缺少 data 字段/)
    await expect(
      importData({ version: 1, data: { characters: 'nope' } }, 'skip'),
    ).rejects.toThrow(/缺少 data.characters 数组/)
    await expect(importData('不是对象', 'skip')).rejects.toThrow(/数据不是 JSON 对象/)
    await expect(importData(null, 'skip')).rejects.toThrow(/数据不是 JSON 对象/)
    expect(snapshotAll()).toEqual(before)
  })

  it('不支持的合并策略同样在写库前拒绝', async () => {
    await expect(
      importData(payloadOf({ characters: [{ id: 1, name: '甲' }] }), 'merge' as MergeStrategy),
    ).rejects.toThrow(/不支持的合并策略/)
    expect(read('characters', 1)).toBeUndefined()
  })

  it('重复 id：第一条占映射，后面的按新条目导入（不覆盖、不串号）', async () => {
    const result = await importData(
      payloadOf({
        characters: [
          { id: 1, name: '甲' },
          { id: 1, name: '乙' },
        ],
        events: [{ id: 2, title: '事件', characters: [1], relations: [] }],
      }),
      'keep-both',
    )

    expect(result.added).toBe(3)
    // 引用指向「第一个 id:1」那条（甲），不是后来的乙
    expect(read('events', 1)?.characters).toEqual([1])
    expect(read('characters', 1)?.name).toBe('甲')
    expect(read('characters', 2)?.name).toBe('乙')
    expect(result.ignored?.some((issue) => issue.message.includes('重复'))).toBe(true)
  })

  it('缺字段 / 类型不对的行被规范化并报告，未知扩展字段保留', async () => {
    const result = await importData(
      payloadOf({
        characters: [
          { id: '3', name: 42, tags: 'nope', deleted: 'false', mood: '开心', custom: { 发色: '黑' } },
        ],
      }),
      'keep-both',
    )

    expect(result.added).toBe(1)
    const row = read('characters', 1)
    expect(row?.name).toBe('42')
    expect(row?.tags).toEqual([])
    expect(row?.deleted).toBe(false)
    expect(row?.mood).toBe('开心')
    expect(row?.custom).toEqual({ 发色: '黑' })
    expect(result.ignored?.length).toBeGreaterThan(0)
  })

  it('已经规范化过的载荷可以直接交给导入（预览与执行真的是同一份）', async () => {
    const raw = payloadOf({ characters: [null, { id: 1, name: '甲' }] })
    const normalized = parseBackupPayload(raw)
    const result = await importData(normalized, 'keep-both')
    expect(result.added).toBe(1)
    expect(validateImportData(normalized).characters).toBe(1)
  })
})

describe('用例元信息（单例）也受 skip 约束', () => {
  const metaPayload = payloadOf({ meta: [{ id: 1, worldName: '新世界', tagline: '新副标' }] })

  it('skip：目标已有元信息就保留，不借单例之名绕过', async () => {
    seed('meta', { id: 1, worldName: '旧世界', tagline: '旧副标' })
    const result = await importData(metaPayload, 'skip')
    expect(read('meta', 1)).toEqual({ id: 1, worldName: '旧世界', tagline: '旧副标' })
    expect(result.skipped).toBe(1)
    expect(result.added).toBe(0)
  })

  it('overwrite：替换单例并计入覆盖', async () => {
    seed('meta', { id: 1, worldName: '旧世界' })
    const result = await importData(metaPayload, 'overwrite')
    expect(read('meta', 1)?.worldName).toBe('新世界')
    expect(result.overwritten).toBe(1)
  })

  it('keep-both：单例造不出第二条，保留目标库的', async () => {
    seed('meta', { id: 1, worldName: '旧世界' })
    const result = await importData(metaPayload, 'keep-both')
    expect(read('meta', 1)?.worldName).toBe('旧世界')
    expect(rows('meta')).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })

  it('目标没有元信息时任何策略都写入（单例 id 固定 1）', async () => {
    const result = await importData(payloadOf({ meta: [{ id: 5, worldName: '新世界' }] }), 'skip')
    expect(read('meta', 1)?.worldName).toBe('新世界')
    expect(rows('meta')).toHaveLength(1)
    expect(result.added).toBe(1)
  })
})

describe('版本兼容边界（v1 / v2）', () => {
  it('fork 版 v2 的 data.maps 只统计不导入，其余数据照常合并', async () => {
    const raw = payloadOf({
      characters: [{ id: 1, name: '甲' }],
      maps: [{ id: 1, name: '世界', seed: 42, params: {}, createdAt: 1, updatedAt: 1 }],
    })
    raw.version = 2

    const summary = validateImportData(raw)
    expect(summary.maps).toBe(1)
    expect(summary.characters).toBe(1)

    const result = await importData(raw, 'keep-both')
    expect(result.added).toBe(1)
    expect(read('characters', 1)?.name).toBe('甲')
  })

  it('v1 旧备份缺 periods / meta 仍然可导入', async () => {
    const raw = payloadOf({ characters: [{ id: 1, name: '甲' }] })
    delete raw.data.periods
    delete raw.data.meta

    const result = await importData(raw, 'skip')
    expect(result.added).toBe(1)
    expect(read('characters', 1)?.name).toBe('甲')
    expect(rows('periods')).toHaveLength(0)
    expect(rows('meta')).toHaveLength(0)
  })
})

describe('老数据的 JSON 字符串正文也能跟着换 id', () => {
  it('词条 content 是 JSON 字符串：导入后仍是字符串，但链接指向新 id', async () => {
    // 目标库已有一条（id 5），这次导入的两条落成 6 / 7 —— 链接必须跟着变成 6
    seed('worldEntries', note({ id: 5, title: '旧词条' }))

    const result = await importData(
      payloadOf({
        worldEntries: [
          note({ id: 1, title: '甲' }),
          note({
            id: 2,
            title: '乙',
            content: JSON.stringify(docWith(wikiLink('1', '指向甲'))),
          }),
        ],
      }),
      'keep-both',
    )

    expect(result.added).toBe(2)
    const content = read('worldEntries', 7)?.content
    expect(typeof content).toBe('string')
    const parsed = JSON.parse(String(content)) as unknown
    expect(bodyAttrs(parsed).id).toBe('6')
    expect(bodyAttrs(parsed).label).toBe('指向甲')
  })

  it('纯文本正文不会被当成 JSON 改坏', async () => {
    await importData(
      payloadOf({
        worldEntries: [note({ id: 1, title: '手稿', content: '第一句话。\n第二句话。' })],
      }),
      'keep-both',
    )
    expect(read('worldEntries', 1)?.content).toBe('第一句话。\n第二句话。')
  })
})
