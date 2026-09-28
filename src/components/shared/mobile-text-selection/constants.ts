/** 移动端选词工具栏的布局与节流常量 */

export const TOOLBAR_H = 40
export const GAP = 12
export const FLIP_ZONE = 100
export const SEL_NOISE_GATE = 40
export const SEL_DEBOUNCE = 120
export const FOCUS_LOCK_MS = 250

export const NON_TEXT_INPUT_TYPES = ['radio', 'checkbox', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color']

export type State = 'idle' | 'caret' | 'selection' | 'dragging' | 'action-sheet'

export type EditorEvent =
  | { type: 'FOCUS_IN'; collapsed: boolean }
  | { type: 'FOCUS_OUT' }
  | { type: 'SEL_CHANGE' }
  | { type: 'LONG_PRESS'; collapsed: boolean }
  | { type: 'ACTION_OPEN' }
  | { type: 'ACTION_CLOSE' }
  | { type: 'DISMISS' }
