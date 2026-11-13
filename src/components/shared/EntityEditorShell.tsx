'use client'

import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { ArrowLeft, Menu } from 'lucide-react'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { ListWidthResizer } from '@/components/editor/ListWidthResizer'
import { useListWidth } from '@/components/editor/useListWidth'
import { ICON_BTN_MD } from '@/lib/ui-tokens'

interface EntityEditorShellProps {
  title: string
  onBack?: () => void
  /** 没有列表的编辑器（分类条目）不传 `list`，也就不会出现「展开列表」按钮 */
  list?: ReactNode
  listOpen?: boolean
  onToggleList?: () => void
  editor: Editor | null
  headerRight: ReactNode
  children: ReactNode
}

/**
 * 实体编辑器外壳：独立左列表面板 + 编辑器面板。
 *
 * 编辑器顶栏一条横跨中栏/正文：左 = 返回/标题（列表收起时最左是展开按钮），
 * 中 = 格式工具条（水平居中），右 = 历史/保存。列表在「全屏」下同样可保留或收起。
 *
 * `list` 可选：分类条目这类「没有同级列表」的编辑器也走这套壳，
 * 为的是页头高度 / 工具条位置 / 与实体编辑器一字不差。
 */
export function EntityEditorShell({
  title,
  onBack,
  list,
  listOpen = false,
  onToggleList,
  editor,
  headerRight,
  children,
}: EntityEditorShellProps) {
  const hasList = list !== undefined
  const { width: listWidth, startDrag: startListDrag, reset: resetListWidth } = useListWidth()

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* 列表收起/展开用宽度过渡（与相册一致），不是直接卸载；无列表的编辑器整块不渲染 */}
      {hasList ? (
        <aside
          className={`relative flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-base ease-quiet ${
            listOpen ? 'border-r border-line' : 'border-r-0'
          }`}
          style={{ width: listOpen ? listWidth : 0 }}
          aria-hidden={!listOpen}
          inert={!listOpen}
        >
          {list}
          {listOpen ? <ListWidthResizer onDragStart={startListDrag} onReset={resetListWidth} /> : null}
        </aside>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 顶栏覆盖在滚动内容上（z-30），backdrop-blur 才有内容可模糊；内容在滚动容器内用 h-12 spacer 让出位置 */}
        <div className="absolute inset-x-0 top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur-lg">
          <div className="flex shrink-0 items-center gap-2">
            {hasList && !listOpen && onToggleList ? (
              <button
                type="button"
                onClick={onToggleList}
                className={ICON_BTN_MD}
                title="展开列表"
                aria-label="展开列表"
              >
                <Menu size={16} strokeWidth={2} />
              </button>
            ) : null}
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                data-mobile-back
                className={`${ICON_BTN_MD} w-auto gap-1 px-1.5`}
                aria-label="返回"
                title="返回"
              >
                <ArrowLeft size={16} strokeWidth={2} />
                <span className="text-[13px]">返回</span>
              </button>
            ) : null}
            <h2 className="sr-only">{title}</h2>
          </div>

          {/*
            格式栏吃掉剩下的宽度，**不设固定宽度**：以前写死 `min(640px, 60%)` +
            `flex-none`，面板被三分栏压窄时工具条仍然按六十趴占位，图标就压到右边的保存上。
            现在它自己量宽度、放不下的收进「…」。
          */}
          <div className="flex min-w-0 flex-1 items-center justify-center">
            {editor ? <EditorToolbar editor={editor} embedded /> : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1">{headerRight}</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
