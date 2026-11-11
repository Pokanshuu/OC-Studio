/**
 * 封面卡的「进入视口才画」判定 —— **全站共用一个 IntersectionObserver**。
 *
 * 以前每张 `CoverArt` 自己 `new IntersectionObserver(...)` + 自己挂一个 1200ms 兜底计时器：
 * 一屏十几个卡片没问题，但列表里有 400 条时就是 400 个观察者 + 400 个计时器，
 * 而且兜底那一批会在同一时刻各自 `getBoundingClientRect()`（每次都可能触发一次布局），
 * 打开列表时会明显卡一下。
 *
 * 现在：
 * - 观察者单例（`rootMargin` 与以前一致：视口外 280px 就开始准备）；
 * - 兜底计时器全局只有一个，到点时**把还在等的那批一次性量完**（同一帧里读，不夹写），
 *   再统一回调；
 * - 卡片卸载时注销，避免观察者里堆着已经消失的节点。
 */

type Listener = () => void

const pending = new Map<Element, Listener>()
let observer: IntersectionObserver | null = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

const ROOT_MARGIN = '280px 0px'
const FALLBACK_DELAY_MS = 1200

function flushFallback(): void {
  fallbackTimer = null
  // 先把所有矩形读完，再回调（读-写分离，避免逐条触发布局）
  const near: Element[] = []
  for (const el of pending.keys()) {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    if (rect.top < window.innerHeight + 280 && rect.bottom > -280) near.push(el)
  }
  if (near.length > 0) {
    for (const el of near) {
      const listener = pending.get(el)
      pending.delete(el)
      observer?.unobserve(el)
      listener?.()
    }
  }
  // 还有没进入视口的：留在观察者里等滚动；计时器不再重复挂
  if (pending.size === 0) {
    observer?.disconnect()
    observer = null
  }
}

function ensureObserver(): IntersectionObserver | null {
  if (observer !== null) return observer
  if (typeof IntersectionObserver === 'undefined') return null
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const listener = pending.get(entry.target)
        if (listener === undefined) continue
        pending.delete(entry.target)
        observer?.unobserve(entry.target)
        listener()
      }
      if (pending.size === 0) {
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: ROOT_MARGIN },
  )
  return observer
}

/**
 * 元素进入（或接近）视口时回调一次。返回注销函数。
 * 没有 IntersectionObserver 的老 WebView 退化成「下一帧直接回调」。
 */
export function observeCoverVisibility(el: Element, onVisible: Listener): () => void {
  const io = ensureObserver()
  if (io === null) {
    const frame = requestAnimationFrame(onVisible)
    return () => cancelAnimationFrame(frame)
  }
  pending.set(el, onVisible)
  io.observe(el)
  if (fallbackTimer === null) fallbackTimer = setTimeout(flushFallback, FALLBACK_DELAY_MS)
  return () => {
    pending.delete(el)
    observer?.unobserve(el)
    if (pending.size === 0) {
      observer?.disconnect()
      observer = null
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer)
        fallbackTimer = null
      }
    }
  }
}
