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
  listOpen: boolean
  onToggleList: () => void
  list: ReactNode
  editor: Editor | null
  headerRight: ReactNode
  children: ReactNode
}

/**
 * 实体编辑器外壳：独立左列表面板 + 编辑器面板。
 *
 * 编辑器顶栏一条横跨中栏/正文：左 = 返回/标题（列表收起时最左是展开按钮），
 * 中 = 格式工具条（水平居中），右 = 历史/保存。列表在「全屏」下同样可保留或收起。
 */
export function EntityEditorShell({
  title,
  onBack,
  listOpen,
  onToggleList,
  list,
  editor,
  headerRight,
  children,
}: EntityEditorShellProps) {
  const { width: listWidth, startDrag: startListDrag, reset: resetListWidth } = useListWidth()

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {listOpen ? (
        <aside
          className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-line"
          style={{ width: listWidth }}
        >
          {list}
          <ListWidthResizer onDragStart={startListDrag} onReset={resetListWidth} />
        </aside>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 顶栏覆盖在滚动内容上（z-30），backdrop-blur 才有内容可模糊；内容在滚动容器内用 h-12 spacer 让出位置 */}
        <div className="absolute inset-x-0 top-0 z-30 flex h-12 shrink-0 items-center border-b border-line bg-paper/85 px-3 backdrop-blur-lg">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!listOpen ? (
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
              <button type="button" onClick={onBack} className={ICON_BTN_MD} aria-label="返回">
                <ArrowLeft size={16} strokeWidth={2} />
              </button>
            ) : null}
            <h2 className="truncate text-base font-medium text-ink">{title}</h2>
          </div>

          <div
            className="flex min-w-0 flex-none items-center justify-center"
            style={{ width: 'min(640px, 60%)' }}
          >
            {editor ? <EditorToolbar editor={editor} embedded /> : null}
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">{headerRight}</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
