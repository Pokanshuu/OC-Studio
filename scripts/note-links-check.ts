/**
 * 笔记关系查询自检：`npx tsx scripts/note-links-check.ts`
 *
 * 盯三件事：
 * - 命名边与正文提及同一目标时只留一行（命名边优先）
 * - 命名边在对方那里变成只读的「来自」，并与正文反查去重
 * - 层级（父 / 子）不受影响，目标被删时保留名字快照
 */
import type { WorldEntry } from '../src/types'
import { buildNoteLinks } from '../src/features/world/hooks/useNoteLinks'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1
    console.log(`  OK ${name}`)
  } else {
    console.error(`  FAIL ${name}`)
    process.exitCode = 1
  }
}

function doc(...ids: number[]): object {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: ids.map((id) => ({ type: 'wikiLink', attrs: { id: String(id), label: `#${id}` } })),
      },
    ],
  }
}

function entry(input: Partial<WorldEntry> & Pick<WorldEntry, 'id' | 'title'>): WorldEntry {
  return {
    aliases: [],
    content: '',
    category: '',
    parentId: null,
    order: 0,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    ...input,
  }
}

const rows: WorldEntry[] = [
  entry({
    id: 1,
    title: 'A',
    // A 手写「共生」，同时正文也 [[B]]：出站只应剩命名边
    relations: [{ targetId: 2, name: 'B', relation: '共生' }],
    document: doc(2),
  }),
  entry({
    id: 2,
    title: 'B',
    // 双边：B 也手写一条指向 A；A 那边应看到「来自 B · 伙伴」
    relations: [{ targetId: 1, name: 'A', relation: '伙伴' }],
    document: doc(1),
  }),
  entry({ id: 3, title: 'C', document: doc(1) }),
  entry({ id: 4, title: 'D', parentId: 1 }),
  entry({
    id: 5,
    title: 'E',
    // 目标已不在库里：保留名字快照，但不可跳转
    relations: [{ targetId: 99, name: '已删除', relation: '旧' }],
  }),
]

const a = buildNoteLinks(rows, 1)
check('A · 命名边出站', a.manual.length === 1 && a.manual[0].name === 'B' && a.manual[0].relation === '共生')
check('A · 正文提及同一目标不重复', a.outbound.length === 0)
check(
  'A · 命名边入站（双边）',
  a.manualInbound.length === 1 && a.manualInbound[0].name === 'B' && a.manualInbound[0].relation === '伙伴',
)
check('A · 正文反查排除已有命名边的来源', a.backlinks.length === 1 && a.backlinks[0].title === 'C')
check('A · 子条目仍是层级投影', a.children.length === 1 && a.children[0].title === 'D')

const b = buildNoteLinks(rows, 2)
check('B · 命名边出站', b.manual.length === 1 && b.manual[0].relation === '伙伴')
check('B · 正文提及同一目标不重复', b.outbound.length === 0)
check('B · 命名边入站', b.manualInbound.length === 1 && b.manualInbound[0].relation === '共生')
check('B · 正文反查排除已有命名边的来源', b.backlinks.length === 0)

const e = buildNoteLinks(rows, 5)
check('E · 目标被删时保留名字且不可跳转', e.manual.length === 1 && e.manual[0].name === '已删除' && e.manual[0].id === undefined)

console.log(`\n共 ${passed} 项断言通过`)
