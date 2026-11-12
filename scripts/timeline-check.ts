/**
 * 时间线国家节点自检（`npm run audit:timeline`）。
 *
 * 只测纯函数 `buildCountryTimelineNodes`：国家时间字段 → 时间线节点。
 * 不碰 Dexie / React；年份解析、空值、负年份、id 命名空间都在这里钉住。
 */
import type { Country } from '../src/types'
import type { FieldDef } from '../src/lib/fields/types'
import {
  COUNTRY_NODE_BASE,
  buildCountryTimelineNodes,
} from '../src/features/timeline/services'

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name)
}

function country(over: Partial<Country> & Pick<Country, 'id' | 'name'>): Country {
  return {
    parentId: null,
    description: '',
    system: '',
    geography: '',
    culture: '',
    tags: [],
    custom: {},
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
    _syncStatus: '',
    _lastModified: 0,
    ...over,
  }
}

const timeFields: FieldDef[] = [
  { id: 'f_country_founded', label: '建立时间', type: 'time', key: '建立时间' },
  { id: 'f_country_dissolved', label: '结束时间', type: 'time', key: '结束时间' },
]

const nodes = buildCountryTimelineNodes([
  country({
    id: 3,
    name: '瓦兰',
    custom: { 建立时间: '120-03', 结束时间: '-45' },
  }),
  country({ id: 4, name: '灰烬', custom: { 建立时间: '不详', 结束时间: '' } }),
], timeFields)

check('两个时间字段各出一个节点', nodes.length === 2)
check('节点来源标成 country', nodes.every((node) => node.kind === 'country'))
check('节点带上国家 id', nodes.every((node) => node.countryId === 3))
check('标题带上国家名与字段名', nodes[0]?.title === '瓦兰 · 建立时间' && nodes[1]?.title === '瓦兰 · 结束时间')
check('时间原样保留（含负年份 / 年月）', nodes[0]?.time === '120-03' && nodes[1]?.time === '-45')
check('摘要写字段名', nodes.every((node) => node.summary === node.countryField))
check('年份读不出来时不上时间线', nodes.every((node) => node.countryId !== 4))
check('id 都落在负数命名空间', nodes.every((node) => node.id <= COUNTRY_NODE_BASE))
check('同一国家的两个节点 id 不重复', new Set(nodes.map((node) => node.id)).size === nodes.length)

const noTimeFields = buildCountryTimelineNodes(
  [country({ id: 3, name: '瓦兰', custom: { 建立时间: '120' } })],
  [{ id: 'f_text', label: '建立时间', type: 'text', key: '建立时间' }],
)
check('没有 time 字段时不出节点', noTimeFields.length === 0)

const noCustom = buildCountryTimelineNodes([country({ id: 5, name: '无字段' })], timeFields)
check('custom 为空时不崩、不出节点', noCustom.length === 0)

const twoCountries = buildCountryTimelineNodes([
  country({ id: 3, name: '甲', custom: { 建立时间: '1' } }),
  country({ id: 4, name: '乙', custom: { 建立时间: '2' } }),
], timeFields)
check('不同国家的节点 id 不撞', new Set(twoCountries.map((node) => node.id)).size === 2)
check('每个国家只出自己有的字段', twoCountries.length === 2 && twoCountries[1]?.title === '乙 · 建立时间')

if (failures.length > 0) {
  console.error(`时间线国家节点自检失败 ${failures.length}/${passed + failures.length}：`)
  for (const name of failures) console.error(`  ✗ ${name}`)
  process.exit(1)
}

console.log(`时间线国家节点自检通过：${passed} 项断言`)
