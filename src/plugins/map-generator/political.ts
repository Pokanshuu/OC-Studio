import type { MapLayers } from './profile'

export interface PoliticalState {
  id: number
  name: string
  color: string
  capitalX: number
  capitalY: number
  /** 关联的 OC 国家实体；为空时只存在于地图政治层。 */
  countryId?: number
}

export interface PoliticalCity {
  id: number
  stateId: number
  name: string
  x: number
  y: number
  capital?: boolean
  /** 来源设定集词条；便于之后回到设定集编辑。 */
  worldEntryId?: number
}

export interface PoliticalSeed {
  /** 可选的 OC 国家 id；为空表示纯地图国家。 */
  countryId?: number
  name: string
  color?: string
  /** 归一化 0..1 地图坐标。 */
  x: number
  y: number
}

export interface PoliticalRoad {
  id: number
  stateId?: number
  /** 归一化坐标折线。 */
  points: Array<{ x: number; y: number }>
}

export interface PoliticalData {
  cols: number
  rows: number
  /** 0 = 无主，state.id 为归属。 */
  owner: number[]
  states: PoliticalState[]
  cities: PoliticalCity[]
  roads?: PoliticalRoad[]
  /** 用户拖入的国家/地点种子；为空表示程序随机生成。 */
  seeds?: PoliticalSeed[]
}

const STATE_COLORS = [
  '#B36651',
  '#5E8B74',
  '#8B7BA8',
  '#C49A4A',
  '#6A8FA8',
  '#A96C7B',
  '#7F8F54',
  '#A07850',
  '#5C7A78',
  '#9A7B5C',
  '#7A6B8E',
  '#B08A62',
]

const STATE_NAMES = [
  '晨曦',
  '暮色',
  '霜原',
  '赤川',
  '苍海',
  '青岚',
  '金穗',
  '白塔',
  '黑松',
  '长河',
  '云岭',
  '星湾',
]

const CITY_NAMES = ['王城', '港城', '北关', '南陌', '石桥', '风谷', '盐镇', '旧港', '林邑', '高台', '月泉', '铁岭']

function hashText(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function findRoadPath(
  start: number,
  end: number,
  land: Uint8Array,
  elevation: Float32Array,
  cols: number,
  rows: number,
): number[] {
  if (start === end) return [start]
  const total = cols * rows
  const distance = new Float32Array(total).fill(Infinity)
  const previous = new Int32Array(total).fill(-1)
  const visited = new Uint8Array(total)
  const open: Array<{ cell: number; score: number }> = []
  const pushOpen = (cell: number, score: number): void => {
    open.push({ cell, score })
    let index = open.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (open[parent].score <= open[index].score) break
      const swap = open[parent]
      open[parent] = open[index]
      open[index] = swap
      index = parent
    }
  }
  const popOpen = (): { cell: number; score: number } => {
    const first = open[0]
    const last = open.pop()!
    if (open.length > 0) {
      open[0] = last
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < open.length && open[left].score < open[smallest].score) smallest = left
        if (right < open.length && open[right].score < open[smallest].score) smallest = right
        if (smallest === index) break
        const swap = open[smallest]
        open[smallest] = open[index]
        open[index] = swap
        index = smallest
      }
    }
    return first
  }
  pushOpen(start, 0)
  distance[start] = 0
  const heuristic = (cell: number): number => {
    const ax = cell % cols
    const ay = Math.floor(cell / cols)
    const bx = end % cols
    const by = Math.floor(end / cols)
    return Math.abs(ax - bx) + Math.abs(ay - by)
  }

  while (open.length > 0) {
    const current = popOpen()
    if (current.cell === end) break
    if (visited[current.cell]) continue
    visited[current.cell] = 1
    const x = current.cell % cols
    const y = Math.floor(current.cell / cols)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const next = ny * cols + nx
        if (!land[next] || visited[next]) continue
        // 斜向稍贵；爬升与高海拔也增加成本，让道路优先走低地和河谷。
        const step = dx !== 0 && dy !== 0 ? 1.414 : 1
        const climb = Math.max(0, elevation[next] - elevation[current.cell])
        const altitude = Math.max(0, elevation[next] - 0.42)
        const cost = step * (1 + climb * 4 + altitude * 2)
        const nextDistance = distance[current.cell] + cost
        if (nextDistance < distance[next]) {
          distance[next] = nextDistance
          previous[next] = current.cell
          pushOpen(next, nextDistance + heuristic(next) * 0.8)
        }
      }
    }
  }

  if (previous[end] < 0) return [start, end]
  const path: number[] = []
  let cursor = end
  let guard = 0
  while (cursor >= 0 && guard++ < cols * rows) {
    path.push(cursor)
    if (cursor === start) break
    cursor = previous[cursor]
  }
  return path.reverse()
}

/**
 * 从高度/水体层生成一个轻量政治层：
 * - 在陆地上用最远点采样选首都；
 * - 多源 BFS 把连续陆地分给最近首都；
 * - 每个国家生成都城和若干城市；
 * - owner 网格保存为普通 number[]，便于 Dexie/JSON 持久化。
 *
 * 这是 FantCraft/Azgaar 式“地形 → 国家/省/城市”的简化第一层，
 * 城市名和国名可在政治面板里继续编辑。
 */
export function generatePolitical(
  layers: MapLayers,
  seed: number,
  inputSeeds: PoliticalSeed[] = [],
): PoliticalData {
  const cols = 288
  const rows = Math.max(96, Math.round((cols * layers.mapHeight) / layers.width))
  const total = cols * rows
  const land = new Uint8Array(total)
  const elevationGrid = new Float32Array(total)
  const sourceWidth = layers.width
  const sourceHeight = layers.mapHeight

  for (let y = 0; y < rows; y++) {
    const sy = Math.min(sourceHeight - 1, Math.floor(((y + 0.5) / rows) * sourceHeight))
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(sourceWidth - 1, Math.floor(((x + 0.5) / cols) * sourceWidth))
      const index = sy * sourceWidth + sx
      elevationGrid[y * cols + x] = layers.height[index]
      if (layers.height[index] > 0 && layers.water[index] === 0) {
        land[y * cols + x] = 1
      }
    }
  }

  const landCells: number[] = []
  for (let i = 0; i < total; i++) if (land[i]) landCells.push(i)
  if (landCells.length === 0) {
    return { cols, rows, owner: new Array(total).fill(0), states: [], cities: [], seeds: inputSeeds }
  }

  const rng = random(seed)
  const seedX = (index: number): number => index % cols
  const seedY = (index: number): number => Math.floor(index / cols)
  const nearestLand = (cell: number): number => {
    const x = seedX(cell)
    const y = seedY(cell)
    let best = -1
    let bestDistance = Infinity
    for (const candidate of landCells) {
      const dx = seedX(candidate) - x
      const dy = seedY(candidate) - y
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate
      }
    }
    return best
  }

  const seeds: number[] = []
  const seedMeta: Array<{ name: string; color: string; countryId?: number }> = []

  if (inputSeeds.length > 0) {
    // 用户在设定集里拖进来的国家：优先保留落点附近的陆地，海洋落点吸附到最近海岸。
    for (const input of inputSeeds) {
      const gx = Math.max(0, Math.min(cols - 1, Math.floor(input.x * cols)))
      const gy = Math.max(0, Math.min(rows - 1, Math.floor(input.y * rows)))
      let cell = gy * cols + gx
      if (!land[cell]) cell = nearestLand(cell)
      if (cell < 0 || seeds.includes(cell)) continue
      seeds.push(cell)
      seedMeta.push({
        name: input.name,
        color: input.color ?? STATE_COLORS[seedMeta.length % STATE_COLORS.length],
        countryId: input.countryId,
      })
    }
  }

  if (seeds.length === 0) {
    const stateCount = Math.max(3, Math.min(12, Math.round(landCells.length / 95)))
    // 最远点采样：先选一个确定性的起始点，再不断选择离现有首都最远的陆地格。
    const first = landCells[Math.floor(rng() * landCells.length)]
    seeds.push(first)
    seedMeta.push({ name: STATE_NAMES[0], color: STATE_COLORS[0] })
    const minDistance = new Float32Array(total).fill(Infinity)
    for (const cell of landCells) {
      const dx = seedX(cell) - seedX(first)
      const dy = seedY(cell) - seedY(first)
      minDistance[cell] = dx * dx + dy * dy
    }
    while (seeds.length < stateCount) {
      let best = -1
      let bestDistance = -1
      for (const cell of landCells) {
        if (minDistance[cell] > bestDistance) {
          bestDistance = minDistance[cell]
          best = cell
        }
      }
      if (best < 0 || !Number.isFinite(bestDistance)) break
      seeds.push(best)
      seedMeta.push({
        name: STATE_NAMES[seeds.length - 1],
        color: STATE_COLORS[(seeds.length - 1) % STATE_COLORS.length],
      })
      for (const cell of landCells) {
        const dx = seedX(cell) - seedX(best)
        const dy = seedY(cell) - seedY(best)
        const distance = dx * dx + dy * dy
        if (distance < minDistance[cell]) minDistance[cell] = distance
      }
    }
  }

  const owner = new Array<number>(total).fill(0)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0
  for (let stateIndex = 0; stateIndex < seeds.length; stateIndex++) {
    const cell = seeds[stateIndex]
    owner[cell] = stateIndex + 1
    queue[tail++] = cell
  }
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  while (head < tail) {
    const cell = queue[head++]
    const x = cell % cols
    const y = Math.floor(cell / cols)
    for (const [dx, dy] of neighbors) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const next = ny * cols + nx
      if (!land[next] || owner[next] !== 0) continue
      owner[next] = owner[cell]
      queue[tail++] = next
    }
  }

  const states: PoliticalState[] = seeds.map((cell, index) => ({
    id: index + 1,
    name: seedMeta[index]?.name ?? STATE_NAMES[index % STATE_NAMES.length],
    color: seedMeta[index]?.color ?? STATE_COLORS[index % STATE_COLORS.length],
    countryId: seedMeta[index]?.countryId,
    capitalX: (cell % cols) / cols,
    capitalY: Math.floor(cell / cols) / rows,
  }))
  const cities: PoliticalCity[] = []
  let cityId = 1
  for (let index = 0; index < states.length; index++) {
    const state = states[index]
    const capitalCell = seeds[index]
    cities.push({
      id: cityId++,
      stateId: state.id,
      name: `${state.name}城`,
      x: state.capitalX,
      y: state.capitalY,
      capital: true,
    })
    const owned = landCells.filter((cell) => owner[cell] === state.id)
    const extra = Math.min(4, Math.max(0, Math.floor(owned.length / 55)))
    for (let n = 0; n < extra; n++) {
      const cell = owned[Math.floor(rng() * owned.length)]
      if (!cell || cell === capitalCell) continue
      const name = CITY_NAMES[(hashText(state.name) + n + index) % CITY_NAMES.length]
      if (cities.some((city) => city.stateId === state.id && city.name === name)) continue
      cities.push({
        id: cityId++,
        stateId: state.id,
        name,
        x: (cell % cols) / cols,
        y: Math.floor(cell / cols) / rows,
      })
    }
  }

  const roads: PoliticalRoad[] = []
  let roadId = 1
  for (const state of states) {
    const capital = cities.find((city) => city.stateId === state.id && city.capital)
    if (!capital) continue
    const startCell =
      Math.max(0, Math.min(rows - 1, Math.floor(capital.y * rows))) * cols +
      Math.max(0, Math.min(cols - 1, Math.floor(capital.x * cols)))
    for (const city of cities.filter((item) => item.stateId === state.id && !item.capital)) {
      const endCell =
        Math.max(0, Math.min(rows - 1, Math.floor(city.y * rows))) * cols +
        Math.max(0, Math.min(cols - 1, Math.floor(city.x * cols)))
      const path = findRoadPath(startCell, endCell, land, elevationGrid, cols, rows)
      const stride = Math.max(1, Math.floor(path.length / 28))
      const points = path
        .filter((cell, index) => index % stride === 0 || index === path.length - 1)
        .map((cell) => ({
          x: (cell % cols) / cols,
          y: Math.floor(cell / cols) / rows,
        }))
      roads.push({
        id: roadId++,
        stateId: state.id,
        points: points.length >= 2 ? points : [
          { x: capital.x, y: capital.y },
          { x: city.x, y: city.y },
        ],
      })
    }
  }

  return {
    cols,
    rows,
    owner,
    states,
    cities,
    roads,
    seeds: inputSeeds.length > 0 ? inputSeeds : undefined,
  }
}
