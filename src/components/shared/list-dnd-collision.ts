/**
 * 拖拽落点的排序 —— **纯函数**，`list-dnd.tsx` 只负责把 dnd-kit 的数据喂进来。
 *
 * 为什么不用 dnd-kit 的 `closestCenter`：它量的是「被拖卡片的中心」，而卡片是从
 * 左上角的手柄提起来的，中心永远偏向右下 —— 于是「指着的」和「落到的」差着大半格，
 * 卡片越小越明显，停住等成夹时也会亮错另一张。
 *
 * 规则（自检：`npx tsx scripts/list-collision-check.ts`）：
 * 1. 指针落在谁的矩形里，谁就是第一（`value = 0`）
 * 2. 都没落进去（网格空隙）就比「指针到中心」的距离
 * 3. 迟滞：当前这一项只要没比别人差超过 `hysteresis`，就继续留在第一 ——
 *    停在两张卡中间时不会 1px 一声地来回跳
 */

export interface CollisionRect {
  left: number
  top: number
  width: number
  height: number
}

export interface CollisionCandidate {
  id: number | string
  rect: CollisionRect
}

export interface RankedCollision<T extends CollisionCandidate> {
  id: T['id']
  /** 0 = 指针就在里面；否则是指针到中心的距离（px） */
  value: number
  candidate: T
}

/** 迟滞（px）：换目标要「明显更好」才发生 */
export const COLLISION_HYSTERESIS = 12

function sameId(a: CollisionCandidate['id'], b: CollisionCandidate['id']): boolean {
  return String(a) === String(b)
}

export function pointInsideRect(rect: CollisionRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
}

/**
 * 按指针位置给候选排序。`preferred` 是上一次的落点（拖拽中传上一次的 over），
 * 没传就纯按距离排。
 */
export function rankCollisions<T extends CollisionCandidate>(
  candidates: T[],
  point: { x: number; y: number },
  preferred: T['id'] | null = null,
  hysteresis: number = COLLISION_HYSTERESIS,
): RankedCollision<T>[] {
  const ranked: RankedCollision<T>[] = candidates.map((candidate) => {
    const { rect } = candidate
    const value = pointInsideRect(rect, point.x, point.y)
      ? 0
      : Math.hypot(
          point.x - (rect.left + rect.width / 2),
          point.y - (rect.top + rect.height / 2),
        )
    return { id: candidate.id, value, candidate }
  })
  ranked.sort((a, b) => a.value - b.value)

  if (preferred === null || ranked.length < 2) return ranked
  const index = ranked.findIndex((entry) => sameId(entry.id, preferred))
  if (index <= 0) return ranked
  if (ranked[index].value - ranked[0].value > hysteresis) return ranked
  return [ranked[index], ...ranked.filter((_, i) => i !== index)]
}

/**
 * 指针在拖拽矩形之外（键盘拖拽没有指针坐标）时的兜底点：取矩形中心。
 */
export function centerOfRect(rect: CollisionRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}
