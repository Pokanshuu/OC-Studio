'use client'

/**
 * 画廊视图（Cover Flow）：一排封面，中间一张正对，两侧沿 Y 轴侧过去。
 *
 * 行为：
 * - 横向 `scroll-snap` 翻页
 * - **滚轮一格翻一张**：鼠标滑轮直接吸到上一张 / 下一张（触控板一次手势也只翻一张）
 * - `fill` 模式下**卡片跟着栏高变**：按容器高度 × 比例算宽度，拖高下半 / 上半时卡片一起放大
 * - 不靠 state 驱动透视：滚动时 rAF 直接读几何位置写 `transform`，与 `StretchyHeader` 同一套做法
 * - `prefers-reduced-motion` 下关闭透视与缩放，退化成普通横排
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface CoverFlowProps {
  children: ReactNode[]
  /** 固定格宽（px）；给了 `fill` 时作为上限参考 */
  itemWidth?: number
  /** 按容器高度算格宽（画廊上下分栏里用） */
  fill?: boolean
  /** 卡片宽高比（宽 / 高）：角色卡 7/6、书籍 2/3 */
  aspect?: number
  /** fill 模式下的宽度上限 */
  maxItemWidth?: number
  className?: string
}

const MAX_ROTATE = 34
const MAX_SHRINK = 0.18
const MAX_DEPTH = 140

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function CoverFlow({
  children,
  itemWidth = 300,
  fill = false,
  aspect = 7 / 6,
  maxItemWidth = 560,
  className = '',
}: CoverFlowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)

  /** 实际格宽：fill 模式量容器高度算，否则用固定值 */
  const width = fill && measuredWidth ? measuredWidth : itemWidth

  // fill：按容器高度算格宽（高度 → 宽度 = 高度 × 比例）
  useEffect(() => {
    if (!fill) return
    const scroller = scrollerRef.current
    if (!scroller) return
    const read = (): void => {
      const height = scroller.clientHeight
      if (height <= 0) return
      setMeasuredWidth(Math.round(clamp(height * aspect, 140, maxItemWidth)))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [fill, aspect, maxItemWidth])

  // 透视：滚动时 rAF 直接写每格 transform
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const items = Array.from(scroller.children) as HTMLElement[]
    if (items.length === 0) return

    let frame = 0

    const paint = (): void => {
      frame = 0
      const viewport = scroller.getBoundingClientRect()
      const centerX = viewport.left + viewport.width / 2
      const half = Math.max(1, viewport.width / 2)
      for (const item of items) {
        const rect = item.getBoundingClientRect()
        const distance = rect.left + rect.width / 2 - centerX
        const t = Math.max(-1, Math.min(1, distance / half))
        if (reduced) {
          item.style.transform = ''
          item.style.opacity = '1'
          continue
        }
        const rotate = -t * MAX_ROTATE
        const scale = 1 - Math.abs(t) * MAX_SHRINK
        const depth = -Math.abs(t) * MAX_DEPTH
        item.style.transform = `perspective(1400px) rotateY(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)}) translateZ(${depth.toFixed(1)}px)`
        item.style.opacity = String(1 - Math.abs(t) * 0.45)
        item.style.zIndex = String(100 - Math.round(Math.abs(t) * 100))
      }
    }

    const schedule = (): void => {
      if (frame) return
      frame = requestAnimationFrame(paint)
    }

    paint()
    const observer = new ResizeObserver(schedule)
    observer.observe(scroller)
    scroller.addEventListener('scroll', schedule, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [children.length, width])

  // 滚轮：**一格一张，直接吸到下一张**（不做自由滚动）。
  // 两个环境事实决定了写法：
  // 1. `overflow-y: hidden` 的容器在 Chromium 里会先把竖向滚轮吃掉、不再往上冒，
  //    所以监听挂在 window 的**捕获阶段**；
  // 2. `x mandatory` 下 `scrollLeft += step` 会被当场吸回最近的卡片 ——
  //    既然要的是一张一张翻，直接算出下一张的吸附位置再 `scrollTo` 更稳。
  // 判定：鼠标滚轮一格（|delta| ≥ 40）算一次；触控板的小 delta 先累加，
  // 过阈值翻一张，同一次手势里的惯性全部吞掉，避免一划飞过好几张。
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /** 超过这个间隔就算新的一次滚轮手势 */
    const GESTURE_GAP = 260
    /** 鼠标滚轮一格的 deltaY（Chromium 常见 100 / 120） */
    const NOTCH = 40
    /** 触控板累计到这么多才翻一张 */
    const TOUCH_STEP = 50

    /** 本次手势的目标格（不读动画中的实际位置，连翻时不会原地打转） */
    let targetIndex = -1
    let accumulated = 0
    let steppedThisGesture = false
    let lastWheelAt = 0

    const cards = (): HTMLElement[] =>
      (Array.from(scroller.children) as HTMLElement[]).filter(
        (item) => item.getAttribute('aria-hidden') !== 'true',
      )

    const nearestIndex = (items: HTMLElement[]): number => {
      const viewport = scroller.getBoundingClientRect()
      const center = viewport.left + viewport.width / 2
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      items.forEach((item, index) => {
        const rect = item.getBoundingClientRect()
        const distance = Math.abs(rect.left + rect.width / 2 - center)
        if (distance < bestDistance) {
          bestDistance = distance
          best = index
        }
      })
      return best
    }

    /** 把第 `index` 张（绝对下标）滑到正中 */
    const scrollToIndex = (items: HTMLElement[], index: number): void => {
      const rect = items[index].getBoundingClientRect()
      const viewport = scroller.getBoundingClientRect()
      const center = viewport.left + viewport.width / 2
      const max = scroller.scrollWidth - scroller.clientWidth
      const left = Math.max(0, Math.min(max, scroller.scrollLeft + (rect.left + rect.width / 2 - center)))
      scroller.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' })
    }

    const onWheel = (event: WheelEvent): void => {
      const target = event.target
      if (!(target instanceof Node) || !scroller.contains(target)) return
      // 触控板横滑交给浏览器原生 snap；Ctrl + 滚轮是缩放 / 捏合
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      if (event.ctrlKey) return
      if (scroller.scrollWidth - scroller.clientWidth <= 0) return

      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * scroller.clientWidth
            : event.deltaY
      if (delta === 0) return

      const now = performance.now()
      if (now - lastWheelAt > GESTURE_GAP) {
        targetIndex = -1
        accumulated = 0
        steppedThisGesture = false
      }
      lastWheelAt = now

      // 这一次手势已经翻过一张：剩下的（触控板惯性 / 连发）全部吞掉
      if (steppedThisGesture) {
        event.preventDefault()
        return
      }

      const notch = Math.abs(delta) >= NOTCH
      let direction = Math.sign(delta)
      if (!notch) {
        accumulated += delta
        if (Math.abs(accumulated) < TOUCH_STEP) {
          event.preventDefault()
          return
        }
        direction = Math.sign(accumulated)
        accumulated = 0
      }

      const items = cards()
      if (items.length === 0) return
      // 第一次滚动时对齐到当前看得最正的那张（拖过滚动条 / 点过卡片也不会跳）
      if (targetIndex < 0 || targetIndex >= items.length) targetIndex = nearestIndex(items)

      const next = Math.max(0, Math.min(items.length - 1, targetIndex + direction))
      // 到边了：不拦默认行为，把滚动交还给外层（别把上下分栏 / 页面滚死）
      if (next === targetIndex) return

      event.preventDefault()
      scrollToIndex(items, next)
      targetIndex = next
      // 触控板的一次手势里可能跟着几十个惯性事件，只翻第一张
      if (!notch) steppedThisGesture = true
    }

    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  return (
    <div
      ref={scrollerRef}
      className={`coverflow-scroll flex h-full snap-x snap-mandatory items-center gap-6 overflow-x-auto overflow-y-hidden ${
        fill ? '' : 'py-8'
      } ${className}`}
      style={{
        scrollPaddingLeft: `calc(50% - ${width / 2}px)`,
        scrollPaddingRight: `calc(50% - ${width / 2}px)`,
      }}
    >
      {/* 首尾留白：让第一张 / 最后一张也能停在正中间 */}
      <div className="shrink-0" style={{ width: `calc(50% - ${width / 2}px)` }} aria-hidden />
      {children.map((child, index) => (
        <div
          key={index}
          className="shrink-0 snap-center transition-transform will-change-transform"
          style={{ width }}
        >
          {child}
        </div>
      ))}
      <div className="shrink-0" style={{ width: `calc(50% - ${width / 2}px)` }} aria-hidden />
    </div>
  )
}
