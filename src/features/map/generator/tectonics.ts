import type { WorldMapParams } from '../types'
import { SimplexNoise2D, clamp, fbm, mulberry32, smoothstep } from './noise'

export interface Plate {
  x: number
  y: number
  vx: number
  vy: number
  oceanic: boolean
  base: number
}

export interface TectonicField {
  width: number
  height: number
  plates: Plate[]
  /** 0..1，距离板块边界越近越高 */
  boundary: Float32Array
  /** -1..1，正值为汇聚，负值为离散 */
  convergence: Float32Array
  /** 该格所属板块的基准高度 */
  plateBase: Float32Array
  /** 该格是否属于海洋板块 */
  oceanic: Uint8Array
}

function createPlates(seed: number, count: number): Plate[] {
  const random = mulberry32(seed ^ 0x3c6ef372)
  const plates: Plate[] = []
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2
    const speed = 0.45 + random() * 0.85
    const oceanic = random() < 0.54
    plates.push({
      x: 0.06 + random() * 0.88,
      y: 0.06 + random() * 0.88,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      oceanic,
      base: (oceanic ? -0.32 : 0.18) + (random() - 0.5) * 0.16,
    })
  }
  return plates
}

/**
 * 简化板块构造：
 * - 每个板块有大陆/海洋属性与运动速度；
 * - Voronoi 最近/次近种子得到板块边界；
 * - 两侧速度在边界法线上的差给出汇聚/离散分量；
 * - 后面的高程场只在汇聚边界抬升山脉/高原。
 */
export function generateTectonics(
  seed: number,
  params: WorldMapParams,
  onProgress?: (stage: string, value: number) => void,
): TectonicField {
  const width = params.width
  const height = params.height
  const cells = width * height
  const plateCount = 9 + Math.floor(mulberry32(seed ^ 0x85ebca6b)() * 5)
  const plates = createPlates(seed, plateCount)
  const boundary = new Float32Array(cells)
  const convergence = new Float32Array(cells)
  const plateBase = new Float32Array(cells)
  const oceanic = new Uint8Array(cells)
  const boundaryWidth = 0.045
  const noise = new SimplexNoise2D(seed ^ 0x1b873593)
  const aspect = width / height

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height
    const row = y * width
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / height
      // 扭曲 Voronoi 边界，避免出现不自然的直线板块接缝。
      const warpU = fbm(noise, u * 2.3 + 4.2, v * 2.3 - 1.7, 3) * 0.055
      const warpV = fbm(noise, u * 2.3 - 7.1, v * 2.3 + 3.8, 3) * 0.055
      const uu = u + warpU
      const vv = v + warpV

      let d1 = Infinity
      let d2 = Infinity
      let i1 = 0
      let i2 = 0
      for (let p = 0; p < plates.length; p++) {
        const plate = plates[p]
        const dx = uu - plate.x * aspect
        const dy = vv - plate.y
        const d = dx * dx + dy * dy
        if (d < d1) {
          d2 = d1
          i2 = i1
          d1 = d
          i1 = p
        } else if (d < d2) {
          d2 = d
          i2 = p
        }
      }

      const dist1 = Math.sqrt(d1)
      const dist2 = Math.sqrt(d2)
      const dist = dist2 - dist1
      const idx = row + x
      const near = plates[i1]
      const far = plates[i2]

      // 边界处混合两个板块的基准高度，内部回到本板块高度。
      const blend = smoothstep(0, 0.05, dist)
      plateBase[idx] = near.base * (0.55 + 0.45 * blend) + far.base * 0.45 * (1 - blend)
      oceanic[idx] = near.oceanic ? 1 : 0

      const b = Math.exp(-(dist * dist) / (boundaryWidth * boundaryWidth))
      boundary[idx] = b
      if (b > 0.02) {
        const nx = (far.x - near.x) * aspect
        const ny = far.y - near.y
        const len = Math.sqrt(nx * nx + ny * ny) || 1
        const ux = nx / len
        const uy = ny / len
        // 两块板块在边界法线上的相对速度：正值为相互挤压。
        const rel = (near.vx - far.vx) * ux + (near.vy - far.vy) * uy
        convergence[idx] = clamp(rel, -1.2, 1.2)
      }
    }
    if ((y & 127) === 0) {
      onProgress?.('计算板块边界', 0.04 + (y / height) * 0.08)
    }
  }

  return { width, height, plates, boundary, convergence, plateBase, oceanic }
}
