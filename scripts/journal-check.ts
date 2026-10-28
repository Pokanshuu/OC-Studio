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

// ── 过滤 / 文案 ──────────────────────────────────────────────────────────

const entries: JournalEntry[] = [
  { ts: 3, kind: 'update', relPath: '角色/凯尔.md', title: '凯尔', keys: ['race', 'body'], hash: 'aaa', prevHash: 'bbb' },
  { ts: 2, kind: 'create', relPath: '角色/凯尔.md', title: '凯尔', keys: [], hash: 'ccc', prevHash: '' },
  { ts: 1, kind: 'trash', relPath: '角色/阿尔法.md', title: '阿尔法', keys: [], hash: 'ddd', prevHash: '' },
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

// ── 结果 ────────────────────────────────────────────────────────────────

if (failures.length === 0) {
  console.log(`✓ 时间线自检通过（${checks} 项断言）`)
  process.exit(0)
}

console.error(`✗ ${failures.length} / ${checks} 项断言失败：\n`)
for (const failure of failures) console.error(`  - ${failure}\n`)
process.exit(1)
