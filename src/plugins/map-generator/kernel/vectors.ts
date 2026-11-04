import type { HydrologyData } from './hydrology'
import type { TerrainData } from './terrain'
import type { MapPolygon, MapSegment, MapVectors } from '../types'

interface Point {
  x: number
  y: number
}

function edgePoint(
  x: number,
  y: number,
  edge: number,
  h00: number,
  h10: number,
  h11: number,
  h01: number,
  level: number,
): Point {
  switch (edge) {
    case 0: {
      const t = (level - h00) / (h10 - h00 || 1)
      return { x: x + t, y }
    }
    case 1: {
      const t = (level - h10) / (h11 - h10 || 1)
      return { x: x + 1, y: y + t }
    }
    case 2: {
      const t = (level - h01) / (h11 - h01 || 1)
      return { x: x + t, y: y + 1 }
    }
    default: {
      const t = (level - h00) / (h01 - h00 || 1)
      return { x, y: y + t }
    }
  }
}

function contourSegments(
  values: ArrayLike<number>,
  width: number,
  height: number,
  level: number,
): MapSegment[] {
  const segments: MapSegment[] = []
  for (let y = 0; y < height - 1; y++) {
    const row = y * width
    for (let x = 0; x < width - 1; x++) {
      const i = row + x
      const h00 = values[i]
      const h10 = values[i + 1]
      const h01 = values[i + width]
      const h11 = values[i + width + 1]
      const idx =
        (h00 > level ? 1 : 0) |
        (h10 > level ? 2 : 0) |
        (h11 > level ? 4 : 0) |
        (h01 > level ? 8 : 0)
      if (idx === 0 || idx === 15) continue
      const top = edgePoint(x, y, 0, h00, h10, h11, h01, level)
      const right = edgePoint(x, y, 1, h00, h10, h11, h01, level)
      const bottom = edgePoint(x, y, 2, h00, h10, h11, h01, level)
      const left = edgePoint(x, y, 3, h00, h10, h11, h01, level)
      const add = (a: Point, b: Point): void => {
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
      }
      switch (idx) {
        case 1:
        case 14:
          add(left, top)
          break
        case 2:
        case 13:
          add(top, right)
          break
        case 3:
        case 12:
          add(left, right)
          break
        case 4:
        case 11:
          add(right, bottom)
          break
        case 6:
        case 9:
          add(top, bottom)
          break
        case 7:
        case 8:
          add(left, bottom)
          break
        case 5:
          add(left, top)
          add(right, bottom)
          break
        case 10:
          add(top, right)
          add(bottom, left)
          break
      }
    }
  }
  return segments
}

function key(point: Point): string {
  return `${Math.round(point.x * 4)},${Math.round(point.y * 4)}`
}

/**
 * 将 Marching Squares 的线段串成闭合多边形。
 * 湖泊数量少，这一步成本很低；海岸线仍直接使用线段，不需要闭合。
 */
function chainSegments(segments: MapSegment[]): MapPolygon[] {
  const startKeys = new Map<string, number[]>()
  segments.forEach((segment, index) => {
    const a = key({ x: segment.ax, y: segment.ay })
    const b = key({ x: segment.bx, y: segment.by })
    for (const k of [a, b]) {
      const list = startKeys.get(k)
      if (list) list.push(index)
      else startKeys.set(k, [index])
    }
  })

  const used = new Uint8Array(segments.length)
  const polygons: MapPolygon[] = []
  for (let startIndex = 0; startIndex < segments.length; startIndex++) {
    if (used[startIndex]) continue
    const first = segments[startIndex]
    const startKey = key({ x: first.ax, y: first.ay })
    const points: Point[] = [{ x: first.ax, y: first.ay }, { x: first.bx, y: first.by }]
    used[startIndex] = 1
    let currentKey = key({ x: first.bx, y: first.by })
    let closed = false
    let guard = 0
    while (guard++ < segments.length + 4) {
      if (currentKey === startKey) {
        closed = true
        break
      }
      const candidates = startKeys.get(currentKey) ?? []
      const next = candidates.find((candidate) => !used[candidate])
      if (next === undefined) break
      used[next] = 1
      const segment = segments[next]
      const aKey = key({ x: segment.ax, y: segment.ay })
      const bKey = key({ x: segment.bx, y: segment.by })
      const nextPoint = aKey === currentKey ? { x: segment.bx, y: segment.by } : { x: segment.ax, y: segment.ay }
      points.push(nextPoint)
      currentKey = aKey === currentKey ? bKey : aKey
    }
    if (!closed || points.length < 4) continue
    // 去掉闭合路径末尾重复点，并做一次轻度抽稀。
    if (points.length > 2) points.pop()
    const simplified: Point[] = []
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length]
      const current = points[i]
      const next = points[(i + 1) % points.length]
      const cross =
        (current.x - prev.x) * (next.y - current.y) -
        (current.y - prev.y) * (next.x - current.x)
      if (Math.abs(cross) > 0.02 || i % 3 === 0) simplified.push(current)
    }
    if (simplified.length >= 3) polygons.push({ points: simplified })
  }
  return polygons
}

export function buildMapVectors(terrain: TerrainData, hydrology: HydrologyData): MapVectors {
  const { width, height, elevation } = terrain
  const coastline = contourSegments(elevation, width, height, 0)

  // 湖泊用 0/1 掩膜提取闭合轮廓；只保留面积足够大的多边形。
  const lakeMask = new Float32Array(width * height)
  for (let i = 0; i < lakeMask.length; i++) {
    lakeMask[i] = hydrology.water[i] === 2 ? 1 : 0
  }
  const lakeSegments = contourSegments(lakeMask, width, height, 0.5)
  const lakes = chainSegments(lakeSegments).filter((polygon) => polygon.points.length >= 5)

  // 湖内等深线：优先使用真实湖深；mapwright 等外部数据没有深度时退回岸距代理。
  const depthSurface = new Float32Array(width * height)
  let maxLakeDepth = 0
  for (let i = 0; i < depthSurface.length; i++) {
    if (lakeMask[i] !== 1) continue
    depthSurface[i] = hydrology.lakeDepth?.[i] ?? 0
    if (depthSurface[i] > maxLakeDepth) maxLakeDepth = depthSurface[i]
  }

  // 从湖岸做多源 BFS，距离岸线的格数作为无深度数据时的代理。
  const distance = new Float32Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (lakeMask[i] !== 1) continue
      const shore =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        lakeMask[i - 1] !== 1 ||
        lakeMask[i + 1] !== 1 ||
        lakeMask[i - width] !== 1 ||
        lakeMask[i + width] !== 1
      if (shore) {
        distance[i] = 1
        queue[tail++] = i
      }
    }
  }
  while (head < tail) {
    const i = queue[head++]
    const x = i % width
    const y = (i / width) | 0
    const nextDistance = distance[i] + 1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (lakeMask[ni] !== 1 || distance[ni] > 0) continue
      distance[ni] = nextDistance
      queue[tail++] = ni
    }
  }
  const lakeContours: MapSegment[] = []
  if (maxLakeDepth >= 4) {
    const step = maxLakeDepth > 120 ? 25 : maxLakeDepth > 40 ? 10 : 5
    for (let level = step; level <= maxLakeDepth; level += step) {
      const segments = contourSegments(depthSurface, width, height, level)
      if (segments.length > 0) lakeContours.push(...segments)
    }
  } else {
    for (const level of [2, 4, 6, 8, 12]) {
      const segments = contourSegments(distance, width, height, level)
      if (segments.length > 0) lakeContours.push(...segments)
    }
  }

  const rivers = hydrology.riverSegments.map((segment) => ({
    ax: segment.ax,
    ay: segment.ay,
    bx: segment.bx,
    by: segment.by,
    width: segment.width,
  }))

  return {
    coastline,
    lakes,
    lakeContours,
    rivers,
    riverPaths: buildRiverPaths(hydrology.riverSegments),
  }
}

/**
 * 把 D8 网格河流串成连续折线，并叠加低频横向摆动。
 * 河流不再是一段段直线，而是类似真实河流的蜿蜒曲线。
 */
function buildRiverPaths(
  segments: HydrologyData['riverSegments'],
): Array<{ width: number; points: Array<{ x: number; y: number }> }> {
  const key = (x: number, y: number): string =>
    `${Math.round(x * 2)},${Math.round(y * 2)}`
  const outgoing = new Map<string, HydrologyData['riverSegments'][number]>()
  const incoming = new Set<string>()
  for (const segment of segments) {
    outgoing.set(key(segment.ax, segment.ay), segment)
    incoming.add(key(segment.bx, segment.by))
  }
  const used = new Set<HydrologyData['riverSegments'][number]>()
  const paths: Array<{ width: number; points: Array<{ x: number; y: number }> }> = []

  const trace = (start: HydrologyData['riverSegments'][number]): void => {
    const points: Array<{ x: number; y: number }> = [{ x: start.ax, y: start.ay }]
    let width = start.width
    let current: HydrologyData['riverSegments'][number] | undefined = start
    while (current && !used.has(current)) {
      used.add(current)
      points.push({ x: current.bx, y: current.by })
      width = Math.max(width, current.width)
      current = outgoing.get(key(current.bx, current.by))
    }
    if (points.length < 2) return
    const meandered = points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point
      const previous = points[index - 1]
      const next = points[index + 1]
      const tx = next.x - previous.x
      const ty = next.y - previous.y
      const length = Math.max(1, Math.hypot(tx, ty))
      const nx = -ty / length
      const ny = tx / length
      const phase = point.x * 0.045 + point.y * 0.062
      const amplitude = Math.min(9, 1.6 + width * 2.1)
      const offset =
        Math.sin(phase) * amplitude + Math.sin(phase * 2.6 + 1.7) * amplitude * 0.22
      return { x: point.x + nx * offset, y: point.y + ny * offset }
    })
    paths.push({ width, points: meandered })
  }

  for (const segment of segments) {
    if (!incoming.has(key(segment.ax, segment.ay))) trace(segment)
  }
  for (const segment of segments) {
    if (!used.has(segment)) trace(segment)
  }
  return paths
}
