/** 编辑界面样式：多栏 / 全屏（原本的单栏）/ 自动。 */
export type EditorLayout = 'multi' | 'full' | 'auto'

export const EDITOR_LAYOUT_OPTIONS = [
  { value: 'multi', label: '多栏' },
  { value: 'full', label: '全屏' },
  { value: 'auto', label: '自动' },
] as const

/** 「自动」的断点：大窗口分栏，小窗口回原本的单栏。 */
export const EDITOR_LAYOUT_BREAKPOINT = 1280

export function resolveEditorLayout(layout: EditorLayout, width: number): 'multi' | 'full' {
  if (layout === 'multi' || layout === 'full') return layout
  return width >= EDITOR_LAYOUT_BREAKPOINT ? 'multi' : 'full'
}
