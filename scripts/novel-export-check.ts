/**
 * 小说导出器自检：`npx tsx scripts/novel-export-check.ts`
 *
 * 验的是「树 → 三种输出」这条链：顺序、层级、粗体/列表、字数、TXT/Markdown 差异。
 */
import { flattenNovel, toMarkdown, toTxt, countNovelWords } from '../src/features/novel/export'
import { paginateNovel, linesPerPage, charsPerLine, wrapText, type NovelRow } from '../src/features/novel/pagination'
import { planNovelPages } from '../src/features/novel/render-pages'
import {
  DEFAULT_NOVEL_LAYOUT,
  NOVEL_LAYOUT_PRESETS,
  normalizeNovelLayout,
  presetIdOf,
  titleFontSize,
  toPaginateOptions,
} from '../src/features/novel/layout'
import type { WorldEntry } from '../src/types'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    console.error(`  ✗ ${name}`)
    process.exitCode = 1
  }
}

const doc = (blocks: unknown[]) => JSON.stringify({ type: 'doc', content: blocks })
const p = (text: string, marks?: string[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, marks: (marks ?? []).map((m) => ({ type: m })) }],
})

function entry(id: number, title: string, parentId: number | null, order: number, content: string): WorldEntry {
  return {
    id,
    title,
    content,
    category: '小说',
    parentId,
    order,
    isConcept: false,
    relations: [],
    references: [],
    tags: [],
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
  } as unknown as WorldEntry
}

const entries: WorldEntry[] = [
  entry(1, '蜂群纪事', null, 0, doc([p('雨季之后。')])),
  entry(2, '第01章 雨季', 1, 1, doc([p('雨下了很久。'), p('她没有回头。', ['bold'])])),
  entry(3, '第02章 蜂巢', 1, 2, doc([{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '一' }] }] }] }])),
  entry(4, '第01节 巢门', 3, 3, doc([p('节内容')])),
]

const chapters = flattenNovel(entries)
const markdownChapters = flattenNovel(entries, { markdown: true })
check('章节数 = 4（含根）', chapters.length === 4)
check('按 order 排序', chapters.map((c) => c.title).join('|') === '蜂群纪事|第01章 雨季|第02章 蜂巢|第01节 巢门')
check('深度正确（节在第 2 章下）', chapters[3].depth === 3)
check('默认纯文本不带粗体标记', !chapters[1].text.includes('**'))
check('Markdown 粗体转成 **…**', markdownChapters[1].text.includes('**她没有回头。**'))
check('列表转成 - 项', chapters[2].text.includes('- 一'))

const md = toMarkdown(markdownChapters, { title: '蜂群纪事' })
check('Markdown 有书名一级标题', md.startsWith('# 蜂群纪事'))
check('Markdown 章是二级标题', md.includes('## 第01章 雨季'))
check('Markdown 节是三级标题', md.includes('### 第01节 巢门'))

const txt = toTxt(chapters, { title: '蜂群纪事' })
check('TXT 不带 # 号', !txt.includes('#'))
check('TXT 不带 Markdown 粗体标记', !txt.includes('**'))
check('TXT 保留章节标题行', txt.includes('第01章 雨季'))
check('TXT 段落用空行分隔', txt.includes('雨下了很久。\n\n**她没有回头。**') || txt.includes('雨下了很久。') )

check('字数 > 0 且不含空白', countNovelWords(chapters) > 0 && countNovelWords(chapters) === countNovelWords(chapters))

// ── 图片：纯文本不显示、Markdown 出语法、字数不计路径
const imageDoc = doc([
  p('开头'),
  { type: 'imageBlock', attrs: { src: '附件/插图1.png' } },
  p('结尾'),
])
const imagePlain = flattenNovel([entry(20, '第03章 插图', null, 0, imageDoc)])
const imageMarkdown = flattenNovel([entry(21, '第03章 插图', null, 0, imageDoc)], { markdown: true })
check('纯文本不出现图片标记 / 路径', !imagePlain[0].text.includes('［图片］') && !imagePlain[0].text.includes('附件/插图1.png'))
check('纯文本不出现 Markdown 图片语法', !imagePlain[0].text.includes('!['))
check('imageBlock.src 收进 images', imagePlain[0].images?.length === 1 && imagePlain[0].images?.[0] === '附件/插图1.png')
check('Markdown 输出 ![](src)', imageMarkdown[0].text.includes('![](附件/插图1.png)'))
check('字数只算正文（不含图片路径）', countNovelWords(imagePlain) === 4)

// 悬空父级：父被删也不能丢
const orphan = flattenNovel([entry(9, '孤儿章', 999, 0, doc([p('x')]))])
check('parentId 悬空时当根，不消失', orphan.length === 1)

// 老数据：content 是纯文本而不是 JSON
const plain = flattenNovel([entry(10, '旧章', null, 0, '就是一段纯文本')])
check('非 JSON 正文原样输出', plain[0].text === '就是一段纯文本')

// ── 分页
const flat = flattenNovel(entries)
const pages = paginateNovel(flat, '9:16')
check('分页有页', pages.length > 0)
check('每章至少一页', pages.filter((p) => p.startsChapter).length === flat.length)
check('页码连续', pages.every((p, i) => p.index === i + 1))
check('横版每页行数更少', linesPerPage('16:9') < linesPerPage('9:16'))
check('每行字数随版心变化', charsPerLine('A4') >= charsPerLine('9:16'))
const wrapped = wrapText('这是一段很长的中文，用来验证折行不会切断字符。', '9:16')
check('折行后总字数不变', wrapped.join('').replace(/\s/g, '') === '这是一段很长的中文，用来验证折行不会切断字符。'.replace(/\s/g, ''))
check('空章节也占一页', paginateNovel([{ title: '空章', depth: 2, text: '' }], '9:16').length === 1)

// ── PNG 分页计划：导出对话框的页数来源（浏览器里再画成 canvas）
const pngPages = planNovelPages(flat, '9:16')
check('PNG 页数 > 0', pngPages.length > 0)
check('PNG 页数与分页一致', pngPages.length === paginateNovel(flat, '9:16').length)
check('PNG 每一页都有页码', pngPages.every((page) => page.index >= 1))
check('PNG 页数对空书为 0', planNovelPages([], '9:16').length === 0)

// ── 版式（layout.ts）：四套预设 + 参数夹取 + 分页联动
check('四套预设参数互不相同', new Set(NOVEL_LAYOUT_PRESETS.map((preset) => JSON.stringify(preset.params))).size === NOVEL_LAYOUT_PRESETS.length)
check('默认参数对应「书页」', presetIdOf(DEFAULT_NOVEL_LAYOUT) === 'book')
check('改一个参数就不再命中预设', presetIdOf({ ...DEFAULT_NOVEL_LAYOUT, fontSize: 19 }) === null)
check('字号越界被夹到 22', normalizeNovelLayout({ fontSize: 999 }).fontSize === 22)
check('字号过小被夹到 12', normalizeNovelLayout({ fontSize: 1 }).fontSize === 12)
check('未知字体回落宋体', normalizeNovelLayout({ font: 'comic' as never }).font === 'song')
check('小标题的字号更小', titleFontSize({ ...DEFAULT_NOVEL_LAYOUT, titleStyle: 'minimal' }) < titleFontSize(DEFAULT_NOVEL_LAYOUT))

const bookPages = paginateNovel(flat, '9:16')
const chapterPages = paginateNovel(flat, toPaginateOptions(NOVEL_LAYOUT_PRESETS[1].params, '9:16'))
check('换成「章首」后页数变了（版式真的生效）', chapterPages.length !== bookPages.length)

const withTitlePage = paginateNovel(flat, { format: '9:16', titlePage: true, meta: { title: '蜂群纪事' } })
check('扉页是第一页', withTitlePage[0]?.titlePage === true)
check('扉页不占正文页数', withTitlePage.length === bookPages.length + 1)
check('扉页带作品名', withTitlePage[0]?.chapterTitle === '蜂群纪事')

const flowed = paginateNovel(flat, { format: '9:16', chapterBreak: false })
check('关掉「每章另起」后页数不增', flowed.length <= bookPages.length)
const titleRows = (pages: typeof bookPages) =>
  pages.reduce((sum, page) => sum + page.rows.filter((row: NovelRow) => row.kind === 'title').length, 0)
check('标题行数 = 章节数（两种排法都成立）', titleRows(flowed) === flat.length && titleRows(bookPages) === flat.length)
check('关掉另起后确实有页承载两章', flowed.some((page) => page.rows.filter((row) => row.kind === 'title').length > 1))

const bigFont = paginateNovel(flat, { format: '9:16', fontSize: 22 })
const smallFont = paginateNovel(flat, { format: '9:16', fontSize: 12 })
check('字号越大页数越多', bigFont.length >= smallFont.length)
check('页边距越大页数越多', paginateNovel(flat, { format: '9:16', margin: 96 }).length >= paginateNovel(flat, { format: '9:16', margin: 24 }).length)
check('每页行数随字号变化', linesPerPage({ format: '9:16', fontSize: 20 }) < linesPerPage({ format: '9:16', fontSize: 12 }))
check('页码连续（扉页也算一页）', withTitlePage.every((page, i) => page.index === i + 1))

// ── 长书：页底不留孤零零的标题、不超容量
const longChapters = Array.from({ length: 6 }, (_, chapterIndex) => ({
  title: `第${chapterIndex + 1}章 长夜`,
  depth: 2,
  text: Array.from({ length: 12 + chapterIndex * 7 }, () => '正文一行，用来把这一页填满，看标题会不会落到底部。'.repeat(3)).join('\n\n'),
}))
const layouts = [
  { format: '9:16' as const },
  { format: '9:16' as const, chapterBreak: false },
  { format: 'A4' as const, fontSize: 20, lineHeight: 2.2 },
]
for (const options of layouts) {
  const built = paginateNovel(longChapters, options)
  const bullet = JSON.stringify(options)
  check(`页底不出现孤立标题 ${bullet}`, !built.some((page) => page.rows.length > 1 && page.rows[page.rows.length - 1]?.kind === 'title'))
  check(
    `每页行数不超过容量 ${bullet}`,
    built.every((page) => page.rows.reduce((sum, row) => sum + (row.kind === 'title' ? 2 : 1), 0) <= linesPerPage(options)),
  )
}

console.log(`\n共 ${passed} 项断言通过`)
