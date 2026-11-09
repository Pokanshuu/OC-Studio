'use client'

/**
 * 列表 ↔ 编辑器 的滑动切换容器。
 *
 * 用**同一套** `page.tsx` 里角色 / 事件 / 国家在用的东西：`.section-stack` 把两边叠在
 * 同一格、`.section-fade` 用 `data-visible` 过渡显隐，切进 / 切出时给 150ms 的
 * `data-animate`（列表左滑出、编辑器右滑入）。小说书架与自定义分类此前是在组件里
 * 直接 `if (xx) return <Editor>` 硬切 —— 数据和实体列表一样，差的就是这一层。
 *
 * 两边都保持挂载（和实体板块一致）：编辑器只在实际打开时渲染内容，列表一直在，
 * 这样「退回列表」时列表能滑入，而不是等挂载完成才出现。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

type SlideAnim = 'to-editor' | 'to-list' | null

export function SectionSwap({
  open,
  editor,
  list,
}: {
  /** 编辑器是否打开 */
  open: boolean
  /** 编辑器内容（只在打开时传，关闭时传 null 即可） */
  editor: ReactNode
  /** 列表内容（一直挂载） */
  list: ReactNode
}) {
  const [slide, setSlide] = useState<SlideAnim>(null)
  const previous = useRef(open)

  useEffect(() => {
    if (previous.current === open) return
    previous.current = open
    setSlide(open ? 'to-editor' : 'to-list')
    const timer = setTimeout(() => setSlide(null), 150)
    return () => clearTimeout(timer)
  }, [open])

  return (
    <div className="section-stack">
      <div
        className="h-full section-fade overflow-y-auto"
        data-visible={open ? 'true' : 'false'}
        data-animate={
          slide === 'to-editor' ? 'slide-in-right' : slide === 'to-list' ? 'slide-out-right' : undefined
        }
      >
        {editor}
      </div>
      <div
        className="h-full section-fade overflow-y-auto"
        data-visible={open ? 'false' : 'true'}
        data-animate={
          slide === 'to-editor' ? 'slide-out-left' : slide === 'to-list' ? 'slide-in-left' : undefined
        }
      >
        {list}
      </div>
    </div>
  )
}
