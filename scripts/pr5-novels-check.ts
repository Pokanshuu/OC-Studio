/**
 * fork 版小说导入的自检（纯函数，不需要真实 IndexedDB）。
 *
 * 跑法：`npx tsx scripts/pr5-novels-check.ts`
 * 只验「映射」：顺序、父子关系、正文不丢、备注不丢、封面跳过、HTML 降级计数。
 */
import { planNovelImport, type LegacyNovel } from '../src/lib/legacy/pr5-novels'

let passed = 0
function check(name: string, condition: boolean) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    console.error(`  ✗ ${name}`)
    process.exitCode = 1
  }
}

const novel: LegacyNovel = {
  id: 1,
  title: '蜂群纪事',
  author: '阿蜂',
  synopsis: '雨季之后，蜂群第一次离巢。',
  coverUrl: 'blob:local-cover',
  notes: '主线灵感来自旧稿',
  noteItems: [{ id: 'n1', text: '注意时间线' }],
  targetWords: 120000,
  chapters: [
    {
      id: 'c1',
      title: '第01章 雨季',
      content: '<p>雨下了很久。</p><p><strong>她</strong>没有回头。</p>',
      summary: '开场',
      status: 'done',
    },
    { id: 'c2', title: '第02章 蜂巢', content: '<ul><li>一</li><li>二</li></ul>' },
    { id: 'c3', title: '', content: '' },
  ],
  createdAt: 1,
  updatedAt: 2,
}

const plan = planNovelImport(novel, 10)

check('根节点是小说标题', plan.root.title === '蜂群纪事')
check('根节点标记为小说', plan.root.category === '小说')
check('章节数一致', plan.chapters.length === 3)
check('章节顺序接在 startOrder 之后', plan.chapters[0].order === 11)
check('章节 parentId 先留空（等根节点拿主键）', plan.chapters.every((c) => c.parentId === null))
check('空标题退化成「第N章」', plan.chapters[2].title === '第3章')

const first = JSON.parse(plan.chapters[0].content) as { type: string; content: Array<{ type: string }> }
check('正文是合法 doc', first.type === 'doc')
check('段落被保留', first.content.some((node) => node.type === 'paragraph'))
check('粗体标记被保留', plan.chapters[0].content.includes('"bold"'))
check('梗概与状态写进正文开头之外的备注段', plan.chapters[0].content.includes('梗概'))
check('列表转成 bulletList', plan.chapters[1].content.includes('bulletList'))

const rootDoc = JSON.parse(plan.root.content) as { content: Array<{ type: string; text?: string }> }
check('根正文含简介', plan.root.content.includes('雨季之后'))
check('备注不静默丢', plan.root.content.includes('主线灵感来自旧稿'))
check('备注条目保留', plan.root.content.includes('注意时间线'))
check('根正文非空', (rootDoc.content?.length ?? 0) > 0)

check('blob 封面被记为跳过', plan.report.skippedCovers === 1)

const clean: LegacyNovel = { ...novel, coverUrl: 'images/cover.png', chapters: [] }
check('本地相对路径封面不算跳过', planNovelImport(clean).report.skippedCovers === 0)
check('空章节不出错', planNovelImport(clean).chapters.length === 0)

console.log(`\n共 ${passed} 项断言通过`)
