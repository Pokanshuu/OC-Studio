/**
 * 拖拽落点判定的自检：`npx tsx scripts/list-collision-check.ts`
 *
 * 盯的是三件事：
 * - 指针在谁的格子里，谁就是落点（不再被「卡片中心偏右下」带跑偏）
 * - 指针在空隙里时退回比中心距离
 * - 迟滞：停在两张卡之间不来回跳，但真的挪过去就换
 */
import {
  centerOfRect,
  pointInsideRect,
  rankCollisions,
  COLLISION_HYSTERESIS,
  type CollisionCandidate,
} from '../src/components/shared/list-dnd-collision'

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean): void {
  if (condition) {
    passed += 1
    return
  }
  failures.push(name)
}

/** 200×170 的卡，横排三张，间隙 16 */
const CARD_W = 200
const CARD_H = 170
const GAP = 16
function card(id: number, index: number): CollisionCandidate {
  return { id, rect: { left: index * (CARD_W + GAP), top: 0, width: CARD_W, height: CARD_H } }
}
const cards = [card(1, 0), card(2, 1), card(3, 2)]

const ids = (list: { id: number | string }[]): string => list.map((entry) => String(entry.id)).join(',')

// 1. 指针在 1 号卡内部（含左上角、右下角边缘）
check('指针落在 1 号卡中心 → 1 号', ids(rankCollisions(cards, { x: 100, y: 85 })) === '1,2,3')
check('指针落在 2 号卡左上角 → 2 号', rankCollisions(cards, { x: 216, y: 1 })[0].id === 2)
check('指针落在 2 号卡右下角 → 2 号', rankCollisions(cards, { x: 415, y: 169 })[0].id === 2)
check('指针落在 3 号卡内 → 3 号', rankCollisions(cards, { x: 700, y: 80 })[0].id === 3)
check('值 = 0 表示指针就在里面', rankCollisions(cards, { x: 100, y: 85 })[0].value === 0)

// 2. 指针落在网格外（卡片左侧以外）：比中心距离，1 号最近
check('指针在网格左外的空白 → 仍是 1 号', rankCollisions(cards, { x: -40, y: 85 })[0].id === 1)

// 3. 空隙（1 号与 2 号之间 16px）：谁近算谁
const gapMiddle = CARD_W + GAP / 2
const gapLeft = CARD_W + 2
const gapRight = CARD_W + GAP - 2
check('空隙偏左 → 1 号', rankCollisions(cards, { x: gapLeft, y: 85 })[0].id === 1)
check('空隙偏右 → 2 号', rankCollisions(cards, { x: gapRight, y: 85 })[0].id === 2)

// 4. 迟滞：差得不多就守住上一次的落点
const nearGap = gapMiddle + 4 // 2 号只比 1 号近 8px（< 12）
check(
  '空眼里 2 号只近一点点 → 留在 1 号',
  rankCollisions(cards, { x: nearGap, y: 85 }, 1)[0].id === 1,
)
check(
  '同一位置，没有既有的落点 → 2 号（按距离）',
  rankCollisions(cards, { x: nearGap, y: 85 }, null)[0].id === 2,
)
const clearlyCloser = gapMiddle + COLLISION_HYSTERESIS + 6
check(
  '2 号明显更近（> 迟滞）→ 换成 2 号',
  rankCollisions(cards, { x: clearlyCloser, y: 85 }, 1)[0].id === 2,
)
check(
  '指针已经在 3 号卡里 → 立刻换（迟滞不拦「进格子」）',
  rankCollisions(cards, { x: 700, y: 80 }, 1)[0].id === 3,
)
check('上一次的落点不在候选里 → 顺序不动', ids(rankCollisions(cards, { x: 700, y: 80 }, 99)) === '3,2,1')

// 5. 指针在卡片纵向以外（网格下方）→ 仍返回最近的，不会空
check('指针在网格下方 → 仍有落点', rankCollisions(cards, { x: 100, y: 900 }).length === 3)

// 6. 几何辅助
check('pointInsideRect 认边界', pointInsideRect(cards[1].rect, 216, 0) && pointInsideRect(cards[1].rect, 415, 170))
check('pointInsideRect 不认外面一像素', !pointInsideRect(cards[1].rect, 215, 0))
check('centerOfRect', centerOfRect(cards[1].rect).x === 316 && centerOfRect(cards[1].rect).y === 85)

if (failures.length > 0) {
  console.error(`✗ 落点判定自检失败 ${failures.length} 项：`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`✓ 落点判定自检通过 ${passed} 项`)
