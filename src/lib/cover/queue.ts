/**
 * 封面卡的渲染队列。
 *
 * 一屏可能有二三十张卡，每张的逐行模糊都是几毫秒的主线程活。全部堆在一个帧里
 * 会直接掉帧，所以排队、一帧只画两张：滚动时先看到色块（首帧就有底），
 * 画布随后补上，滚动条不会卡。
 *
 * 按画布去重：拖动参数滑杆时每秒会有几十次重画请求，同一张卡只保留**最后一次**，
 * 队列不会越积越长。
 */

type CoverTask = () => void

const pending = new Map<number, CoverTask>()
const keys = new WeakMap<object, number>()
let nextKey = 0
let scheduled = false

/** 一帧画几张：3 张 × 约 4ms 仍然在 16ms 预算内 */
const PER_FRAME = 2

function pump(): void {
  scheduled = false
  let drawn = 0
  for (const [key, task] of pending) {
    if (drawn >= PER_FRAME) break
    pending.delete(key)
    task()
    drawn += 1
  }
  if (pending.size > 0) schedule()
}

function schedule(): void {
  if (scheduled) return
  scheduled = true
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump)
  else window.setTimeout(pump, 16)
}

/** `target` 一般传画布元素：同一张卡只排一次，后来的覆盖先前的 */
export function enqueueCoverRender(target: object, task: CoverTask): void {
  let key = keys.get(target)
  if (key === undefined) {
    nextKey += 1
    key = nextKey
    keys.set(target, key)
  }
  pending.set(key, task)
  schedule()
}
