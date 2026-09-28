'use client'

import { createPortal } from 'react-dom'
import { useDevice } from '@/lib/use-device'
import { useActiveEditor } from '@/lib/editor-context'
import { useKeyboard } from '@/lib/KeyboardContext'
import { MobileActionSheet } from '../MobileActionSheet'
import type { ActionItem } from '../MobileActionSheet'
import { safeGetEditorDom } from './clipboard'
import { useMobileSelectionState } from './useMobileSelectionState'
import { useMobileSelectionEvents } from './useMobileSelectionEvents'
import { useMobileSelectionActions } from './useMobileSelectionActions'

/**
 * 移动端选词工具栏：跟随系统选词/光标弹出「剪切 复制 粘贴 全选」，
 * 在编辑器内追加动作面板入口（插入图片/表格/链接/代码块/分割线，表格内为行列操作）。
 *
 * 分层：`mobile-text-selection/`
 *   constants  常量与状态/事件类型
 *   geometry   可编辑判定 + 锚点测量 + 选区解析（纯函数）
 *   clipboard  剪贴板读取 + 编辑器 DOM 兜底
 *   useMobileSelectionState    状态机（模式/位置/显隐 + dispatch）
 *   useMobileSelectionEvents   事件源（focusin/selectionchange/长按/滚动…）
 *   useMobileSelectionActions  动作（剪切/复制/粘贴/全选 + 面板条目）
 */
export function MobileTextSelectionBar() {
  const { isMobile } = useDevice()
  const { activeEditor } = useActiveEditor()
  const keyboard = useKeyboard()

  const ctx = useMobileSelectionState(activeEditor)
  useMobileSelectionEvents(ctx, activeEditor, isMobile, keyboard.visible)
  const actions = useMobileSelectionActions(ctx, activeEditor)

  const { mode, position, mounted, barVisible, inTable, barRef, editableRef, dispatch } = ctx

  const hasSelection = mode === 'selection' || mode === 'dragging'

  const moreActions: ActionItem[] = inTable
    ? (hasSelection ? [...actions.clipboardActions, ...actions.tableActions] : actions.tableActions)
    : (hasSelection ? actions.clipboardActions : actions.insertActions)

  if (!isMobile || !mounted) return null

  return createPortal(
    <>
      <div
        ref={barRef}
        className="pointer-events-auto fixed z-50 flex items-center border border-line bg-paper/85 px-1.5 py-1 gap-0.5 backdrop-blur-lg cursor-default"
        style={{
          left: position.x,
          top: position.y,
          transform: `translate(-50%, ${barVisible ? 0 : 8}px)`,
          opacity: barVisible ? 1 : 0,
          transition: 'opacity 200ms, transform 200ms',
        }}
      >
        {hasSelection ? (
          <>
            <button onClick={actions.handleCut} className="whitespace-nowrap px-3 py-1.5 text-sm text-ink transition-colors active:bg-[var(--oc-hover)]">
              剪切
            </button>
            <button onClick={actions.handleCopy} className="whitespace-nowrap px-3 py-1.5 text-sm text-ink transition-colors active:bg-[var(--oc-hover)]">
              复制
            </button>
            <button onClick={actions.handlePaste} className="whitespace-nowrap px-3 py-1.5 text-sm text-ink transition-colors active:bg-[var(--oc-hover)]">
              粘贴
            </button>
            <button onClick={actions.handleSelectAll} className="whitespace-nowrap px-3 py-1.5 text-sm text-ink transition-colors active:bg-[var(--oc-hover)]">
              全选
            </button>
          </>
        ) : (
          <>
            <button onClick={actions.handlePaste} className="whitespace-nowrap px-3 py-1.5 text-sm text-ink transition-colors active:bg-[var(--oc-hover)]">
              粘贴
            </button>
            <button onClick={actions.handleSelectAll} className="whitespace-nowrap px-3 py-1.5 text-sm text-ink transition-colors active:bg-[var(--oc-hover)]">
              全选
            </button>
            {editableRef.current === safeGetEditorDom(activeEditor) && (
              <>
                <span className="w-px h-4 bg-line mx-0.5" />
                <button
                  onClick={() => dispatch({ type: 'ACTION_OPEN' })}
                  className="flex h-8 w-8 items-center justify-center transition-colors active:bg-[var(--oc-hover)]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-ink">
                    <circle cx="4" cy="8" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="12" cy="8" r="1.5" />
                  </svg>
                </button>
              </>
            )}
          </>
        )}
      </div>

      <MobileActionSheet
        open={mode === 'action-sheet'}
        onClose={() => dispatch({ type: 'ACTION_CLOSE' })}
        actions={moreActions}
      />
    </>,
    document.getElementById('overlay-root')!,
  )
}

