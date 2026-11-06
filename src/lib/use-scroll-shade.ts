'use client'

/**
 * 「内容上滑了没有」——列表页页头的那条线与模糊只在滚动后出现。
 *
 * 口径：页头初始是无线、无底色的；`scrollTop > threshold` 才变成
 * `border-line + bg-paper/85 + backdrop-blur`。
 *
 * 必须传**滚动元素本身**（不是 ref）：列表页在「画廊（填充分栏）/ 卡片」之间切换时，
 * 滚动节点会被整个换掉；用 ref 时 effect 的依赖不变，监听会一直挂在已经卸载的旧节点上，
 * 表现就是「模糊层时有时无」（从画廊切回卡片后永远不糊）。
 *
 * 只在滚动时读一次 `scrollTop`，用 rAF 合并，不进 React 的 render 路径。
 */
import { useEffect, useState } from 'react'

export function useScrollShade(scrollEl: HTMLElement | null, threshold = 2): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (!scrollEl) return

    let frame = 0
    const read = (): void => {
      frame = 0
      setScrolled(scrollEl.scrollTop > threshold)
    }
    const onScroll = (): void => {
      if (frame) return
      frame = requestAnimationFrame(read)
    }

    // 新挂上来的节点可能已经带着滚动位置（比如换视图后保留），先读一次
    frame = requestAnimationFrame(read)
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [scrollEl, threshold])

  return scrolled
}
