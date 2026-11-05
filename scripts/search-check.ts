/**
 * 全局搜索匹配层自检：`npx tsx scripts/search-check.ts`（`npm run audit:search`）
 *
 * 只验纯函数（分词 / 打分 / 摘要 / 高亮），不碰 Dexie。
 * 索引与界面在 `src/lib/search/index.ts` / `SearchHitRow`，这里保证「哪些该命中、
 * 命中该给出什么上下文」的规则不被顺手改掉。
 */
import { buildSnippet, matchRow, searchTerms, splitHighlight, type SearchableRow } from '../src/lib/search/matcher'
import { entityBodyText } from '../src/lib/entity-text'
import type { Event, WorldEntry } from '../src/types'

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

function row(input: Partial<SearchableRow> & Pick<SearchableRow, 'titleLower'>): SearchableRow {
  return { aliasesLower: [], fieldLower: '', bodyLower: '', ...input }
}

function main(): void {
  // ── 分词 ──────────────────────────────────────────────────────────────
  check('按空白拆词并去重', searchTerms('  赤 月 赤 ').join('|') === '赤|月')
  check('空查询没有任何词', searchTerms('   ').length === 0)
  check('拉丁字母统一小写', searchTerms('AB ab')[0] === 'ab' && searchTerms('AB ab').length === 1)

  // ── 标题：精确 > 前缀 > 包含 > 分散命中 ───────────────────────────────
  const exact = matchRow(row({ titleLower: '赤月' }), ['赤月'])
  check('标题完全相同 200 分', exact?.matched === 'title' && exact.score === 200)

  const prefix = matchRow(row({ titleLower: '赤月帝国' }), ['赤月'])
  check('标题前缀 170 分', prefix?.matched === 'title' && prefix.score === 170)

  const contains = matchRow(row({ titleLower: '新赤月帝国' }), ['赤月'])
  check('标题包含 150 分', contains?.matched === 'title' && contains.score === 150)

  const spread = matchRow(row({ titleLower: '赤色月亮' }), ['赤', '月'])
  check('标题里分散命中（不连续）仍然算标题命中', spread?.matched === 'title' && spread.score === 124, String(spread?.score))

  // ── 别名 / 字段 / 正文：优先级逐级下降 ────────────────────────────────
  const alias = matchRow(row({ titleLower: '帝国', aliasesLower: ['赤月'] }), ['赤月'])
  check('别名命中 112 分', alias?.matched === 'alias' && alias.score === 112)

  const field = matchRow(row({ titleLower: '某人', fieldLower: '星语者' }), ['星语者'])
  check('字段命中 62 分', field?.matched === 'field' && field.score === 62)

  const body = matchRow(row({ titleLower: '某人', bodyLower: '他在赤月下站了很久' }), ['赤月'])
  check('正文命中 42 分', body?.matched === 'body' && body.score === 42)

  check('标题命中压过正文命中', (exact?.score ?? 0) > (body?.score ?? 0))

  // ── AND 语义与空态 ────────────────────────────────────────────────────
  check(
    '多个词必须在整行的某处都能找到',
    matchRow(row({ titleLower: '某人', bodyLower: '赤月已经升起' }), ['赤月', '帝国']) === null,
  )
  check(
    '多个词分散在标题与正文也能合起来命中',
    matchRow(row({ titleLower: '赤月', bodyLower: '帝国旧事' }), ['赤月', '帝国'])?.matched === 'title',
  )
  check('完全找不到返回 null', matchRow(row({ titleLower: '某人' }), ['赤月']) === null)
  check('空词表返回 null', matchRow(row({ titleLower: '某人' }), []) === null)

  // ── 摘要 ──────────────────────────────────────────────────────────────
  const snippet = buildSnippet('前面的内容'.repeat(10) + '赤月帝国' + '后面的内容'.repeat(10), ['赤月'], 4)
  check('摘要包含命中词', snippet !== null && snippet.includes('赤月'))
  check('摘要两侧有省略号', snippet !== null && snippet.startsWith('…') && snippet.endsWith('…'))
  check('摘要压掉换行与连续空白', buildSnippet('上\n\n下   赤月', ['赤月']) === '上 下 赤月')
  check('没有命中词就没有摘要', buildSnippet('没有那个词', ['赤月']) === null)

  // ── 高亮 ──────────────────────────────────────────────────────────────
  const parts = splitHighlight('赤月帝国，赤月', ['赤月'])
  check('高亮切出命中与未命中片段', parts.length === 3 && parts[0].hit && !parts[1].hit && parts[2].hit)
  check('高亮大小写不敏感', splitHighlight('Abc ABC abc', ['abc']).filter((part) => part.hit).length === 3)
  const merged = splitHighlight('abcd', ['abc', 'bcd'])
  check('重叠词合并成一段高亮', merged.length === 1 && merged[0].text === 'abcd' && merged[0].hit)
  check('没有命中时原样返回一段', splitHighlight('没有那个词', ['赤月']).length === 1)

  // ── 正文口径：老库 HTML / JSON 都要能搜 ───────────────────────────────
  const legacyEvent = {
    id: 1,
    title: '旧事件',
    aliases: [],
    time: '',
    location: '',
    summary: '摘要',
    content: '<p>正文 <strong>加粗</strong></p>',
    characters: [],
    relations: [],
    images: [],
    tags: [],
    isMajor: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: 'synced',
    _lastModified: 0,
    parentEventId: null,
  } as unknown as Event
  const eventText = entityBodyText('event', legacyEvent)
  check('事件老正文里的 HTML 被剥掉', !eventText.includes('<p>') && eventText.includes('加粗'))

  const legacyWorld = {
    id: 2,
    title: '旧词条',
    content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '星图' }] }] }),
    aliases: [],
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
  } as unknown as WorldEntry
  check('词条老 content 是 JSON 时也能取出正文', entityBodyText('world', legacyWorld) === '星图')

  console.log(`全局搜索匹配自检：${passed} 项断言通过`)
}

main()
