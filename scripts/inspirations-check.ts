/**
 * 灵感自检：`npx tsx scripts/inspirations-check.ts`（`npm run audit:inspirations`）
 *
 * 灵感是作者随手写的字，所以这里盯的不是功能而是**不丢字**：
 * 归一化不能吞行、序列化往返必须逐字一样、纯文本提取不能把 CJK 或符号吃掉。
 */
import {
  EMPTY_INSPIRATION_CONTENT,
  inspirationLabel,
  inspirationText,
  normalizeInspirations,
  parseInspirations,
  serializeInspirations,
  type Inspiration,
} from '../src/features/inspirations/types'

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

function item(over: Partial<Inspiration> & Pick<Inspiration, 'id'>): Inspiration {
  return {
    title: '',
    content: EMPTY_INSPIRATION_CONTENT,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  }
}

function main(): void {
  // ── 归一化 ────────────────────────────────────────────────────────────
  const normalized = normalizeInspirations({
    version: 1,
    items: [
      item({ id: 'a', updatedAt: 3 }),
      item({ id: 'b', updatedAt: 9 }),
      item({ id: 'a', updatedAt: 1 }),
      null,
      'nonsense',
      { id: '' },
      { id: 'c', title: 42, content: null, createdAt: 5, updatedAt: 5 },
    ],
  })
  check('坏行只丢那一行', normalized.length === 3, String(normalized.length))
  check('按最近修改倒序', normalized.map((row) => row.id).join(',') === 'b,c,a', normalized.map((row) => row.id).join(','))
  check('重复 id 只留第一次出现', normalized.filter((row) => row.id === 'a').length === 1)
  check('id 为空的丢掉', normalized.every((row) => row.id.trim() !== ''))
  check('非字符串标题归一成空串', normalized.find((row) => row.id === 'c')?.title === '')
  check('非字符串正文回落空文档', normalized.find((row) => row.id === 'c')?.content === EMPTY_INSPIRATION_CONTENT)

  check('顶层是数组也认', normalizeInspirations([item({ id: 'x' })]).length === 1)
  check('完全不是对象时给空表', normalizeInspirations('nope').length === 0)
  check('null 给空表', normalizeInspirations(null).length === 0)

  // ── 往返不丢字 ────────────────────────────────────────────────────────
  const tricky = item({
    id: 'round-trip',
    title: '一个 "带引号" 的标题',
    content: '<p>第一段</p><p>换行 &amp; 符号 [[链接]]</p>',
  })
  const text = serializeInspirations([tricky])
  const back = parseInspirations(text)
  check('往返条数一致', back.length === 1)
  check('往返标题逐字一致', back[0]?.title === tricky.title, back[0]?.title)
  check('往返正文逐字一致', back[0]?.content === tricky.content)
  check('序列化带版本号', text.includes('"version": 1'))
  check('空文件给空表', parseInspirations('').length === 0)
  check('坏 JSON 不抛异常', parseInspirations('{oops').length === 0)

  // ── 纯文本提取 ────────────────────────────────────────────────────────
  const doc = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '星轨往下掉' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '第二次' }] },
    ],
  })
  check('吃 Tiptap JSON', inspirationText(doc) === '星轨往下掉 第二次', inspirationText(doc))
  check('吃 HTML', inspirationText('<p>甲</p><p>乙</p>') === '甲 乙')
  check('实体解码', inspirationText('<p>a &amp; b</p>') === 'a & b')
  check('空内容给空串', inspirationText('') === '')
  check('空文档给空串', inspirationText(EMPTY_INSPIRATION_CONTENT) === '')
  check('坏 JSON 当文本处理', inspirationText('{不是json').includes('{不是json'))

  // ── 列表上的名字 ──────────────────────────────────────────────────────
  check('有标题用标题', inspirationLabel(item({ id: 'x', title: '三月的风' })) === '三月的风')
  const longText = '很长的灵感'.repeat(20)
  check(
    '没标题时退回正文前 30 字',
    inspirationLabel(item({ id: 'y', content: `<p>${longText}</p>` })) === longText.slice(0, 30),
  )
  check('全空给未命名', inspirationLabel(item({ id: 'z' })) === '未命名灵感')

  console.log(`灵感自检：${passed} 项断言通过`)
}

main()
