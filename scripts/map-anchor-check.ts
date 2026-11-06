/**
 * 地图锚点自检：`npx tsx scripts/map-anchor-check.ts`
 * 只验纯函数（归一化 / 分组 / 排序），不碰 IndexedDB。
 */
import { normalizeAnchor, groupAnchors, MAIN_MAP_ID, type AnchorPoint } from '../src/features/map/services'
import { parseAnnotations, stringifyAnnotations } from '../src/features/map/annotations'

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

// 政治标注：国界填充色（docs/地图.md §10）
const border = {
  id: 'b1',
  kind: 'border' as const,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.25, y: 0.4 }],
  fill: '苔绿',
}
const roundtrip = parseAnnotations(stringifyAnnotations([border]))
check('国界填充色能往返', roundtrip[0]?.fill === '苔绿')
check('道路不写填充色', !stringifyAnnotations([{ ...border, kind: 'road', points: border.points.slice(0, 2) }])?.includes('fill'))
const invalid = parseAnnotations(JSON.stringify([{ ...border, fill: '#FF0000' }]))
check('非法填充色被丢掉', invalid[0]?.fill === undefined)
check('无填充时 stringify 不写 fill', !stringifyAnnotations([{ ...border, fill: undefined }])?.includes('fill'))

// 线条色：国界与道路共用一档，和填充色互不影响（docs/地图.md §10）
const road = {
  id: 'r1',
  kind: 'road' as const,
  points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.4 }],
  color: '赤陶',
}
check('道路线条色能往返', parseAnnotations(stringifyAnnotations([road]))[0]?.color === '赤陶')
check('道路不写填充色（仍成立）', !stringifyAnnotations([road])?.includes('fill'))
check(
  '国界的线条与填充各自独立',
  (() => {
    const parsed = parseAnnotations(stringifyAnnotations([{ ...border, color: '靛蓝' }]))[0]
    return parsed?.color === '靛蓝' && parsed?.fill === '苔绿'
  })(),
)
const badColor = parseAnnotations(JSON.stringify([{ ...road, color: '#FF0000' }]))
check('非法线条色被丢掉', badColor[0]?.color === undefined)
check(
  '没选颜色时 stringify 不写 color',
  !(stringifyAnnotations([{ ...road, color: undefined }]) ?? '').includes('color'),
)

console.log(`\n共 ${passed} 项断言通过`)
