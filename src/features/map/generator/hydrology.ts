import type { WorldMapParams } from '../types'
import type { TerrainData } from './terrain'
import { clamp } from './noise'

class MinHeap {
  private indices: Int32Array
  private keys: Float32Array
  private capacity: number
  size = 0
  lastKey = 0

  constructor(capacity: number) {
    this.capacity = Math.max(16, capacity)
    this.indices = new Int32Array(this.capacity)
    this.keys = new Float32Array(this.capacity)
  }

  private grow(): void {
    this.capacity *= 2
    const indices = new Int32Array(this.capacity)
    const keys = new Float32Array(this.capacity)
    indices.set(this.indices)
    keys.set(this.keys)
    this.indices = indices
    this.keys = keys
  }

  push(index: number, key: number): void {
    if (this.size >= this.capacity) this.grow()
    let i = this.size++
    this.indices[i] = index
    this.keys[i] = key
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= this.keys[i]) break
      this.swap(parent, i)
      i = parent
    }
  }

  pop(): number {
    if (this.size === 0) return -1
    const top = this.indices[0]
    this.lastKey = this.keys[0]
    this.size--
    if (this.size > 0) {
      this.indices[0] = this.indices[this.size]
      this.keys[0] = this.keys[this.size]
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < this.size && this.keys[left] < this.keys[smallest]) smallest = left
        if (right < this.size && this.keys[right] < this.keys[smallest]) smallest = right
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const index = this.indices[a]
    this.indices[a] = this.indices[b]
    this.indices[b] = index
    const key = this.keys[a]
    this.keys[a] = this.keys[b]
    this.keys[b] = key
  }
}

export interface RiverSegment {
  ax: number
  ay: number
  bx: number
  by: number
  width: number
  flow: number
}

export interface HydrologyData {
  flow: Float32Array
  water: Uint8Array
  riverMask: Uint8Array
  lakeMask: Uint8Array
  /** 湖面到湖底的深度（米），用于湖内等深线。 */
  lakeDepth: Float32Array
  /** 河流中心线；渲染不再依赖圆形 stamp。 */
  riverSegments: RiverSegment[]
  riverCells: number
  lakeCells: number
  lakeCount: number
}

const NEIGHBORS_4: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const NEIGHBORS_8: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

export function generateHydrology(
  terrain: TerrainData,
  params: WorldMapParams,
  onProgress?: (stage: string, value: number) => void,
): HydrologyData {
  const riverDensity = clamp(params.riverDensity, 0, 1)
  const lakeDensity = clamp(params.lakeDensity, 0, 1)
  const { width, height, elevation } = terrain
  const cells = width * height
  const ocean = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) ocean[i] = elevation[i] <= 0 ? 1 : 0

  // Priority-Flood：从海岸线向内淹没，填平洼地并记录溢流路径。
  onProgress?.('填平内陆洼地', 0.32)
  const filled = new Float32Array(cells)
  const parent = new Int32Array(cells)
  const order = new Int32Array(cells)
  const orderIndex = new Int32Array(cells)
  const closed = new Uint8Array(cells)
  const seeded = new Uint8Array(cells)
  filled.set(elevation)
  parent.fill(-1)
  orderIndex.fill(-1)

  const heap = new MinHeap(Math.max(1024, Math.round(cells * 0.06)))
  const seedCount = (): void => {
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        const i = row + x
        if (ocean[i] || seeded[i]) continue
        let coastal = x === 0 || y === 0 || x === width - 1 || y === height - 1
        if (!coastal) {
          for (const [dx, dy] of NEIGHBORS_4) {
            if (ocean[(y + dy) * width + (x + dx)]) {
              coastal = true
              break
            }
          }
        }
        if (coastal) {
          seeded[i] = 1
          filled[i] = elevation[i]
          heap.push(i, filled[i])
        }
      }
    }
  }
  seedCount()

  let orderLength = 0
  let popped = 0
  while (heap.size > 0) {
    const current = heap.pop()
    if (current < 0) break
    if (closed[current]) continue
    closed[current] = 1
    order[orderLength] = current
    orderIndex[current] = orderLength
    orderLength++
    popped++
    if ((popped & 32767) === 0) {
      onProgress?.('填平内陆洼地', 0.32 + (popped / cells) * 0.09)
    }

    const cx = current % width
    const cy = (current / width) | 0
    const base = filled[current]

    for (let n = 0; n < 4; n++) {
      const dx = NEIGHBORS_4[n][0]
      const dy = NEIGHBORS_4[n][1]
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (ocean[ni] || closed[ni]) continue
      const spill = Math.max(elevation[ni], base + 0.05)
      if (spill < filled[ni] - 0.001) {
        filled[ni] = spill
        parent[ni] = current
        heap.push(ni, spill)
      } else if (parent[ni] < 0) {
        filled[ni] = spill
        parent[ni] = current
        heap.push(ni, spill)
      }
    }
  }

  onProgress?.('计算流向', 0.43)
  const downstream = new Int32Array(cells)
  downstream.fill(-1)
  for (let i = 0; i < cells; i++) {
    if (ocean[i]) continue
    const x = i % width
    const y = (i / width) | 0
    let best = -1
    const inDepression = filled[i] - elevation[i] > 0.2
    // 普通坡面按真实高程找下坡，只有洼地内部才按蓄水面找出口；
    // 否则 Priority-Flood 的等高程面会让河流在平地上乱拐。
    let bestFill = (inDepression ? filled[i] : elevation[i]) - 0.02
    let bestIndex = 1e9

    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (ocean[ni]) {
        // 海岸直接入海，优先选择最低的海面邻格。
        const score = elevation[ni]
        if (best < 0 || orderIndex[ni] < bestIndex || score < elevation[best]) {
          best = ni
          bestIndex = -1
        }
        continue
      }
      const f = inDepression ? filled[ni] : elevation[ni]
      const niOrder = orderIndex[ni]
      if (f < bestFill || (Math.abs(f - bestFill) <= 0.02 && niOrder >= 0 && niOrder < bestIndex)) {
        best = ni
        bestFill = f
        bestIndex = niOrder
      }
    }

    if (best < 0 || (!ocean[best] && bestIndex > orderIndex[i] && orderIndex[i] >= 0)) {
      const fallback = parent[i]
      if (fallback >= 0) best = fallback
    }
    downstream[i] = best
  }

  onProgress?.('汇流与河道', 0.48)
  const flow = new Float32Array(cells)
  for (let i = 0; i < cells; i++) {
    if (!ocean[i]) flow[i] = 1
  }
  // 逆着淹没顺序累积，保证下游先完成。
  for (let k = orderLength - 1; k >= 0; k--) {
    const i = order[k]
    const d = downstream[i]
    if (d >= 0 && !ocean[d]) {
      flow[d] += flow[i]
    }
  }

  const water = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) water[i] = ocean[i]

  // 湖泊：填充深度超过阈值、且面积适中的连通洼地。
  onProgress?.('蓄水成湖', 0.53)
  const lakeMask = new Uint8Array(cells)
  const lakeDepth = new Float32Array(cells)
  const lakeVisited = new Uint8Array(cells)
  let stack = new Int32Array(4096)
  let lakeCount = 0
  let lakeCells = 0
  const minLakeArea = Math.max(80, Math.round(cells * clamp(params.lakeMinArea, 0.00001, 0.01)))
  const maxLakeArea = Math.max(
    minLakeArea + 80,
    Math.round(cells * clamp(params.lakeMaxArea, 0.0005, 0.05)),
  )
  // 湖泊密度越高，允许更浅的洼地成湖；但仍要求一定水深，避免把平原微洼地画成湖。
  const minLakeDepth = 7 + (1 - lakeDensity) * 8

  for (let start = 0; start < cells; start++) {
    if (ocean[start] || lakeVisited[start]) continue
    if (filled[start] - elevation[start] < 2.5) continue
    let stackSize = 0
    stack[stackSize++] = start
    lakeVisited[start] = 1
    const component: number[] = []
    let maxDepth = 0
    let maxInflow = 0
    let touchesOcean = false
    let maxLakeCellElevation = 0
    while (stackSize > 0) {
      const i = stack[--stackSize]
      component.push(i)
      const depth = filled[i] - elevation[i]
      if (depth > maxDepth) maxDepth = depth
      if (flow[i] > maxInflow) maxInflow = flow[i]
      if (elevation[i] > maxLakeCellElevation) maxLakeCellElevation = elevation[i]
      const x = i % width
      const y = (i / width) | 0
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const ni = ny * width + nx
        if (ocean[ni]) {
          touchesOcean = true
          continue
        }
        if (lakeVisited[ni]) continue
        if (filled[ni] - elevation[ni] < 2.5) continue
        lakeVisited[ni] = 1
        if (stackSize >= stack.length) {
          const next = new Int32Array(stack.length * 2)
          next.set(stack)
          stack = next
        }
        stack[stackSize++] = ni
      }
    }
    if (
      !touchesOcean &&
      component.length >= minLakeArea &&
      component.length <= maxLakeArea &&
      maxDepth >= minLakeDepth &&
      // 没有汇水补给的孤立洼地很容易变成“随机水坑”，不作为湖泊渲染。
      maxInflow >= Math.max(60, minLakeArea * 0.5) &&
      // 极高海拔的随机洼地多为噪声坑；保留少量真正的高原湖。
      maxLakeCellElevation < 2200
    ) {
      lakeCount++
      for (const i of component) {
        lakeMask[i] = 1
        lakeDepth[i] = Math.max(0, filled[i] - elevation[i])
        water[i] = 2
      }
      lakeCells += component.length
    }
  }
  // stack 是 let，允许扩容；这里重新绑定后不再使用。
  void stack

  onProgress?.('绘制河网', 0.57)
  const riverMask = new Uint8Array(cells)
  // 密度越高，成为河道所需的汇水面积越小。
  const threshold = Math.max(
    240,
    Math.round(cells * (0.0008 + (1 - clamp(riverDensity, 0, 1)) * 0.0008)),
  )
  let riverCells = 0
  const riverSegments: RiverSegment[] = []

  const stamp = (px: number, py: number, radius: number, strength: number): void => {
    const r = Math.ceil(radius)
    for (let dy = -r; dy <= r; dy++) {
      const y = py + dy
      if (y < 0 || y >= height) continue
      for (let dx = -r; dx <= r; dx++) {
        const x = px + dx
        if (x < 0 || x >= width) continue
        if (dx * dx + dy * dy > radius * radius + 0.4) continue
        const i = y * width + x
        const value = Math.round(clamp(strength * (1 - Math.sqrt(dx * dx + dy * dy) / (radius + 0.9)), 0, 255))
        if (value > riverMask[i]) riverMask[i] = value
        if (ocean[i] === 0 && lakeMask[i] === 0) {
          water[i] = water[i] === 2 ? 2 : 3
        }
      }
    }
  }

  for (let i = 0; i < cells; i++) {
    if (ocean[i] || lakeMask[i]) continue
    if (flow[i] < threshold) continue
    const ratio = flow[i] / threshold
    const radius = clamp(0.68 + Math.log2(ratio + 1) * 1.05, 1.0, 6.2)
    const x = i % width
    const y = (i / width) | 0
    stamp(x, y, radius, 225)
    riverCells++

    // 中心线：沿 downstream 连接一格，渲染时按流量画平滑折线，而不是把整条河刷成圆斑。
    const d = downstream[i]
    if (d >= 0) {
      riverSegments.push({
        ax: x + 0.5,
        ay: y + 0.5,
        bx: (d % width) + 0.5,
        by: ((d / width) | 0) + 0.5,
        width: clamp(0.7 + Math.log2(ratio + 1) * 0.55, 0.7, 3.2),
        flow: flow[i],
      })
    }
  }
  riverSegments.sort((a, b) => a.flow - b.flow)

  // 三角洲：入海口分出数条短支流，让河流不是突然断在海里。
  for (let i = 0; i < cells; i++) {
    if (ocean[i] || lakeMask[i]) continue
    if (flow[i] < threshold * 3.5) continue
    const d = downstream[i]
    if (d < 0 || !ocean[d]) continue
    const x = i % width
    const y = (i / width) | 0
    const dx = (d % width) - x
    const dy = ((d / width) | 0) - y
    const angle = Math.atan2(dy, dx)
    const length = 7 + Math.min(14, Math.log2(flow[i] / threshold + 1) * 3)
    for (const offset of [-0.62, -0.3, 0, 0.3, 0.62]) {
      const a = angle + offset
      for (let step = 1; step <= length; step++) {
        const px = Math.round(x + Math.cos(a) * step)
        const py = Math.round(y + Math.sin(a) * step)
        if (px < 0 || py < 0 || px >= width || py >= height) break
        const pi = py * width + px
        if (!ocean[pi]) continue
        const value = Math.round(150 * (1 - step / (length + 2)))
        if (value > riverMask[pi]) riverMask[pi] = value
      }
    }
  }

  return {
    flow,
    water,
    riverMask,
    lakeMask,
    lakeDepth,
    riverSegments,
    riverCells,
    lakeCells,
    lakeCount,
  }
}
