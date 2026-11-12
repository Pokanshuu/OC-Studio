/**
 * 创作时间线的行格式自检。
 *
 * 用法：`npx tsx scripts/journal-check.ts`
 *
 * 时间线是「拿给别人看」的东西，所以它的契约只有一条：**每一行都必须能独立
 * 解析回来**。这里只测纯函数（解析 / 过滤 / 导出 Markdown / 时间格式），
 * 磁盘那一侧（只追加、tail 取最后 N 行、拒绝路径逃逸）在
 * `cargo test --lib` 的 `journal::tests` 里。
 */
import {
  buildJournalExport,
  mergeJournalLines,
  formatTimestamp,
  journalKindLabel,
  journalOf,
  parseJournalLine,
  type JournalEntry,
} from '../src/lib/vault/journal'

const failures: string[] = []
let checks = 0

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1
  if (condition) return
  failures.push(detail === undefined ? label : `${label}\n      ${detail}`)
}

function eq(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(label, a === b, `期望 ${b}\n      实际 ${a}`)
}

// ── 行解析 ──────────────────────────────────────────────────────────────

const line = JSON.stringify({
  ts: 1750000000000,
  kind: 'update',
  relPath: '角色/凯尔.md',
  title: '凯尔',
  keys: ['race', 'body'],
  hash: 'abcdef0123456789',
  prevHash: 'ffffffffffffffff',
})

const parsed = parseJournalLine(line)
eq(
  '解析一个正常条目',
  parsed,
  {
    ts: 1750000000000,
    kind: 'update',
    actor: 'human',
    relPath: '角色/凯尔.md',
    title: '凯尔',
    keys: ['race', 'body'],
    hash: 'abcdef0123456789',
    prevHash: 'ffffffffffffffff',
  } satisfies JournalEntry,
)

check('坏 JSON 返回 null', parseJournalLine('{ 这不是 json') === null)
check('未知 kind 返回 null', parseJournalLine('{"kind":"rollback","ts":1}') === null)
check('数组不是条目', parseJournalLine('[1,2,3]') === null)

const partial = parseJournalLine('{"kind":"create"}')
eq(
  '缺字段按默认值补（不炸）',
  [partial?.ts, partial?.relPath, partial?.keys],
  [0, '', []],
)

// ── actor（docs/Agent接入.md §2.2） ─────────────────────────────────────

eq('老记录没有 actor 时按 human', parseJournalLine('{"kind":"update","ts":1}')?.actor, 'human')
eq(
  'agent 身份原样保留',
  parseJournalLine('{"kind":"update","ts":1,"actor":"agent:critic"}')?.actor,
  'agent:critic',
)
eq(
  'plugin 身份原样保留',
  parseJournalLine('{"kind":"update","ts":1,"actor":"plugin:map-gen"}')?.actor,
  'plugin:map-gen',
)
eq('不认识的 actor 不猜，回落 human', parseJournalLine('{"kind":"update","ts":1,"actor":"robot"}')?.actor, 'human')

// ── 过滤 / 文案 ──────────────────────────────────────────────────────────

const entries: JournalEntry[] = [
  { ts: 3, kind: 'update', actor: 'human', relPath: '角色/凯尔.md', title: '凯尔', keys: ['race', 'body'], hash: 'aaa', prevHash: 'bbb' },
  { ts: 2, kind: 'create', actor: 'agent:critic', relPath: '角色/凯尔.md', title: '凯尔', keys: [], hash: 'ccc', prevHash: '' },
  { ts: 1, kind: 'trash', actor: 'plugin:map-gen', relPath: '角色/阿尔法.md', title: '阿尔法', keys: [], hash: 'ddd', prevHash: '' },
]

eq('按笔记过滤', journalOf(entries, '角色/凯尔.md').map((e) => e.ts), [3, 2])
eq('别的笔记不混进来', journalOf(entries, '角色/不存在.md'), [])

eq('种类文案', (['create', 'update', 'trash', 'restore', 'remove'] as const).map(journalKindLabel), [
  '新建',
  '保存',
  '移入回收站',
  '从回收站还原',
  '彻底删除',
])

// ── 时间格式 ────────────────────────────────────────────────────────────

const fixed = new Date(2026, 9, 28, 21, 5).getTime()
eq('时间格式（本地时区，分钟补零）', formatTimestamp(fixed), '2026-10-28 21:05')
eq('非法时间不抛错', formatTimestamp(Number.NaN), '未知时间')

// ── 导出 JSON ───────────────────────────────────────────────────────────

const exported = buildJournalExport(entries, { relPath: '角色/凯尔.md', title: '凯尔' })
eq('导出带版本号', exported.version, 1)
eq('导出标明来源应用', exported.app, 'oc-studio')
eq('导出附带这条笔记的路径', exported.note, { relPath: '角色/凯尔.md', title: '凯尔' })
eq('导出的条目数', exported.entries.length, 3)
eq('条目带人能读的时间', exported.entries[0]?.time, formatTimestamp(3))
eq('条目带人能读的种类', exported.entries[0]?.kindLabel, '保存')
eq('条目保留原始机器字段', exported.entries[0]?.keys, ['race', 'body'])
check('导出是合法 JSON', (() => { try { JSON.parse(JSON.stringify(exported)); return true } catch { return false } })())
const emptyExport = buildJournalExport([], { relPath: 'x.md', title: 'x' })
eq('空时间线也能导出', emptyExport.entries, [])

// ── 备份合并：同一份备份导两次不能出现两份记录 ──────────────────────────
{
  const line = (ts: number, relPath: string, hash: string): string =>
    JSON.stringify({ ts, kind: 'update', actor: 'human', relPath, title: 't', keys: ['body'], hash, prevHash: 'p' })

  const existing = [line(1, '角色/甲.md', 'aaa')]
  const incoming = [line(1, '角色/甲.md', 'aaa'), line(2, '角色/甲.md', 'bbb')]
  const fresh = mergeJournalLines(existing, incoming)
  eq('合并：只追加本地没有的那条', fresh, [line(2, '角色/甲.md', 'bbb')])

  // 键顺序 / 空格不同但内容一样 → 仍算同一条（备份可能被别的工具重新序列化）
  const reformatted = `{ "hash": "aaa", "ts": 1, "relPath": "角色/甲.md", "kind": "update", "actor": "human", "title": "t", "keys": ["body"], "prevHash": "p" }`
  eq('合并：重新序列化的同一条不重复', mergeJournalLines(existing, [reformatted]), [])

  eq('合并：空备份不动本地', mergeJournalLines(existing, []), [])
  eq('合并：空行被丢掉', mergeJournalLines([], ['', '  ']), [])

  // 坏行：备份里带着就带上，但重复导入不叠加
  const broken = '{"ts":  broken json'
  eq('合并：坏行原样带上', mergeJournalLines([], [broken]), [broken])
  eq('合并：坏行重复导入不叠加', mergeJournalLines([broken], [broken]), [])

  // 幂等：把上一次的结果再并一次，应当没有新增
  const second = mergeJournalLines([...existing, ...fresh], incoming)
  eq('合并：再并一次没有新增（幂等）', second, [])
}

// ── 结果 ────────────────────────────────────────────────────────────────

if (failures.length === 0) {
  console.log(`✓ 时间线自检通过（${checks} 项断言）`)
  process.exit(0)
}

console.error(`✗ ${failures.length} / ${checks} 项断言失败：\n`)
for (const failure of failures) console.error(`  - ${failure}\n`)
process.exit(1)
