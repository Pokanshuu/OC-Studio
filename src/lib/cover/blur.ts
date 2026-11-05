/**
 * 渐进模糊 —— 参考实现里那段 Rust/WASM 核的 JS 移植（同一套数）。
 *
 * 每一行的模糊半径按 smoothstep 递增，所以不会出现一层一层的遮罩边：
 *
 *   r(y) = radius · 0.46 · smoothstep((y − start) / (H − start))
 *
 * 三次「水平可变半径 + 垂直可变半径」的可分离盒式卷积（前缀和实现，O(像素)），
 * 卷积完成后按行衰减 Alpha，照片就融进色块里了。
 *
 * 纯函数、不碰 DOM：`scripts/cover-check.ts` 直接拿它做断言。
 */

/** 参考实现固定的折减系数：滑杆上限 64px，实际最大半径只有 64 × 0.46 */
const RADIUS_SCALE = 0.46
const PASSES = 3

export interface ProgressiveBlurParams {
  /** 这段像素（RGBA，长度 = width × rows × 4）—— 只传需要模糊的那一段 */
  data: Uint8ClampedArray
  width: number
  rows: number
  /** 这段第一行在整张照片里的行号（半径按整张照片的坐标递增） */
  firstRow: number
  /** 整张照片的高度 */
  fullHeight: number
  /** 模糊强度（画布像素；内部再乘 0.46） */
  radius: number
  /** 从这个比例（整张照片高度比）开始照片逐渐透明 */
  fadeStart: number
}

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}

/**
 * 返回这段像素模糊后的副本（不修改入参）。
 * 小于 0.5px 的行半径按 0 处理 —— 免得前景出现一层没必要的柔化。
 */
export function progressiveBlur(params: ProgressiveBlurParams): Uint8ClampedArray<ArrayBuffer> {
  const { data, width, rows, firstRow, fullHeight, radius, fadeStart } = params
  const size = width * rows * 4
  const source = new Uint8ClampedArray(size)
  source.set(data.subarray(0, size))
  if (width <= 0 || rows <= 0) return source

  const span = fullHeight - firstRow
  const radiusAt = (row: number): number => {
    if (radius <= 0 || span <= 0) return 0
    const r = radius * RADIUS_SCALE * smoothstep((row - firstRow) / span)
    return r < 0.5 ? 0 : Math.round(r)
  }

  const target = new Uint8ClampedArray(size)
  const prefixR = new Int32Array(Math.max(width, rows) + 1)
  const prefixG = new Int32Array(Math.max(width, rows) + 1)
  const prefixB = new Int32Array(Math.max(width, rows) + 1)

  const horizontal = (from: Uint8ClampedArray, to: Uint8ClampedArray): void => {
    const last = width - 1
    for (let y = 0; y < rows; y += 1) {
      const rowOffset = y * width * 4
      const r = radiusAt(firstRow + y)
      if (r <= 0) {
        to.set(from.subarray(rowOffset, rowOffset + width * 4), rowOffset)
        continue
      }
      prefixR[0] = 0
      prefixG[0] = 0
      prefixB[0] = 0
      for (let x = 0; x < width; x += 1) {
        const i = rowOffset + x * 4
        prefixR[x + 1] = prefixR[x] + from[i]
        prefixG[x + 1] = prefixG[x] + from[i + 1]
        prefixB[x + 1] = prefixB[x] + from[i + 2]
      }
      const windowSize = r * 2 + 1
      for (let x = 0; x < width; x += 1) {
        const i = rowOffset + x * 4
        const left = x - r
        const right = x + r
        const lc = left < 0 ? 0 : left
        const rc = right > last ? last : right
        let sr = prefixR[rc + 1] - prefixR[lc]
        let sg = prefixG[rc + 1] - prefixG[lc]
        let sb = prefixB[rc + 1] - prefixB[lc]
        // 出界部分按边缘像素延展（否则图片左右会变暗）
        if (left < 0) {
          sr += -left * from[rowOffset]
          sg += -left * from[rowOffset + 1]
          sb += -left * from[rowOffset + 2]
        }
        if (right > last) {
          const edge = right - last
          const e = rowOffset + last * 4
          sr += edge * from[e]
          sg += edge * from[e + 1]
          sb += edge * from[e + 2]
        }
        to[i] = sr / windowSize
        to[i + 1] = sg / windowSize
        to[i + 2] = sb / windowSize
        to[i + 3] = 255
      }
    }
  }

  const vertical = (from: Uint8ClampedArray, to: Uint8ClampedArray): void => {
    const last = rows - 1
    for (let x = 0; x < width; x += 1) {
      const column = x * 4
      prefixR[0] = 0
      prefixG[0] = 0
      prefixB[0] = 0
      for (let y = 0; y < rows; y += 1) {
        const i = y * width * 4 + column
        prefixR[y + 1] = prefixR[y] + from[i]
        prefixG[y + 1] = prefixG[y] + from[i + 1]
        prefixB[y + 1] = prefixB[y] + from[i + 2]
      }
      for (let y = 0; y < rows; y += 1) {
        const i = y * width * 4 + column
        const r = radiusAt(firstRow + y)
        if (r <= 0) {
          to[i] = from[i]
          to[i + 1] = from[i + 1]
          to[i + 2] = from[i + 2]
          to[i + 3] = 255
          continue
        }
        const top = y - r
        const bottom = y + r
        const tc = top < 0 ? 0 : top
        const bc = bottom > last ? last : bottom
        let sr = prefixR[bc + 1] - prefixR[tc]
        let sg = prefixG[bc + 1] - prefixG[tc]
        let sb = prefixB[bc + 1] - prefixB[tc]
        if (top < 0) {
          sr += -top * from[column]
          sg += -top * from[column + 1]
          sb += -top * from[column + 2]
        }
        if (bottom > last) {
          const edge = bottom - last
          const e = last * width * 4 + column
          sr += edge * from[e]
          sg += edge * from[e + 1]
          sb += edge * from[e + 2]
        }
        const windowSize = r * 2 + 1
        to[i] = sr / windowSize
        to[i + 1] = sg / windowSize
        to[i + 2] = sb / windowSize
        to[i + 3] = 255
      }
    }
  }

  const current = source
  const scratch = target
  for (let pass = 0; pass < PASSES; pass += 1) {
    horizontal(current, scratch)
    vertical(scratch, current)
  }

  // 按行衰减 Alpha：从 `fadeStart`（照片高度比）起逐渐消失，溶进铺满整张卡片的色块。
  // 这个起点由 `scene.ts` 按**卡片高度**算，宽幅照片也能拿到同样厚的溶解带。
  const fade = fadeStart < 0 ? 0 : fadeStart > 1 ? 1 : fadeStart
  const fadeSpan = 1 - fade
  if (fadeSpan > 0) {
    for (let y = 0; y < rows; y += 1) {
      const t = ((firstRow + y) / fullHeight - fade) / fadeSpan
      if (t <= 0) continue
      const alpha = Math.round((1 - smoothstep(t)) * 255)
      const rowOffset = y * width * 4
      for (let x = 0; x < width; x += 1) {
        current[rowOffset + x * 4 + 3] = alpha
      }
    }
  }

  return current
}
