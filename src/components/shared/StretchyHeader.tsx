'use client'

import { useEffect, useRef, type RefObject, type ReactNode } from 'react'

/** 下拉最多再拉多少（px）：够看出「弹性」，又不至于把图放得太大 */
const DEFAULT_MAX_PULL = 88
/** 向上滚动时最多收掉自身高度的多少 */
const DEFAULT_COLLAPSE = 0.35
/** 收完这段滚动距离（px）就收到底 */
const DEFAULT_COLLAPSE_RANGE = 240
/** 折叠时图片在框内向上错位的比例（制造纵深；0 = 关掉视差） */
const DEFAULT_PARALLAX = 0.3
/** 滚轮停下多久开始回弹 */
const RELEASE_DELAY = 140

interface StretchyHeaderProps {
  /** 图区内容（图片 / 占位），会跟着放大层整体缩放 */
  children: ReactNode
  /** 不跟着缩放的浮层（换图、删除），绝对定位铺满头图 */
  overlay?: ReactNode
  /** 宽高比（宽 / 高），默认 3:2 —— 与原来的头图一致 */
  ratio?: number
  /** 头图框的点击（桌面端点一下换图） */
  onClick?: () => void
  className?: string
  maxPull?: number
  collapse?: number
  collapseRange?: number
  parallax?: number
}

/**
 * 头图弹性容器（Stretchy Header）。
 *
 * 三种效果共用同一个 scrollTop，全部用 rAF 直接写 style、不进 state ——
 * 头图跟着滚动变化时不会带着整页重渲染：
 *   1. 下拉放大：在页面顶部继续往下拉，**框跟着长高**、头图按同一比例整体放大
 *      （等比缩放，不拉扁），于是左右多出来的画面被框裁掉、上下不裁 —— 是「镜头
 *      推近」而不是「拉长」。松手回弹。系统自带回弹的平台（macOS / iOS）直接读
 *      负的 scrollTop；Windows 与 Android 的滚动位置夹在 0，所以自己累计滚轮 /
 *      拖动量补上这一段。
 *   2. 滚动折叠：向上滚时高度线性收掉，正文从下面顶上来（省掉半屏空白）。
 *   3. 视差：折叠时图片在框内向上错位，画面不是「被剪掉」而是「被推走」。
 *
 * 头图仍在普通文档流里（不是 fixed 层），编辑器的页头、移动端安全区、头像的
 * 负偏移都不用改。`prefers-reduced-motion` 下整体不生效，退回静态 3:2 图。
 */
export function StretchyHeader({
  children,
  overlay,
  ratio = 3 / 2,
  onClick,
  className,
  maxPull = DEFAULT_MAX_PULL,
  collapse = DEFAULT_COLLAPSE,
  collapseRange = DEFAULT_COLLAPSE_RANGE,
  parallax = DEFAULT_PARALLAX,
}: StretchyHeaderProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)

  useStretchyHeader(frameRef, mediaRef, { ratio, maxPull, collapse, collapseRange, parallax })

  return (
    <div
      ref={frameRef}
      onClick={onClick}
      className={`relative w-full overflow-hidden ${className ?? ''}`}
      // 量到宽度之前（以及 JS 失效时）靠这条比例撑住框，量到之后由 height 接管
      style={{ aspectRatio: String(ratio) }}
    >
      {/* 缩放原点在顶边：放大时顶边钉住、往下长，框长多少就露出多少，上下不裁 */}
      <div ref={mediaRef} className="absolute inset-0 origin-top">
        {children}
      </div>
      {overlay ? <div className="absolute inset-0">{overlay}</div> : null}
    </div>
  )
}

/* ── 驱动逻辑 ───────────────────────────────────────────────
   量高度 / 算放大与折叠 / 写样式全在一个 effect 里：它只依赖几个数字参数，
   滚动过程中不触发 React 渲染。 */

interface StretchOptions {
  ratio: number
  maxPull: number
  collapse: number
  collapseRange: number
  parallax: number
}

function useStretchyHeader(
  frameRef: RefObject<HTMLDivElement | null>,
  mediaRef: RefObject<HTMLDivElement | null>,
  { ratio, maxPull, collapse, collapseRange, parallax }: StretchOptions,
) {
  useEffect(() => {
    const frame = frameRef.current
    const media = mediaRef.current
    if (!frame || !media) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const scroller = findScrollContainer(frame)
    if (!scroller) return

    /** 头图的基准高度（按宽度与比例算出来），0 = 还没量到 */
    let baseHeight = 0
    /** 上一次量到的宽度：ResizeObserver 也会因我们自己改高度而触发，用它去重 */
    let lastWidth = -1
    /** 已写入的高度 / transform，避免每帧写同样的值 */
    let writtenHeight = -1
    let writtenTransform = ''
    /** 当前折叠量（px）：算下一步时要用它判断「还能不能再收」 */
    let collapsed = 0
    /** 自己补的下拉量（系统不回弹的平台），松手后指数衰减回 0 */
    let pull = 0

    let scrollRaf = 0
    let settleRaf = 0
    let releaseTimer = 0

    let touchStartY = 0
    let touching = false

    const write = () => {
      scrollRaf = 0
      if (baseHeight <= 0) return

      const scrollTop = scroller.scrollTop
      // 系统回弹时 scrollTop 是负数；自己补的下拉量取两者较大的那个，避免叠两倍
      const native = scrollTop < 0 ? -scrollTop : 0
      const pullPx = Math.min(Math.max(native, pull), maxPull)

      // 折叠量按滚动距离线性收缩。折叠会缩短内容总高，收到「滚动位置无法到达」
      // 的程度时浏览器会回夹 scrollTop、于是来回跳 —— 这里按剩余可滚距离封顶。
      const room = scroller.scrollHeight - scroller.clientHeight
      const wanted =
        collapse > 0
          ? baseHeight * collapse * Math.min(1, Math.max(0, scrollTop) / collapseRange)
          : 0
      const allowed = Math.max(0, room - scrollTop + collapsed)
      collapsed = Math.min(wanted, allowed)

      // 下拉时框跟着长高；图按同一比例整体放大（等比，不变形）——
      // 于是上下正好填满、不裁，左右多出来的部分被框裁掉
      const height = Math.max(32, baseHeight + pullPx - collapsed)
      if (Math.abs(height - writtenHeight) > 0.5) {
        frame.style.height = `${height}px`
        writtenHeight = height
      }

      // 折叠时图区高度不动、整体上移，框只露出它的一段 —— 于是有视差
      const scale = pullPx > 0 ? (baseHeight + pullPx) / baseHeight : 1
      const shift = collapsed > 0 ? -collapsed * parallax : 0
      const transform = `translate3d(0, ${shift.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`
      if (transform !== writtenTransform) {
        media.style.transform = transform
        writtenTransform = transform
      }
    }

    const measure = () => {
      const width = frame.clientWidth
      if (width <= 0 || width === lastWidth) return
      lastWidth = width
      baseHeight = width / ratio
      media.style.height = `${baseHeight}px`
      writtenHeight = -1
      writtenTransform = ''
      write()
    }

    const schedule = () => {
      if (scrollRaf === 0) scrollRaf = requestAnimationFrame(write)
    }

    const cancelSettle = () => {
      if (settleRaf !== 0) {
        cancelAnimationFrame(settleRaf)
        settleRaf = 0
      }
      if (releaseTimer !== 0) {
        clearTimeout(releaseTimer)
        releaseTimer = 0
      }
    }

    const settle = () => {
      settleRaf = 0
      pull *= 0.82
      if (pull < 0.5) pull = 0
      write()
      if (pull > 0) settleRaf = requestAnimationFrame(settle)
    }

    /** 松开（或被正常滚动接管）：让下拉量自己衰减，别硬切 —— 硬切会看到高度弹跳 */
    const release = () => {
      if (releaseTimer !== 0) {
        clearTimeout(releaseTimer)
        releaseTimer = 0
      }
      if (settleRaf === 0 && pull > 0) settleRaf = requestAnimationFrame(settle)
    }

    const onWheel = (e: WheelEvent) => {
      // 只有「已经在顶部还继续往上滚」才算弹性，其余交给正常滚动
      if (scroller.scrollTop > 0) {
        release()
        return
      }
      // 系统自己在回弹（macOS / iOS）：读 scrollTop 就够了，别再叠一层
      if (scroller.scrollTop < 0) return

      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1
      const delta = e.deltaY * unit
      if (delta >= 0) {
        release()
        return
      }

      cancelSettle()
      pull = Math.min(maxPull, pull - delta * 0.45)
      schedule()
      releaseTimer = window.setTimeout(settle, RELEASE_DELAY)
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || scroller.scrollTop > 0) {
        touching = false
        return
      }
      touching = true
      touchStartY = e.touches[0]?.clientY ?? 0
      cancelSettle()
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!touching) return
      // 已经在滚，或系统已在回弹：弹性交回去（合成量自己衰减，避免高度硬跳）
      if (scroller.scrollTop !== 0) {
        touching = false
        release()
        return
      }
      const y = e.touches[0]?.clientY ?? touchStartY
      const delta = y - touchStartY
      if (delta <= 0) {
        release()
        return
      }
      // 阻尼：拉得越远越沉
      pull = maxPull * (1 - Math.exp(-delta / maxPull))
      schedule()
    }

    const onTouchEnd = () => {
      if (!touching) return
      touching = false
      release()
    }

    scroller.addEventListener('scroll', schedule, { passive: true })
    scroller.addEventListener('wheel', onWheel, { passive: true })
    scroller.addEventListener('touchstart', onTouchStart, { passive: true })
    scroller.addEventListener('touchmove', onTouchMove, { passive: true })
    scroller.addEventListener('touchend', onTouchEnd, { passive: true })
    scroller.addEventListener('touchcancel', onTouchEnd, { passive: true })

    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    measure()

    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', schedule)
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('touchend', onTouchEnd)
      scroller.removeEventListener('touchcancel', onTouchEnd)
      if (scrollRaf !== 0) cancelAnimationFrame(scrollRaf)
      cancelSettle()
      frame.style.height = ''
      media.style.height = ''
      media.style.transform = ''
    }
  }, [frameRef, mediaRef, ratio, maxPull, collapse, collapseRange, parallax])
}

/** 最近的纵向滚动容器（编辑页里是各 section 的 `.section-fade`） */
function findScrollContainer(from: HTMLElement): HTMLElement | null {
  let node = from.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
    node = node.parentElement
  }
  return null
}
