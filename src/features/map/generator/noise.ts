/**
 * 可复现的 2D Simplex 噪声与分形工具。
 *
 * 所有随机性都来自 seed，坐标偏移不依赖时间；同一 seed / 参数
 * 在任何浏览器中都会得到同一张地图（浮点误差远小于 1 米）。
 */

export function hashSeed(seed: number): number {
  let h = seed >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function random(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const GRAD = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

export class SimplexNoise2D {
  private readonly perm = new Uint8Array(512)
  private readonly permMod8 = new Uint8Array(512)

  constructor(seed: number) {
    const random = mulberry32(hashSeed(seed))
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const tmp = p[i]
      p[i] = p[j]
      p[j] = tmp
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
      this.permMod8[i] = this.perm[i] % 8
    }
  }

  noise(xin: number, yin: number): number {
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)

    let i1: number
    let j1: number
    if (x0 > y0) {
      i1 = 1
      j1 = 0
    } else {
      i1 = 0
      j1 = 1
    }

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    const ii = i & 255
    const jj = j & 255
    let n = 0

    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const g = GRAD[this.permMod8[ii + this.perm[jj]]]
      t0 *= t0
      n += t0 * t0 * (g[0] * x0 + g[1] * y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const g = GRAD[this.permMod8[ii + i1 + this.perm[jj + j1]]]
      t1 *= t1
      n += t1 * t1 * (g[0] * x1 + g[1] * y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const g = GRAD[this.permMod8[ii + 1 + this.perm[jj + 1]]]
      t2 *= t2
      n += t2 * t2 * (g[0] * x2 + g[1] * y2)
    }

    return 70 * n
  }
}

export function fbm(
  noise: SimplexNoise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let frequency = 1
  let amplitude = 1
  let sum = 0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise.noise(x * frequency, y * frequency)
    norm += amplitude
    frequency *= lacunarity
    amplitude *= gain
  }
  return sum / norm
}

/** Ridged multifractal：脊状噪声，用于山脊细节，返回 0..1。 */
export function ridgedFbm(
  noise: SimplexNoise2D,
  x: number,
  y: number,
  octaves: number,
  lacunarity = 2.1,
  gain = 0.52,
): number {
  let frequency = 1
  let amplitude = 1
  let sum = 0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise.noise(x * frequency, y * frequency))
    sum += amplitude * n * n
    norm += amplitude
    frequency *= lacunarity
    amplitude *= gain
  }
  return clamp(sum / norm, 0, 1)
}

export interface Point {
  x: number
  y: number
}

/** 点到折线的最短距离（像素）。 */
export function distanceToPolyline(px: number, py: number, points: Point[]): number {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const wx = px - a.x
    const wy = py - a.y
    const len2 = vx * vx + vy * vy
    let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0
    t = clamp(t, 0, 1)
    const dx = px - (a.x + vx * t)
    const dy = py - (a.y + vy * t)
    const d = dx * dx + dy * dy
    if (d < best) best = d
  }
  return Math.sqrt(best)
}
