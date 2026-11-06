/**
 * 关系图导出**版式**自检：`npx tsx scripts/graph-export-check.ts`
 *
 * 两件事：
 * 1. 参数层（`features/relations/export-options.ts`）——预设有没漏进界面的档位、
 *    越界值有没有被夹住、微调之后还会不会假装还是预设。真正画图要 canvas，那是浏览器里的事。
 * 2. 坐标层（`features/relations/layout.ts#resolveGraphPositions`）——`buildGraphData()`
 *    给没摆过的节点一律 `(0, 0)`，画布与导出共用这一个函数补力导向。
 *    2026-11-06 导出预览「卡片全叠在原点、名字连成一串」就是导出侧漏了这一步。
 */
import {
  DEFAULT_GRAPH_STYLE,
  GRAPH_PADDING_OPTIONS,
  GRAPH_SCALE_OPTIONS,
  GRAPH_STYLE_PRESETS,
  GRAPH_WIDTH_OPTIONS,
  graphPresetIdOf,
  normalizeGraphStyle,
} from '../src/features/relations/export-options'
import { NODE_SIZE, resolveGraphPositions } from '../src/features/relations/layout'
import type { GraphNode, RelationNodeType } from '../src/features/relations/types'

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

/** 造一个最小节点：`buildGraphData()` 的形状（没摆过 = 位置 (0, 0)） */
function makeNode(id: string, entityType: RelationNodeType, x: number, y: number): GraphNode {
  return {
    id,
    type: `${entityType}Node`,
    position: { x, y },
    data: { id, label: id, entityType, entityId: 1 },
  }
}

const widthValues = GRAPH_WIDTH_OPTIONS.map((option) => option.value)
const paddingValues = GRAPH_PADDING_OPTIONS.map((option) => option.value)
const scaleValues = GRAPH_SCALE_OPTIONS.map((option) => option.value)

check('三套预设', GRAPH_STYLE_PRESETS.length === 3)
check('预设名唯一', new Set(GRAPH_STYLE_PRESETS.map((preset) => preset.id)).size === GRAPH_STYLE_PRESETS.length)
check(
  '三套预设参数互不相同',
  new Set(GRAPH_STYLE_PRESETS.map((preset) => JSON.stringify(preset.style))).size === GRAPH_STYLE_PRESETS.length,
)
check('默认参数对应「留白」', graphPresetIdOf(DEFAULT_GRAPH_STYLE) === 'poster')
check('改一个参数就不再命中预设', graphPresetIdOf({ ...DEFAULT_GRAPH_STYLE, edgeWidth: 2.2 }) === null)
check(
  '每套预设的线宽都是界面给的档位',
  GRAPH_STYLE_PRESETS.every((preset) => widthValues.includes(preset.style.edgeWidth)),
)
check(
  '每套预设的留白都是界面给的档位',
  GRAPH_STYLE_PRESETS.every((preset) => paddingValues.includes(preset.style.padding)),
)
check(
  '每套预设的倍率都是界面给的档位',
  GRAPH_STYLE_PRESETS.every((preset) => scaleValues.includes(preset.style.scale)),
)

const ink = GRAPH_STYLE_PRESETS.find((preset) => preset.id === 'ink')
check('墨线 = 名字节点 + 单色 + 不写日期', ink !== undefined && ink.style.nodeShape === 'name' && ink.style.monochrome && !ink.style.showDate)
const atlas = GRAPH_STYLE_PRESETS.find((preset) => preset.id === 'atlas')
check('图谱 = 不画关系名 + 网格纸', atlas !== undefined && !atlas.style.edgeLabels && atlas.style.paper === 'grid')

check('未知纸面回落点阵', normalizeGraphStyle({ paper: 'dots' as never }).paper === 'dot')
check('节点形态只认 name', normalizeGraphStyle({ nodeShape: 'round' as never }).nodeShape === 'avatar')
check('线宽下限 0.8', normalizeGraphStyle({ edgeWidth: 0 }).edgeWidth === 0.8)
check('线宽上限 3', normalizeGraphStyle({ edgeWidth: 99 }).edgeWidth === 3)
check('留白下限 24', normalizeGraphStyle({ padding: 0 }).padding === 24)
check('留白上限 240', normalizeGraphStyle({ padding: 9999 }).padding === 240)
check('倍率下限 1', normalizeGraphStyle({ scale: 0.5 }).scale === 1)
check('倍率上限 3', normalizeGraphStyle({ scale: 9 }).scale === 3)
check('NaN 不会漏出去', normalizeGraphStyle({ padding: Number.NaN, edgeWidth: Number.NaN }).padding === DEFAULT_GRAPH_STYLE.padding)
check('空输入 = 默认', JSON.stringify(normalizeGraphStyle()) === JSON.stringify(DEFAULT_GRAPH_STYLE))

/* ── 坐标层：没摆过的节点必须先补布局，否则导出全是原点叠图 ── */

const mixed = resolveGraphPositions(
  [
    makeNode('character-1', 'character', 0, 0),
    makeNode('event-1', 'event', 0, 0),
    makeNode('country-1', 'country', 900, 420),
  ],
  [],
)
const byId = new Map(mixed.map((node) => [node.id, node]))
const pinnedNode = byId.get('country-1')
const freeNodes = mixed.filter((node) => node.id !== 'country-1')

check('节点一个不少', mixed.length === 3)
check('存过坐标的节点被钉住（导出不挪用户摆好的图）', pinnedNode?.position.x === 900 && pinnedNode?.position.y === 420)
check('没坐标的节点不再留在原点', freeNodes.every((node) => node.position.x !== 0 || node.position.y !== 0))
check(
  '两个没坐标的节点被摊开（不互相压住）',
  freeNodes.length === 2 &&
    Math.hypot(
      freeNodes[0].position.x - freeNodes[1].position.x,
      freeNodes[0].position.y - freeNodes[1].position.y,
    ) >= NODE_SIZE.event.w,
)
check(
  '没坐标的节点落在已摆好的那一坨附近',
  freeNodes.every((node) => Math.hypot(node.position.x - 900, node.position.y - 420) < 800),
)
check(
  '节点 data 原样带出（导出还要用它取图 / 名字）',
  mixed.every((node) => node.data.label === node.id && node.data.entityId === 1),
)

const allPinned = [
  makeNode('character-1', 'character', 120, 80),
  makeNode('event-1', 'event', 460, 300),
]
const untouched = resolveGraphPositions(allPinned, [])
check('全套都有坐标时原样返回（不重排整张图）', untouched === allPinned)

const freeOnly = resolveGraphPositions(
  [
    makeNode('character-1', 'character', 0, 0),
    makeNode('character-2', 'character', 0, 0),
    makeNode('event-1', 'event', 0, 0),
    makeNode('event-2', 'event', 0, 0),
  ],
  [],
)
check(
  '一个坐标都没有时也不会全叠在原点',
  new Set(freeOnly.map((node) => `${node.position.x},${node.position.y}`)).size === freeOnly.length,
)

const twice = resolveGraphPositions(mixed, [])
check(
  '同一份输入两次算出同一张图（可复现）',
  JSON.stringify(twice.map((node) => node.position)) === JSON.stringify(mixed.map((node) => node.position)),
)

/** 节点矩形（与导出重绘同口径：`NODE_SIZE`） */
function rectOf(node: GraphNode): { x: number; y: number; w: number; h: number } {
  const size = NODE_SIZE[node.data.entityType]
  return { x: node.position.x, y: node.position.y, w: size.w, h: size.h }
}

/** 两张节点矩形的重叠面积（0 = 完全分开） */
function overlapArea(a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ox > 0 && oy > 0 ? ox * oy : 0
}

// 真实场景：一两条摆过的锚点 + 一堆新建（没坐标）的节点
const crowd = resolveGraphPositions(
  [
    makeNode('character-1', 'character', 0, 0),
    makeNode('character-2', 'character', 0, 0),
    makeNode('character-3', 'character', 0, 0),
    makeNode('event-1', 'event', 0, 0),
    makeNode('event-2', 'event', 0, 0),
    makeNode('event-3', 'event', 0, 0),
    makeNode('country-1', 'country', 0, 0),
    makeNode('country-2', 'country', 0, 0),
    makeNode('character-4', 'character', 900, 420),
    makeNode('country-3', 'country', 1200, 700),
  ],
  [],
)
const crowdRects = crowd.map(rectOf)
/** 叠在一起的程度：碰撞力收敛后允许边角相碰，但绝不能一个压在另一个身上 */
const worstOverlap = crowdRects.reduce((worst, a, i) => {
  for (let j = i + 1; j < crowdRects.length; j += 1) {
    const b = crowdRects[j]
    worst = Math.max(worst, overlapArea(a, b) / Math.min(a.w * a.h, b.w * b.h))
  }
  return worst
}, 0)
check(`摊开之后没有节点压在另一个身上（最坏重叠 ${(worstOverlap * 100).toFixed(1)}%）`, worstOverlap < 0.05)

console.log(`\n共 ${passed} 项断言通过`)
