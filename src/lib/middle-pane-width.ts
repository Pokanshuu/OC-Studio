export const MIDDLE_PANE_STORAGE_KEY = 'oc-editor-middle-width'
export const MIDDLE_PANE_MIN = 280
export const MIDDLE_PANE_DEFAULT = 420

export function clampMiddlePaneWidth(width: number, max: number): number {
  const upper = Math.max(MIDDLE_PANE_MIN, Math.round(max))
  return Math.min(Math.max(MIDDLE_PANE_MIN, Math.round(width)), upper)
}

export function readMiddlePaneWidth(): number {
  if (typeof window === 'undefined') return MIDDLE_PANE_DEFAULT
  try {
    const value = Number(window.localStorage.getItem(MIDDLE_PANE_STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : MIDDLE_PANE_DEFAULT
  } catch {
    return MIDDLE_PANE_DEFAULT
  }
}
