/**
 * 地图锚点自检：`npx tsx scripts/map-anchor-check.ts`
 * 只验纯函数（归一化 / 分组 / 排序），不碰 IndexedDB。
 */
import { normalizeAnchor, groupAnchors, MAIN_MAP_ID, type AnchorPoint } from '../src/features/map/services'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed += 1; console.log(`  OK ${name}`) }
  else { console.error(`  FAIL ${name}`); process.exitCode = 1 }
}

check('正常值原样保留', JSON.stringify(normalizeAnchor({ x: 0.25, y: 0.75 })) === '{"x":0.25,"y":0.75}')
check('越界夹到 0–1', JSON.stringify(normalizeAnchor({ x: -3, y: 9 })) === '{"x":0,"y":1}')
check('NaN 丢掉', normalizeAnchor({ x: Number.NaN, y: 0.5 }) === null)
check('非数字丢掉', normalizeAnchor({ x: '0.5', y: 0.5 }) === null)
check('null 返回 null', normalizeAnchor(null) === null)
check('空对象返回 null', normalizeAnchor({} as { x: unknown; y: unknown }) === null)

const points: AnchorPoint[] = [
  { kind: 'country', id: 1, title: '瓦兰', anchor: { x: 0.5, y: 0.8 }, mapId: '' },
  { kind: 'event', id: 2, title: '初遇', anchor: { x: 0.2, y: 0.1 }, mapId: '' },
  { kind: 'worldEntry', id: 3, title: '北境', anchor: { x: 0.1, y: 0.4 }, mapId: 'north' },
]
const groups = groupAnchors(points)
check('空 mapId 归到主地图', (groups.get(MAIN_MAP_ID) ?? []).length === 2)
check('不同地图分开', (groups.get('north') ?? []).length === 1)
check('组内按 y 再按 x 排', (groups.get(MAIN_MAP_ID) ?? []).map((p) => p.id).join(',') === '2,1')

console.log(`\n共 ${passed} 项断言通过`)
