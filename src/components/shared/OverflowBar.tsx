'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { ICON_BTN_MD } from '@/lib/ui-tokens'
import { ToolbarMenu, type ToolbarMenuGroup } from '@/components/editor/ToolbarMenu'

/**
 * 一条会自动收口的工具栏。
 *
 * **为什么要量宽度而不是设断点**：这些栏长在「编辑器面板」「列表 + 画布」这类
 * 宽度由布局决定的地方，同一块屏幕可能只剩四五百像素可用（三分栏、侧栏展开）。
 * 按窗口宽度切档，在这种面板里永远是错的 —— 图标挤在一起、压到旁边的按钮上
 * （截图里「保存」被挤歪、右侧图标被裁掉一半，都是这个原因）。
 *
 * 做法：把全部条目再渲染一份**看不见的度量行**（`visibility: hidden`，仍有布局宽度），
 * 按容器实际宽度从右往左收；收掉的条目进同一个「…」菜单。度量行常驻，
 * 所以收掉的条目下次仍然量得到尺寸，不会来回抖。
 *
 * 收口顺序就是数组顺序，所以把最不该消失的放前面；扣掉「…」的宽度之后，
 * 后面还放得下的小条目会被接回来（不然会出现「明明还有空，却掉了一个图标」）。
 * 每个条目自己决定「进菜单后长什么样」（`menu`）；没给 `menu` 的条目就只是从栏里消失。
 */
export interface OverflowEntry {
  key: string
  /** 栏里显示的样子 */
  node: ReactNode
  /** 收进「…」后的样子；不写就只是从栏里消失 */
  menu?: ToolbarMenuGroup[]
}

interface OverflowBarProps {
  /** 永远不参与收口的左侧内容（标题 / 返回） */
  lead?: ReactNode
  entries: OverflowEntry[]
  /** 永远不参与收口的右侧内容（保存 / 锁定） */
  trail?: ReactNode
  /** 常驻菜单项：不依赖收口，一直都在「…」里（表格 / 查找这类从来不占栏的） */
  menuGroups?: ToolbarMenuGroup[]
  /** 条目之间的间距，默认 8px（`gap-2`） */
  gap?: number
  className?: string
  moreTitle?: string
}

/** 「…」按钮宽度：`ICON_BTN_MD` 是 h-8 w-8 */
const MORE_BTN_WIDTH = 32

/** 同名的组合并成一组：几个条目一起收进菜单时，不要在菜单里出现三个「显示」标题 */
function mergeGroups(groups: ToolbarMenuGroup[]): ToolbarMenuGroup[] {
  const merged: ToolbarMenuGroup[] = []
  for (const group of groups) {
    const existing = group.label ? merged.find((item) => item.label === group.label) : undefined
    if (existing) {
      for (const item of group.items) {
        if (!existing.items.some((known) => known.label === item.label)) existing.items.push(item)
      }
    } else merged.push({ ...group, items: [...group.items] })
  }
  return merged
}

export function OverflowBar({
  lead,
  entries,
  trail,
  menuGroups,
  gap = 8,
  className = '',
  moreTitle = '更多',
}: OverflowBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const leadRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  /** 收口后留在栏里的条目下标 */
  const [kept, setKept] = useState<number[]>(() => entries.map((_, index) => index))
  const [moreAnchor, setMoreAnchor] = useState<HTMLButtonElement | null>(null)

  // 条目会被渲染两次（真身 + 度量行），effect 里只按 key 序列重算，不依赖每个 render 的新数组
  const entriesRef = useRef(entries)
  const gapRef = useRef(gap)
  const keys = entries.map((entry) => entry.key).join('\u0000')

  const keptRef = useRef(kept)
  const computeRef = useRef<() => void>(() => {})

  /**
   * 每次渲染后都再算一遍。
   *
   * 只靠 `ResizeObserver` 会漏事件：面板从 `display: none` 切回来、
   * 字体加载完字宽变了、父级在做宽度动画 —— 这些时候栏不一定收到通知，
   * 收口结果就停在上一轮（表现为「明明窄了，图标还挤着」，或者「明明放得下，却藏起来了」）。
   *
   * 顺带把这次渲染的三个入参同步进 ref（不在 render 期间写 ref）。
   */
  useLayoutEffect(() => {
    entriesRef.current = entries
    gapRef.current = gap
    keptRef.current = kept
    computeRef.current()
  })

  useLayoutEffect(() => {
    const bar = barRef.current
    const measure = measureRef.current
    if (!bar || !measure) return

    /**
     * 量一次，算出「哪些还放得下」。
     *
     * 宽度还没就绪（面板正被藏起来 / 还在动画里）时**保留上次结果**，不要清空 ——
     * 清空会让「…」一闪。等真的量到宽度时再覆盖。
     */
    const compute = () => {
      const width = bar.clientWidth
      if (width <= 0) return
      const list = entriesRef.current
      const spacing = gapRef.current
      const leadWidth = leadRef.current?.offsetWidth ?? 0
      const trailWidth = trailRef.current?.offsetWidth ?? 0
      const outerGaps = (leadRef.current ? spacing : 0) + (trailRef.current ? spacing : 0)
      const available = width - leadWidth - trailWidth - outerGaps
      const widths = list.map(
        (entry) => measure.querySelector<HTMLElement>(`[data-entry="${entry.key}"]`)?.offsetWidth ?? 0,
      )

      const total = widths.reduce((sum, item) => sum + item, 0) + spacing * Math.max(0, list.length - 1)
      let next: number[]
      if (available <= 0) {
        next = []
      } else if (total <= available) {
        next = list.map((_, index) => index)
      } else {
        // 要腾出「…」的位置，先扣掉它的宽度，再按顺序贪心；后面放得下的小项照样留下
        const budget = available - MORE_BTN_WIDTH - spacing
        next = []
        let used = 0
        for (let index = 0; index < widths.length; index += 1) {
          const need = (next.length > 0 ? spacing : 0) + widths[index]
          if (used + need <= budget) {
            next.push(index)
            used += need
          }
        }
      }

      // 内容没变就不要 setState：否则 渲染 → 量 → setState 会转起来
      const current = keptRef.current
      if (next.length === current.length && next.every((value, index) => value === current[index])) return
      setKept(next)
    }

    computeRef.current = compute

    // 面板还没显形时逐帧再试（最多两秒），之后交给 ResizeObserver 与「每次渲染都算一次」
    let frame = 0
    let attempts = 0
    const retry = () => {
      attempts += 1
      if (bar.clientWidth > 0) {
        compute()
        return
      }
      if (attempts <= 120) frame = requestAnimationFrame(retry)
    }

    compute()
    if (bar.clientWidth <= 0) frame = requestAnimationFrame(retry)

    const observer = new ResizeObserver(compute)
    observer.observe(bar)
    // 条目自身会变宽（筛选器选中了更长的名字、显示档位文字变长），度量行也要跟着观察
    observer.observe(measure)
    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      computeRef.current = () => {}
    }
  }, [keys])

  const keptSet = new Set(kept)
  const firstDropped = entries.findIndex((_, index) => !keptSet.has(index))
  const hiddenGroups = entries.filter((_, index) => !keptSet.has(index)).flatMap((entry) => entry.menu ?? [])
  const allGroups = mergeGroups([...hiddenGroups, ...(menuGroups ?? [])])
  const hasMenu = allGroups.length > 0

  const moreButton = (
    <button
      key="__overflow-more__"
      type="button"
      title={moreTitle}
      aria-label={moreTitle}
      aria-haspopup="menu"
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => setMoreAnchor(e.currentTarget)}
      className={ICON_BTN_MD}
    >
      <MoreHorizontal size={16} strokeWidth={2} />
    </button>
  )

  return (
    <div
      ref={barRef}
      className={`relative flex min-w-0 items-center overflow-hidden ${className}`}
      style={{ gap }}
    >
      {lead ? (
        <div ref={leadRef} className="flex shrink-0 items-center">
          {lead}
        </div>
      ) : null}

      {entries.map((entry, index) => {
        if (keptSet.has(index)) {
          return (
            <div key={entry.key} className="flex shrink-0 items-center">
              {entry.node}
            </div>
          )
        }
        // 「…」放在第一个被收掉的条目原来的位置上，后面的条目顺序不变
        if (index === firstDropped && hasMenu) return moreButton
        return null
      })}

      {/* 一个都没收，但仍有「…」里的常驻项（表格 / 查找这类）：按钮挂在末尾 */}
      {firstDropped === -1 && hasMenu ? moreButton : null}

      {trail ? (
        // `ml-auto`：有富余时靠右（页头右侧动作区的老位置），挤的时候自动归零，不占固定宽度
        <div ref={trailRef} className="ml-auto flex shrink-0 items-center">
          {trail}
        </div>
      ) : null}

      {/*
        度量行：`visibility: hidden` 仍然有布局宽度（`display: none` 会是 0），
        绝对定位所以不占位，`inert` 避免被 Tab / 朗读软件碰到。
      */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute left-0 top-0 flex h-0 items-center overflow-hidden"
        style={{ gap }}
      >
        {entries.map((entry) => (
          <div key={entry.key} data-entry={entry.key} className="flex shrink-0 items-center">
            {entry.node}
          </div>
        ))}
      </div>

      {moreAnchor ? (
        <ToolbarMenu anchor={moreAnchor} groups={allGroups} onClose={() => setMoreAnchor(null)} />
      ) : null}
    </div>
  )
}
