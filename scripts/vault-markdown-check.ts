/**
 * 正文桥（Markdown ⇄ Tiptap JSON）的离线校验。
 *
 * 用法：
 *   npx tsx scripts/vault-markdown-check.ts [vault 路径]
 *
 * 校验的核心性质是**幂等**：`md → tiptap → md → tiptap` 两轮的 Tiptap 结果
 * 必须深度相等。这是「用户在 Obsidian 里写的东西，经过编辑器一轮之后不会被
 * 悄悄改写」的可执行证明 —— 只要有一处转义或标记嵌套不稳定，它就会红。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import {
  markdownToTiptap,
  tiptapToMarkdown,
  type LinkRef,
  type ResolvedLink,
  type TiptapDoc,
  type TiptapNode,
} from '../src/lib/vault/markdown'

// 默认指向环境变量里的 vault；没有就要求显式传路径（不把作者本机的目录写进仓库）
const DEFAULT_VAULT = process.env.VAULT_PATH ?? ''
const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.claude', '.claudian', '.trash'])

// ── 断言与汇总 ──────────────────────────────────────────────────────────

const failures: string[] = []
let checks = 0

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1
  if (condition) return
  failures.push(detail === undefined ? label : `${label}\n      ${detail}`)
}

/** 忽略对象键顺序的深度比较：键序不同不算差异，缺失与 undefined 等价 */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      const child = record[key]
      if (child === undefined) continue
      out[key] = sortKeys(child)
    }
    return out
  }
  return value
}

function deepEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

/** 正文里的 `[[...]]` / `![[...]]` 原文，排序后用于比较（多重集语义） */
function linkTexts(markdown: string): string[] {
  const out: string[] = []
  for (const match of markdown.matchAll(/!?\[\[[^[\]\n]+?\]\]/g)) out.push(match[0])
  return out.sort()
}

function shortDiff(a: string, b: string): string {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a[index] === b[index]) index += 1
  const from = Math.max(0, index - 40)
  return [
    `首个差异在第 ${index} 个字符处`,
    `      期望片段: ${JSON.stringify(a.slice(from, index + 60))}`,
    `      实际片段: ${JSON.stringify(b.slice(from, index + 60))}`,
  ].join('\n')
}

// ── 假解析器 ────────────────────────────────────────────────────────────
//
// 真实的实体解析由调用点接线；这里只要能稳定地产生节点即可。
// 关键是 `attrs.raw = ref.raw` —— 带锚点/别名的链接能不能原样往返，
// 全靠这个字段，假解析器也必须带上，否则断言没有意义。

const MENTION_PREFIXES: Record<string, string> = {
  角色: 'character',
  事件: 'event',
  国家: 'country',
}

function fakeResolveLink(ref: LinkRef): ResolvedLink {
  if (ref.target === '') {
    // `[[#标题]]`：指向本文件某个标题，没有实体可查。
    // 仍然要产出节点并带上 raw，否则方括号会在写回时被抹掉。
    return { type: 'wikiLink', attrs: { id: '', label: ref.anchor ?? ref.raw, raw: ref.raw } }
  }
  const slash = ref.target.indexOf('/')
  const prefix = slash === -1 ? '' : ref.target.slice(0, slash)
  const entityType = MENTION_PREFIXES[prefix]
  const label = ref.alias ?? ref.target
  if (entityType !== undefined) {
    return { type: 'mention', attrs: { id: ref.target, label, entityType, raw: ref.raw } }
  }
  return { type: 'wikiLink', attrs: { id: ref.target, label, raw: ref.raw } }
}

/** 与接线约定一致：raw 优先，缺失才回落到 label */
function fakeSerializeLink(node: TiptapNode): string | null {
  const raw = node.attrs?.raw
  if (typeof raw === 'string' && raw !== '') return `[[${raw}]]`
  const label = node.attrs?.label
  if (typeof label === 'string' && label !== '') return `[[${label}]]`
  return null
}

interface BridgeRun {
  t1: TiptapDoc
  md1: string
  t2: TiptapDoc
  md2: string
  hasFallback: boolean
  unsupported: string[]
}

function runBridge(markdown: string): BridgeRun {
  const t1 = markdownToTiptap(markdown, { resolveLink: fakeResolveLink })
  const first = tiptapToMarkdown(t1, { serializeLink: fakeSerializeLink })
  const t2 = markdownToTiptap(first.markdown, { resolveLink: fakeResolveLink })
  const second = tiptapToMarkdown(t2, { serializeLink: fakeSerializeLink })
  return {
    t1,
    md1: first.markdown,
    t2,
    md2: second.markdown,
    hasFallback: first.hasFallback,
    unsupported: first.unsupported,
  }
}

// ── 文本级断言 ──────────────────────────────────────────────────────────
//
// 「文档幂等」不等于「文本幂等」：应用写盘是整份正文替换，所以真正需要的是
//   tiptapToMarkdown(markdownToTiptap(md)).markdown === md   （逐字节）
//
// 有三处排版差异**在 ProseMirror 的文档模型里没有位置**，无论怎么写回都还原不了：
//
//   A 块间空行数  —— 节点只记录「有哪些块」，不记录间隔了几行。实测同一个 vault
//                    里同一层级标题后面有的空一行、有的不空，也没有风格规律可猜。
//   B 表格排版    —— 分隔行写几道横杠（`|----|` 还是 `| --- |`）、单元格有没有
//                    空格填充。markdown-it 给的是去填充后的单元格文本。
//                    （`rawSeparator` 已实现，但需要 Table 扩展声明该属性才能
//                    穿过编辑器，否则 ProseMirror 会丢掉未知属性。）
//   C 强调定界符位置 —— `**A**B**C**` 在 CommonMark 里是「strong 套 strong」，
//                    而 ProseMirror 的同一文本节点不能带两个 bold，嵌套会被压成
//                    一层，于是 A、B、C 全成粗体、定界符位置无法还原。
//   D 转义力度      —— 最小转义要经过「重新解析自校验」，个别行校验不过时会退回
//                    全量转义（保守但会多出 `\*` 这类反斜杠）。这是**安全**的
//                    选择：宁可多转义，也不产出重新解析后结构会变的内容。
//
// 所以文本级断言分两层，并把每一条严格层差异**归因**到上述四类之一：
//   · 严格层：逐字节相等的篇数，如实报告
//   · 归因层：每条差异都必须落进 A / B / C / D，落不进去的就是真失败（必须为 0）
// 归因只逐级放宽「空行 / 表格行填充 / 强调符位置 / 转义反斜杠」，正文、代码块内容、
// 链接原文一律不动，所以它掩盖不了内容层面的差异。
// 另外，「输出与原文语义等价」由 idempotent 断言独立保证（parse(原文) === parse(输出)）。

type DiffCategory = 'blank-lines' | 'table-layout' | 'emphasis-delimiters' | 'escape-level'

interface StrictDiff {
  relPath: string
  category: DiffCategory | 'unclassified'
  detail: string
}

/** 按行变换，但**跳过围栏代码块内部**（那里是内容，不能归一化） */
function mapLinesOutsideFence(markdown: string, transform: (line: string) => string | null): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let fenceChar = ''

  for (const line of lines) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence !== null) {
      const marker = fence[1][0]
      if (fenceChar === '') fenceChar = marker
      else if (marker === fenceChar) fenceChar = ''
      out.push(line)
      continue
    }
    if (fenceChar !== '') {
      out.push(line)
      continue
    }
    const mapped = transform(line)
    if (mapped !== null) out.push(mapped)
  }

  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
  return out.join('\n')
}

/** A：去掉所有空行（块间空几行是模型里没有的信息） */
function dropBlankLines(markdown: string): string {
  return mapLinesOutsideFence(markdown, (line) => (line.trim() === '' ? null : line))
}

/** B：表格行归一（单元格 trim、分隔行统一成 `---`），列数不变 */
function canonicalizeTableRows(markdown: string): string {
  return mapLinesOutsideFence(markdown, (line) => {
    if (!line.trimStart().startsWith('|')) return line
    const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    // 只按未转义的管道符切分：单元格里的 `\|` 是内容
    const cells = inner.split(/(?<!\\)\|/).map((cell) => cell.trim())
    if (cells.every((cell) => cell === '' || /^:?-+:?$/.test(cell))) {
      return `| ${cells.map(() => '---').join(' | ')} |`
    }
    return `| ${cells.join(' | ')} |`
  })
}

/** C：去掉强调/删除线定界符，只留文本（用来判定差异是否仅为定界符位置） */
function stripEmphasisMarkers(markdown: string): string {
  return mapLinesOutsideFence(markdown, (line) => line.replace(/[*_~]/g, ''))
}

/**
 * D：还原转义（去掉「反斜杠 + 标点」里的反斜杠）。
 * 这正是 markdown 转义的语义，所以这一步不会掩盖正文差异，
 * 只会让「多转义了一层」与「没转义」变得相同。
 */
function undoEscapes(markdown: string): string {
  return mapLinesOutsideFence(markdown, (line) => line.replace(/\\(?=[^\p{L}\p{N}\s])/gu, ''))
}

/** 第一处差异的可读描述，用于报告 */
function attributeFirstDiff(expected: string, actual: string): string {
  const a = expected.split('\n')
  const b = actual.split('\n')
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i += 1) {
    const left = a[i]
    const right = b[i]
    if (left === right) continue
    if (left === undefined) return `多出第 ${i + 1} 行：${JSON.stringify(right)}`
    if (right === undefined) return `少了第 ${i + 1} 行：${JSON.stringify(left)}`
    return `第 ${i + 1} 行：${JSON.stringify(left)} → ${JSON.stringify(right)}`
  }
  return '长度不同但逐行相同（尾随换行差异）'
}

/** 把一条严格层差异归因到 A / B / C / D；落不进去就是真失败 */
function classifyDiff(expected: string, actual: string): DiffCategory | 'unclassified' {
  const noBlankExpected = dropBlankLines(expected)
  const noBlankActual = dropBlankLines(actual)
  if (noBlankExpected === noBlankActual) return 'blank-lines'

  const tableExpected = canonicalizeTableRows(noBlankExpected)
  const tableActual = canonicalizeTableRows(noBlankActual)
  if (tableExpected === tableActual) return 'table-layout'

  const strippedExpected = stripEmphasisMarkers(tableExpected)
  const strippedActual = stripEmphasisMarkers(tableActual)
  if (strippedExpected === strippedActual) return 'emphasis-delimiters'

  if (undoEscapes(strippedExpected) === undoEscapes(strippedActual)) return 'escape-level'
  return 'unclassified'
}

/**
 * 在**能定位这一类差异的那个层级**上给出可读描述。
 * 否则 A 类之外的条目会显示成「第一处差异」（往往正好是个空行），看起来像归错了类。
 */
function detailFor(category: DiffCategory | 'unclassified', expected: string, actual: string): string {
  switch (category) {
    case 'blank-lines':
      return attributeFirstDiff(expected, actual)
    case 'table-layout':
      return attributeFirstDiff(dropBlankLines(expected), dropBlankLines(actual))
    case 'emphasis-delimiters':
      return attributeFirstDiff(
        canonicalizeTableRows(dropBlankLines(expected)),
        canonicalizeTableRows(dropBlankLines(actual)),
      )
    case 'escape-level':
      return attributeFirstDiff(
        stripEmphasisMarkers(canonicalizeTableRows(dropBlankLines(expected))),
        stripEmphasisMarkers(canonicalizeTableRows(dropBlankLines(actual))),
      )
    default:
      return attributeFirstDiff(expected, actual)
  }
}

/** 每个用例的共同断言：两轮 Tiptap 相等、两轮 Markdown 相等 */
function checkIdempotent(label: string, run: BridgeRun): void {
  check(
    `${label}：两轮 Tiptap 深度相等`,
    deepEqual(run.t1, run.t2),
    deepEqual(run.t1, run.t2) ? undefined : shortDiff(canonical(run.t1), canonical(run.t2)),
  )
  check(
    `${label}：两轮 Markdown 相同（不动点）`,
    run.md1 === run.md2,
    run.md1 === run.md2 ? undefined : shortDiff(run.md1, run.md2),
  )
}

// ── 定向用例 ────────────────────────────────────────────────────────────

function targetedCases(): void {
  section('定向用例')

  // 1) 带锚点 / 带别名的链接必须逐字往返
  const anchorCases = [
    '[[条目#锚点]]',
    '[[条目#锚点|别名]]',
    '[[条目]]',
    '[[角色/亚瑟|亚瑟]]',
    '参见 [[条目#锚点]] 与 [[条目#锚点|别名]] 两处。',
  ]
  for (const source of anchorCases) {
    const run = runBridge(`${source}\n`)
    checkIdempotent(`锚点/别名「${source}」`, run)
    check(
      `锚点/别名「${source}」：链接原文逐字保留`,
      deepEqual(linkTexts(run.md1), linkTexts(`${source}\n`)),
      `期望 ${JSON.stringify(linkTexts(`${source}\n`))}，实际 ${JSON.stringify(linkTexts(run.md1))}`,
    )
  }

  // 2) GFM 管道表（含表头、多列、单元格内加粗与行内代码）
  const table = [
    '| 名称 | 说明 | 备注 |',
    '| --- | --- | --- |',
    '| 甲 | **粗体** | 第三列 |',
    '| 乙 | `代码` | 短 |',
    '',
  ].join('\n')
  const tableRun = runBridge(table)
  checkIdempotent('表格', tableRun)
  check('表格：未触发兜底块', !tableRun.hasFallback, `实际不支持项 ${JSON.stringify(tableRun.unsupported)}`)
  check(
    '表格：仍产出 GFM 分隔行',
    /\|\s*---\s*\|\s*---\s*\|\s*---\s*\|/.test(tableRun.md1),
    JSON.stringify(tableRun.md1),
  )
  check(
    '表格：单元格内的加粗被保住',
    tableRun.md1.includes('**粗体**'),
    JSON.stringify(tableRun.md1),
  )

  // 3) <small> 必须保持为标记，不能被转义成文本
  const smallRun = runBridge('<small>（注：这是一条小字）</small>\n')
  checkIdempotent('<small>', smallRun)
  check('<small>：输出里仍是 <small> 标记', smallRun.md1.includes('<small>'), JSON.stringify(smallRun.md1))
  check('<small>：没有被转义成 \\<small\\>', !smallRun.md1.includes('\\<'), JSON.stringify(smallRun.md1))
  const smallMark = smallRun.t1.content[0]?.content?.[0]
  check(
    '<small>：解析成 small 标记',
    smallMark?.marks?.some((mark) => mark.type === 'small') === true,
    JSON.stringify(smallMark),
  )

  // 4) H5 / H6 降级为 H4，但一个字都不能丢
  const headingRun = runBridge('##### 五级标题文字\n\n###### 六级标题文字\n')
  checkIdempotent('标题降级', headingRun)
  const levels = headingRun.t1.content.map((node) => node.attrs?.level)
  check('标题降级：H5/H6 都降为 4', deepEqual(levels, [4, 4]), JSON.stringify(levels))
  check(
    '标题降级：文本未丢失',
    headingRun.md1.includes('五级标题文字') && headingRun.md1.includes('六级标题文字'),
    JSON.stringify(headingRun.md1),
  )

  // 5) 其余结构性用例
  const structural: [string, string][] = [
    ['嵌套列表', '- 父项\n  - 子项一\n  - 子项二\n- 父项二\n'],
    ['松散列表（项内两段）', '- 第一段\n\n  第二段\n'],
    ['有序列表起点', '3. 三\n4. 四\n'],
    ['任务列表', '- [ ] 未做\n- [x] 已做\n'],
    ['引用块', '> 引用第一行\n>\n> 引用第二行\n'],
    ['分割线', '文字段落\n\n***\n\n后续段落\n'],
    ['代码块 text', '```text\n纯文本内容\n```\n'],
    ['行内代码含反引号', '正文 `a``b` 结束\n'],
    ['硬换行', '第一行\\\n第二行\n'],
    ['实体与特殊字符', 'A &amp; B，还有 *星号* 与 _下划线_ 与 [方括号]。\n'],
    ['行首像列表的段落', '1\\. 这行是正文不是列表\n\n\\- 这行也是正文\n'],
    ['图片（默认语法）', '![](素材/示例.png)\n'],
    ['块级 HTML', '<div>\n  块级 HTML 内容\n</div>\n'],
    ['标题与粗体混排', '## 标题 **加粗** 与 `代码`\n'],
    ['链接（markdown 语法）', '[示例](https://example.com/a b)\n'],
  ]
  for (const [label, source] of structural) {
    const run = runBridge(source)
    checkIdempotent(label, run)
  }

  // 6) raw 缺失时的回落路径：模拟「用户在编辑器里新插入的引用」
  const inserted: TiptapDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'wikiLink', attrs: { id: '42', label: '亚瑟' } }],
      },
    ],
  }
  const insertedMd = tiptapToMarkdown(inserted, { serializeLink: fakeSerializeLink })
  check(
    'raw 缺失：回落到 label 拼出 [[亚瑟]]',
    insertedMd.markdown === '[[亚瑟]]',
    JSON.stringify(insertedMd.markdown),
  )

  // 7) 自定义 serializeImage 走 ![[...]] 也要能读回来
  const imageDoc: TiptapDoc = {
    type: 'doc',
    content: [{ type: 'imageBlock', attrs: { src: '素材/封面.png', width: null } }],
  }
  const embedMd = tiptapToMarkdown(imageDoc, {
    serializeLink: fakeSerializeLink,
    serializeImage: (node) => `![[${String(node.attrs?.src ?? '')}]]`,
  })
  check('自定义图片语法：输出 ![[素材/封面.png]]', embedMd.markdown === '![[素材/封面.png]]', JSON.stringify(embedMd.markdown))
  const embedBack = markdownToTiptap(embedMd.markdown, { resolveLink: fakeResolveLink })
  check(
    '自定义图片语法：能被读回 imageBlock',
    embedBack.content[0]?.type === 'imageBlock' && embedBack.content[0]?.attrs?.src === '素材/封面.png',
    JSON.stringify(embedBack),
  )

  // 8) 兜底块：构造一个无法表达的节点，验证「原文 JSON 完整还原」
  const exotic: TiptapDoc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '正文照常可读' }] },
      { type: 'mysteryBlock', attrs: { why: 'schema 里没有这个节点' } },
    ],
  }
  const fallback = tiptapToMarkdown(exotic, { serializeLink: fakeSerializeLink })
  check('兜底块：hasFallback 为真', fallback.hasFallback)
  check(
    '兜底块：记下无法表达的节点类型',
    fallback.unsupported.includes('mysteryBlock'),
    JSON.stringify(fallback.unsupported),
  )
  check('兜底块：正文仍然可读', fallback.markdown.includes('正文照常可读'), JSON.stringify(fallback.markdown))
  const restored = markdownToTiptap(fallback.markdown, { resolveLink: fakeResolveLink })
  check(
    '兜底块：原始 JSON 被完整还原（与原文深度相等）',
    deepEqual(restored, exotic),
    shortDiff(canonical(exotic), canonical(restored)),
  )

  // 9) 相邻同标记文本不能产出 `**a****b**`（实测会被解析成一个 strong）
  const adjacent: TiptapDoc = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
        ],
      },
    ],
  }
  const adjacentFirst = tiptapToMarkdown(adjacent, { serializeLink: fakeSerializeLink })
  const adjacentBack = markdownToTiptap(adjacentFirst.markdown, { resolveLink: fakeResolveLink })
  const adjacentSecond = tiptapToMarkdown(adjacentBack, { serializeLink: fakeSerializeLink })
  check(
    '相邻同标记文本：合并后再输出（稳定，不是 `**a****b**`）',
    adjacentFirst.markdown === adjacentSecond.markdown,
    shortDiff(adjacentFirst.markdown, adjacentSecond.markdown),
  )
}

// ── 真实 vault 全量 ─────────────────────────────────────────────────────

interface VaultFile {
  relPath: string
  body: string
}

function walkVault(root: string): VaultFile[] {
  const files: VaultFile[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(full)
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      files.push({
        relPath: relative(root, full).split(sep).join('/'),
        body: stripFrontmatter(readFileSync(full, 'utf8')),
      })
    }
  }
  walk(root)
  files.sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh-Hans'))
  return files
}

/** 与 src/lib/vault/frontmatter.ts 一致：只认第一个 `---` 块 */
function stripFrontmatter(source: string): string {
  const text = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source
  const lines = text.split(/\r?\n/)
  let start = 0
  while (start < lines.length && lines[start].trim() === '') start += 1
  if (lines[start]?.trim() !== '---') return text
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() !== '---') continue
    const tail = lines.slice(i + 1)
    if (tail.length > 0 && tail[0].trim() === '') tail.shift()
    return tail.join('\n')
  }
  return text
}

function vaultRun(root: string): void {
  section(`真实 vault 全量：${root}`)

  let files: VaultFile[]
  try {
    files = walkVault(root)
  } catch (err) {
    check('读取 vault', false, err instanceof Error ? err.message : String(err))
    return
  }

  check('vault 里找到了 .md 文件', files.length > 0, `实际 ${files.length}`)

  const unsupportedHistogram = new Map<string, number>()
  const fallbackFiles: string[] = []
  const brokenFiles: string[] = []
  const linkBrokenFiles: string[] = []
  const crashedFiles: { relPath: string; message: string }[] = []
  /** 严格层（逐字节）的差异，逐条归因 */
  const strictDiffs: StrictDiff[] = []
  let strictExact = 0
  let totalLinks = 0
  let anchoredLinks = 0
  let aliasedLinks = 0
  let hardBreakParagraphs = 0

  for (const file of files) {
    try {
      const run = runBridge(file.body)

      if (!deepEqual(run.t1, run.t2)) {
        brokenFiles.push(`${file.relPath}｜${shortDiff(canonical(run.t1), canonical(run.t2))}`)
      }
      if (run.md1 !== run.md2) {
        brokenFiles.push(`${file.relPath}｜Markdown 两轮不同｜${shortDiff(run.md1, run.md2)}`)
      }
      if (run.hasFallback) {
        fallbackFiles.push(file.relPath)
        for (const type of run.unsupported) {
          unsupportedHistogram.set(type, (unsupportedHistogram.get(type) ?? 0) + 1)
        }
      }

      const before = linkTexts(file.body)
      const after = linkTexts(run.md1)
      if (!deepEqual(before, after)) {
        linkBrokenFiles.push(
          `${file.relPath}｜期望 ${JSON.stringify(before)}｜实际 ${JSON.stringify(after)}`,
        )
      }

      // 文本级：严格逐字节；不等则必须能归因到 A/B/C 三类之一
      if (run.md1 === file.body) {
        strictExact += 1
      } else {
        const category = classifyDiff(file.body, run.md1)
        strictDiffs.push({
          relPath: file.relPath,
          category,
          detail: detailFor(category, file.body, run.md1),
        })
      }

      totalLinks += before.length
      for (const text of before) {
        if (text.includes('#')) anchoredLinks += 1
        if (text.includes('|')) aliasedLinks += 1
      }
      hardBreakParagraphs += countNodes(run.t1, 'hardBreak')
    } catch (err) {
      crashedFiles.push({ relPath: file.relPath, message: err instanceof Error ? err.message : String(err) })
    }
  }

  const converted = files.length - crashedFiles.length
  const unclassified = strictDiffs.filter((diff) => diff.category === 'unclassified')
  const byCategory = (category: DiffCategory): StrictDiff[] =>
    strictDiffs.filter((diff) => diff.category === category)

  check('没有文件在转换中抛错', crashedFiles.length === 0, JSON.stringify(crashedFiles.slice(0, 3)))
  check(`全部 ${files.length} 篇两轮 Tiptap 深度相等`, brokenFiles.length === 0, brokenFiles.slice(0, 4).join('\n      '))
  check('全部文件的 [[...]] 原文逐字保留', linkBrokenFiles.length === 0, linkBrokenFiles.slice(0, 4).join('\n      '))
  check(
    '全部严格层差异都能归因到 A(块间空行) / B(表格排版) / C(强调定界符位置) / D(转义力度)',
    unclassified.length === 0,
    unclassified.slice(0, 6).map((diff) => `${diff.relPath}｜${diff.detail}`).join('\n      '),
  )

  const ratio = files.length === 0 ? 0 : (fallbackFiles.length / files.length) * 100
  report('processed files', String(files.length))
  report('idempotent (t1 == t2)', String(converted - brokenFiles.length))
  report('link text preserved', String(converted - linkBrokenFiles.length))
  report('wikilinks total', String(totalLinks))
  report('  with anchor `#`', String(anchoredLinks))
  report('  with alias `|`', String(aliasedLinks))
  report('hardBreak nodes (softbreak→hardBreak)', String(hardBreakParagraphs))
  report('files with fallback', `${fallbackFiles.length} / ${files.length}  (${ratio.toFixed(1)}%)`)
  report('text byte-exact (strict)', `${strictExact} / ${converted}`)
  report('text diff unexplained', `${unclassified.length} / ${converted}`)
  for (const [label, category] of [
    ['A 块间空行数', 'blank-lines'],
    ['B 表格排版风格', 'table-layout'],
    ['C 强调定界符位置', 'emphasis-delimiters'],
    ['D 转义力度（保守多转义）', 'escape-level'],
  ] as [string, DiffCategory][]) {
    const list = byCategory(category)
    report(`  diff ${label}`, `${list.length} 篇`)
    for (const diff of list.slice(0, 3)) process.stdout.write(`      · ${diff.relPath}｜${diff.detail}\n`)
    if (list.length > 3) process.stdout.write(`      … 另有 ${list.length - 3} 篇\n`)
  }
  if (unsupportedHistogram.size > 0) {
    report(
      'fallback triggers',
      [...unsupportedHistogram.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', '),
    )
  }
  if (fallbackFiles.length > 0) {
    report('fallback files', fallbackFiles.slice(0, 8).join(', ') + (fallbackFiles.length > 8 ? ', …' : ''))
  }
}

function countNodes(node: TiptapNode | TiptapDoc, type: string): number {
  let count = 0
  const visit = (current: TiptapNode): void => {
    if (current.type === type) count += 1
    for (const child of current.content ?? []) visit(child)
  }
  for (const child of (node as TiptapDoc).content ?? []) visit(child)
  return count
}

// ── 输出 ────────────────────────────────────────────────────────────────

function section(title: string): void {
  process.stdout.write(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}\n`)
}

function report(label: string, value: string): void {
  process.stdout.write(`  ${label.padEnd(40)} ${value}\n`)
}

function main(): void {
  const root = process.argv[2] ?? DEFAULT_VAULT
  targetedCases()
  if (!root) {
    process.stderr.write('需要 vault 路径：npx tsx scripts/vault-markdown-check.ts "<vault>"（或设 VAULT_PATH）\n')
    process.exit(1)
  }
  vaultRun(root)

  section('汇总')
  report('断言总数', String(checks))
  report('失败数', String(failures.length))
  if (failures.length > 0) {
    process.stdout.write('\n失败明细：\n')
    for (const failure of failures.slice(0, 20)) process.stdout.write(`  ✗ ${failure}\n`)
    if (failures.length > 20) process.stdout.write(`  … 另有 ${failures.length - 20} 条\n`)
  }
  process.stdout.write(failures.length === 0 ? '\n全部通过 ✓\n' : '\n存在失败 ✗\n')
  if (failures.length > 0) process.exit(1)
}

main()
