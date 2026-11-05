/**
 * 边样式自检：`npx tsx scripts/edge-style-check.ts`
 * 只验纯函数（合并补丁 / 清空 / 非法值 / 找不到边）。
 */
import { applyEdgeStyle, patchCharacterEdge, patchEventEdge, patchWorldEdge } from '../src/features/relations/edge-style'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed += 1; console.log(`  OK ${name}`) }
  else { console.error(`  FAIL ${name}`); process.exitCode = 1 }
}

const base: { color?: string; arrow?: 'none' | 'forward' | 'reverse' | 'both' } = {
  color: '苔绿',
  arrow: 'both',
}
const setColor = applyEdgeStyle(base, { color: '玫瑰' })
check('改颜色生效', setColor.edge.color === '玫瑰' && setColor.changed)

const clearArrow = applyEdgeStyle({ ...base }, { arrow: 'none' })
check('arrow=none 保留为显式无箭头', clearArrow.edge.arrow === 'none' && clearArrow.changed)

const resetArrow = applyEdgeStyle({ ...base }, { arrow: null })
check('arrow=null 真正清掉（回到默认）', resetArrow.edge.arrow === undefined)

const clearColor = applyEdgeStyle({ ...base }, { color: null })
check('color=null 被清掉', clearColor.edge.color === undefined)

const badColor = applyEdgeStyle({ ...base }, { color: '不存在的颜色' })
check('非法颜色不写入', badColor.edge.color === undefined)

const same = applyEdgeStyle({ ...base }, { color: '苔绿' })
check('值没变时 changed=false', same.changed === false)

const character = {
  id: 1, name: 'A', relatedCharacters: [{ characterId: 2, name: 'B', relation: '同伴' }],
} as unknown as Parameters<typeof patchCharacterEdge>[0]
const patched = patchCharacterEdge(character, 2, { color: '赤陶', arrow: 'forward' })
check('角色边被找到并改掉', patched?.changed === true && patched.relatedCharacters[0].color === '赤陶')
check('找不到目标时返回 null', patchCharacterEdge(character, 99, { color: '赤陶' }) === null)

const event = { id: 5, relations: [{ targetId: 6, relation: '关联' }] } as unknown as Parameters<typeof patchEventEdge>[0]
const eventPatched = patchEventEdge(event, 6, { arrow: 'both' })
check('事件边改箭头', eventPatched?.relations[0].arrow === 'both')

const world = {
  id: 7,
  relations: [{ targetId: 8, name: 'B', relation: '共生' }],
} as unknown as Parameters<typeof patchWorldEdge>[0]
const worldPatched = patchWorldEdge(world, 8, { color: '苔绿', arrow: 'forward', relation: '寄生' })
check(
  '笔记边改颜色 / 箭头 / 关系名',
  worldPatched?.relations[0].color === '苔绿' &&
    worldPatched.relations[0].arrow === 'forward' &&
    worldPatched.relations[0].relation === '寄生',
)
check('笔记边找不到目标时返回 null', patchWorldEdge(world, 99, { color: '赤陶' }) === null)

console.log(`\n共 ${passed} 项断言通过`)
