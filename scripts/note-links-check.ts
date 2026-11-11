/**
 * 笔记关系查询自检：`npx tsx scripts/note-links-check.ts`
 *
 * 盯三件事：
 * - 命名边与正文提及同一目标时只留一行（命名边优先）
 * - 命名边在对方那里变成只读的「来自」，并与正文反查去重
 * - 层级（父 / 子）不受影响，目标被删时保留名字快照
 */
import type { Character, WorldEntry } from '../src/types'
import { buildNoteLinks } from '../src/features/world/hooks/useNoteLinks'
import { hasRef, retitleOneRef } from '../src/lib/reference-labels'

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

const character = {
  id: 1,
  name: '角色甲',
  relatedNotes: [{ targetId: 1, name: 'A', relation: '主角' }],
} as unknown as Character

const a = buildNoteLinks(rows, 1, [character])
check('A · 命名边出站', a.manual.length === 1 && a.manual[0].name === 'B' && a.manual[0].relation === '共生')
check('A · 正文提及同一目标不重复', a.outbound.length === 0)
const noteInbound = a.manualInbound.find((item) => item.kind === 'world')
const characterInbound = a.manualInbound.find((item) => item.kind === 'character')
check(
  'A · 命名边入站（双边 + 角色相关笔记）',
  a.manualInbound.length === 2 &&
    noteInbound?.name === 'B' &&
    noteInbound?.relation === '伙伴' &&
    characterInbound?.relation === '主角',
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

// ── 改名后回写引用：**按类型**改，不能只看 id ──────────────────────────
// 事故形状：角色 1 改名，把正文里指向**笔记 1** 的 `[[链接]]` 也改了 ——
// 用户看到「改了个角色名，某个词条正文里的链接文字跟着变了」。
{
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'wikiLink', attrs: { id: '1', label: '示例词条：转弯' } },
          { type: 'mention', attrs: { id: '1', entityType: 'character', label: '示例角色A' } },
          { type: 'mention', attrs: { id: '1', entityType: 'event', label: '同名事件' } },
        ],
      },
    ],
  }
  const renamed = retitleOneRef(doc, 'character', 1, '新名字')
  const attrs = (renamed?.content as Array<{ content: Array<{ attrs: { label: string } }> }>)[0].content
  check('角色改名：角色提及跟着改', attrs[1].attrs.label === '新名字')
  check('角色改名：同 id 的笔记链接不动', attrs[0].attrs.label === '示例词条：转弯')
  check('角色改名：同 id 的事件提及不动', attrs[2].attrs.label === '同名事件')

  const renamedNote = retitleOneRef(doc, 'world', 1, '示例词条：改了')
  const noteAttrs = (renamedNote?.content as Array<{ content: Array<{ attrs: { label: string } }> }>)[0].content
  check('笔记改名：只改 wikiLink', noteAttrs[0].attrs.label === '示例词条：改了' && noteAttrs[1].attrs.label === '示例角色A')
  check('没有该类型的引用 → 不改并返回 null', retitleOneRef(doc, 'country', 1, '某国') === null)
  check('hasRef 按类型判断', hasRef(doc, 'world', 1) && !hasRef(doc, 'country', 1))
}

console.log(`\n共 ${passed} 项断言通过`)
