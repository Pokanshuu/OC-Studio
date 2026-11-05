/**
 * 关系导入自检：`npx tsx scripts/pr5-relations-check.ts`
 * 只验纯映射（分拣 / 去重 / 箭头 / 跳过计数）。
 */
import { planRelationImport, type LegacyRelationRow } from '../src/lib/legacy/pr5-relations'

let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed += 1; console.log(`  OK ${name}`) }
  else { console.error(`  FAIL ${name}`); process.exitCode = 1 }
}

const rows: LegacyRelationRow[] = [
  { id: 'a', sourceType: 'character', sourceId: 1, targetType: 'character', targetId: 2, kind: 'character', label: '同伴', color: '苔绿', arrow: 'both' },
  { id: 'b', sourceType: 'character', sourceId: 1, targetType: 'character', targetId: 2, kind: 'character', label: '同伴' },
  { id: 'c', sourceType: 'character', sourceId: 1, targetType: 'country', targetId: 9, kind: 'membership', label: '所属' },
  { id: 'd', sourceType: 'event', sourceId: 5, targetType: 'event', targetId: 6, kind: 'event-event' },
  { id: 'e', sourceType: 'character', sourceId: 7, targetType: 'character', targetId: 8, kind: 'character', deleted: true },
  { id: 'f', sourceType: 'character', sourceId: 3, targetType: 'character', targetId: 4, kind: 'character', label: '', arrow: 'none' },
]

const plan = planRelationImport(rows)
const character = plan.characterEdges.get(1) ?? []

check('角色边只保留去重后的 1 条', character.length === 1)
check('关系名取 label', character[0]?.relation === '同伴')
check('颜色带过来', character[0]?.color === '苔绿')
check('箭头带过来', character[0]?.arrow === 'both')
check('空 label 退化成「关系」', (plan.characterEdges.get(3) ?? [])[0]?.relation === '关系')
check('arrow=none 保留为显式无箭头', (plan.characterEdges.get(3) ?? [])[0]?.arrow === 'none')
check('事件边单独分组', (plan.eventEdges.get(5) ?? [])[0]?.relation === '关联')
check('国家参与 / 已删除计入 skipped', plan.skipped === 2)

console.log(`\n共 ${passed} 项断言通过`)
