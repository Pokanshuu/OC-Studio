/**
 * 封面取景的**几何唯一源**：遮罩固定，图片在里头平移 / 缩放。
 *
 * 取景只有三个数：`zoom`（1–3 倍）、`x` / `y`（0–100，等价于 CSS 的 `object-position`）。
 * 图片先按 `object-fit: cover` 铺满「放大后的框」，再用 `object-position` 挑出要看的那块 ——
 * 所以这里算的就是「框比图小多少」（可移动余量）与「拖 N 个画布像素该挪几个百分点」。
 *
 * 纯函数放在这里，`PosterCover` 只负责事件；`scripts/export-check.ts` 直接测这张表。
 */
import { POSTER_COVER_POSITION_CENTER, POSTER_COVER_ZOOM_MAX, POSTER_COVER_ZOOM_MIN } from './types'

export interface CoverFrame {
  /** 图片在遮罩里的缩放（1 = 刚好铺满） */
  zoom: number
  /** 取景中心：0 = 看图片左边，100 = 看右边 */
  x: number
  /** 取景中心：0 = 看上缘，100 = 看下缘 */
  y: number
}

export interface CoverBox {
  /** 遮罩尺寸（画布 px，不含缩放倍率） */
  width: number
  height: number
  /** 图片原始尺寸 */
  naturalWidth: number
  naturalHeight: number
}

export function clampCoverZoom(value: number): number {
  if (!Number.isFinite(value)) return POSTER_COVER_ZOOM_MIN
  return Math.min(POSTER_COVER_ZOOM_MAX, Math.max(POSTER_COVER_ZOOM_MIN, value))
}

export function clampCoverPosition(value: number): number {
  if (!Number.isFinite(value)) return POSTER_COVER_POSITION_CENTER
  return Math.min(100, Math.max(0, value))
}

/**
 * 图片在某轴上的**可移动余量**（画布 px）。
 * 余量为 0 表示这条轴已经严丝合缝 —— 拖也拖不动，只能先放大。
 */
export function coverOverflow(frame: CoverFrame, box: CoverBox): { x: number; y: number } {
  const zoom = clampCoverZoom(frame.zoom)
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 }

  // 图还没解码时按倍率兜底：拖动仍然跟手，只是范围估算
  if (box.naturalWidth <= 0 || box.naturalHeight <= 0) {
    return { x: box.width * (zoom - 1), y: box.height * (zoom - 1) }
  }

  // object-fit: cover 在「放大后的框」里铺图
  const frameWidth = box.width * zoom
  const frameHeight = box.height * zoom
  const scale = Math.max(frameWidth / box.naturalWidth, frameHeight / box.naturalHeight)
  return {
    x: Math.max(0, box.naturalWidth * scale - frameWidth),
    y: Math.max(0, box.naturalHeight * scale - frameHeight),
  }
}

/**
 * 拖动 `dx` / `dy` 画布像素之后的取景。
 *
 * 约定：**图片跟着手走** —— 往右拖，图片右移，于是看到的是更靠左的部分，`x` 变小。
 * 100% 的 `object-position` 正好走完整个余量，所以拖动是 1:1 跟手的。
 */
export function panCover(
  frame: CoverFrame,
  box: CoverBox,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const overflow = coverOverflow(frame, box)
  const nextX = overflow.x > 0.5 ? clampCoverPosition(frame.x - (dx / overflow.x) * 100) : frame.x
  const nextY = overflow.y > 0.5 ? clampCoverPosition(frame.y - (dy / overflow.y) * 100) : frame.y
  return { x: Math.round(nextX * 100) / 100, y: Math.round(nextY * 100) / 100 }
}

/** 滚轮缩放：往上滚（`deltaY < 0`）放大。 */
export function zoomCover(frame: CoverFrame, deltaY: number, sensitivity = 0.0025): number {
  const next = clampCoverZoom(frame.zoom - deltaY * sensitivity)
  return Math.round(next * 100) / 100
}

export const DEFAULT_COVER_FRAME: CoverFrame = {
  zoom: 1,
  x: POSTER_COVER_POSITION_CENTER,
  y: POSTER_COVER_POSITION_CENTER,
}
