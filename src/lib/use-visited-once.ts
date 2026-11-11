'use client'

import { useEffect, useState } from 'react'

/**
 * 「这一次打开应用里，这个区块**被看过**了吗」。
 *
 * 用途：关系图、时间线这类重视图在 400 个角色时要 3 秒左右才能画完（实测 407 节点 /
 * 3.2 万 DOM）。它们是常驻区块（只切 `data-visible`），以前的写法是**开机就全部挂载** ——
 * 从不点关系图的人也要为它付这 3 秒。
 *
 * 拿到 `true` 之后就一直保持 `true`：切走再切回来不重新挂载（滚动位置、缩放、选中状态都还在）。
 * 首次进入时会多一次渲染（从 false 变 true），这一次渲染正是需要的那次。
 */
export function useVisitedOnce(visible: boolean): boolean {
  const [visited, setVisited] = useState(visible)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只在「第一次看见」时置位一次，之后不再变
    if (visible && !visited) setVisited(true)
  }, [visible, visited])

  return visited
}
