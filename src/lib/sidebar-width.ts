/**
 * 侧边栏宽度（唯一源）。
 *
 * 用户可以拖动侧栏右边缘调整宽度，范围是默认值的 0.8–1.2 倍（112–168px），
 * 默认 140px。偏好存在 settings 里（localStorage），重新加载后保持。
 */
export const DEFAULT_SIDEBAR_WIDTH = 140
export const SIDEBAR_MIN_WIDTH = Math.round(DEFAULT_SIDEBAR_WIDTH * 0.8)
export const SIDEBAR_MAX_WIDTH = Math.round(DEFAULT_SIDEBAR_WIDTH * 1.2)

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))
}
