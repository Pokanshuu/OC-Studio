'use client'

/**
 * 表格（树形表格）的页签条：四个页签**可拖拽调序**（`docs/todo.md` 表格一节）。
 *
 * 只做拖拽与渲染。**顺序由这条页签栏自己持有并落盘**（`tree-table-tabs.ts` 负责
 * 默认值、校验与移动算法），父组件只管当前选中哪个页签 —— 拖动时重渲染的只有
 * 这四个按钮，不会带着整张表一起重画。
 *
 * **为什么不用原生 HTML5 拖放**：桌面版跑在 Tauri（WebView2）里，`tauri.conf.json`
 * 没关 `dragDropEnabled`，WebView 会把 dragstart / dragover 当成系统文件拖放收走，
 * 页面里的 `draggable` 拖不动（浏览器里能拖、桌面版不能，就是这个）。所以这里用
 * **Pointer Events**：按住后横向过 6px 才算开始拖，移动中按「指针越过哪个页签的中线」
 * 实时换位，松手即结束 —— 鼠标、触控板、触屏都走同一条路径。
 *
 * 换位判据只看指针 x 与各页签中线：等宽四列下越过邻格中线才换，指针停住不会来回抖。
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TAB_LABEL, moveTab, readTabOrder, writeTabOrder, type TreeTableTab } from './tree-table-tabs'

interface TreeTableTabsProps {
  tab: TreeTableTab
  onTabChange: (tab: TreeTableTab) => void
}

/** 按下后横向移动超过这个距离才算「拖」，否则就是点击切页签 */
const DRAG_THRESHOLD = 6

export function TreeTableTabs({ tab, onTabChange }: TreeTableTabsProps) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  // 顺序只活在这一条页签栏里：拖动时重渲染的范围就限于这四个按钮
  const [order, setOrder] = useState<TreeTableTab[]>(() => readTabOrder())
  const [dragging, setDragging] = useState<TreeTableTab | null>(null)
  // 拖拽期间读的是「刚刚算出来的顺序」而不是按下那一刻的闭包；顺序只有
  // `applyOrder` 会改，所以这个镜像不会跟 state 漂
  const orderRef = useRef<TreeTableTab[]>(order)
  const suppressClickRef = useRef(false)
  const stopDragRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopDragRef.current?.(), [])

  const applyOrder = (next: TreeTableTab[]) => {
    orderRef.current = next
    setOrder(next)
    writeTabOrder(next)
  }

  /** 指针 x 落在「第几项之前」：数中线在指针左边的页签有几个 */
  const insertIndexAt = (clientX: number): number => {
    const tabs = stripRef.current?.querySelectorAll<HTMLElement>('[data-tree-tab]')
    if (!tabs) return 0
    let index = 0
    for (const element of tabs) {
      const rect = element.getBoundingClientRect()
      if (clientX > rect.left + rect.width / 2) index += 1
    }
    return index
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, value: TreeTableTab) => {
    if (event.button !== 0) return
    const startX = event.clientX
    let moved = false
    let previousSelect = ''
    let previousCursor = ''

    const move = (moveEvent: PointerEvent) => {
      if (!moved) {
        if (Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD) return
        moved = true
        // 拖到页签外面时不要顺手把正文选中，光标也保持「正在拖」
        previousSelect = document.body.style.userSelect
        previousCursor = document.body.style.cursor
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
        setDragging(value)
      }
      const current = orderRef.current
      const fromIndex = current.indexOf(value)
      if (fromIndex < 0) return
      const next = moveTab(current, fromIndex, insertIndexAt(moveEvent.clientX))
      if (next !== current) applyOrder(next)
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stopDragRef.current = null
      if (moved) {
        document.body.style.userSelect = previousSelect
        document.body.style.cursor = previousCursor
        // 拖完松手会补一个 click，别让它顺手切页签；这一下 click 是同一次输入里
        // 同步派发的，下一帧就把闩放开，免得把「下一次真点击」也吃掉
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
      setDragging(null)
    }

    stopDragRef.current?.()
    stopDragRef.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return (
    <div
      ref={stripRef}
      className="shrink-0"
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return
        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as TreeTableTab)}
        className="shrink-0 gap-0"
      >
        <TabsList className="grid grid-cols-4 px-4 md:px-6">
          {order.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              data-tree-tab={value}
              onPointerDown={(event) => handlePointerDown(event, value)}
              className={`w-full cursor-grab touch-pan-y select-none active:cursor-grabbing ${
                dragging === value ? 'opacity-40' : ''
              }`}
            >
              {TAB_LABEL[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
