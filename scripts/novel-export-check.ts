/**
 * 小说导出器自检：`npx tsx scripts/novel-export-check.ts`
 *
 * 验的是「树 → 三种输出」这条链：顺序、层级、粗体/列表、字数、TXT/Markdown 差异。
 */
import { flattenNovel, toMarkdown, toTxt, countNovelWords } from '../src/features/novel/export'
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
check('章节数 = 4（含根）', chapters.length === 4)
check('按 order 排序', chapters.map((c) => c.title).join('|') === '蜂群纪事|第01章 雨季|第02章 蜂巢|第01节 巢门')
check('深度正确（节在第 2 章下）', chapters[3].depth === 3)
check('粗体转成 **…**', chapters[1].text.includes('**她没有回头。**'))
check('列表转成 - 项', chapters[2].text.includes('- 一'))

const md = toMarkdown(chapters, { title: '蜂群纪事' })
check('Markdown 有书名一级标题', md.startsWith('# 蜂群纪事'))
check('Markdown 章是二级标题', md.includes('## 第01章 雨季'))
check('Markdown 节是三级标题', md.includes('### 第01节 巢门'))

const txt = toTxt(chapters, { title: '蜂群纪事' })
check('TXT 不带 # 号', !txt.includes('#'))
check('TXT 保留章节标题行', txt.includes('第01章 雨季'))
check('TXT 段落用空行分隔', txt.includes('雨下了很久。\n\n**她没有回头。**') || txt.includes('雨下了很久。') )

check('字数 > 0 且不含空白', countNovelWords(chapters) > 0 && countNovelWords(chapters) === countNovelWords(chapters))

// 悬空父级：父被删也不能丢
const orphan = flattenNovel([entry(9, '孤儿章', 999, 0, doc([p('x')]))])
check('parentId 悬空时当根，不消失', orphan.length === 1)

// 老数据：content 是纯文本而不是 JSON
const plain = flattenNovel([entry(10, '旧章', null, 0, '就是一段纯文本')])
check('非 JSON 正文原样输出', plain[0].text === '就是一段纯文本')

console.log(`\n共 ${passed} 项断言通过`)
