import { BIOME } from './biomes'
import type { BiomeData } from './biomes'
import type { ClimateData } from './climate'
import type { HydrologyData, RiverSegment } from './hydrology'
import type { TerrainData } from './terrain'
import type { GeneratedWorld } from './index'
import type { MapState } from './render'
import { buildRenderContext } from './render'
import type { MapStats, WorldMapParams } from '../types'

/**
 * mapwright (`oc-studio/mapwright@1`) JSON 的最小消费层。
 * mapwright 负责 Voronoi/侵蚀/河流/气候，这里只把它映射成现有的 Canvas 渲染状态，
 * 不引入运行时 Python 依赖；JSON 可由本地 sidecar 生成后导入。
 */
export interface MapwrightCell {
  id: number
  cx: number
  cy: number
  height: number
  filled?: number
  flux?: number
  is_water?: boolean
  is_lake?: boolean
  is_river?: boolean
  temperature?: number
  moisture?: number
  biome?: number
}

export interface MapwrightData {
  width: number
  height: number
  sea_level: number
  cells: MapwrightCell[]
  cell_of: number[][]
  rivers?: Array<{ cells: number[]; width: number }>
  seed?: number
}

const MAPWRIGHT_TO_BIOME: Record<number, number> = {
  0: BIOME.OCEAN,
  1: BIOME.BEACH,
  2: BIOME.BEACH,
  3: BIOME.DESERT,
  4: BIOME.GRASSLAND,
  5: BIOME.TEMPERATE_FOREST,
  6: BIOME.WETLAND,
  7: BIOME.MEDITERRANEAN,
  8: BIOME.ALPINE,
  9: BIOME.TUNDRA,
  10: BIOME.SNOW,
  11: BIOME.OCEAN,
  12: BIOME.LAKE,
}

function distanceField(
  width: number,
  height: number,
  sources: Uint8Array,
): Float32Array {
  const cells = width * height
  const dist = new Float32Array(cells)
  const inf = 1e8
  const queue = new Int32Array(cells)
  let head = 0
  let tail = 0
  for (let i = 0; i < cells; i++) {
    if (sources[i]) {
      dist[i] = 0
      queue[tail++] = i
    } else {
      dist[i] = inf
    }
  }
  while (head < tail) {
    const i = queue[head++]
    const x = i % width
    const y = (i / width) | 0
    const next = dist[i] + 1
    if (x > 0 && dist[i - 1] > next) {
      dist[i - 1] = next
      queue[tail++] = i - 1
    }
    if (x + 1 < width && dist[i + 1] > next) {
      dist[i + 1] = next
      queue[tail++] = i + 1
    }
    if (y > 0 && dist[i - width] > next) {
      dist[i - width] = next
      queue[tail++] = i - width
    }
    if (y + 1 < height && dist[i + width] > next) {
      dist[i + width] = next
      queue[tail++] = i + width
    }
  }
  return dist
}

export function buildMapwrightWorld(
  data: MapwrightData,
  params: WorldMapParams,
): GeneratedWorld {
  const width = Math.max(2, Math.floor(data.width))
  const height = Math.max(2, Math.floor(data.height))
  const cells = width * height
  const byId = new Map(data.cells.map((cell) => [cell.id, cell]))
  const seaLevel = Number.isFinite(data.sea_level) ? data.sea_level : 0.32

  const elevation = new Int16Array(cells)
  const mountainField = new Float32Array(cells)
  const water = new Uint8Array(cells)
  const riverMask = new Uint8Array(cells)
  const lakeMask = new Uint8Array(cells)
  const flow = new Float32Array(cells)
  const temperature = new Int16Array(cells)
  const moisture = new Uint8Array(cells)
  const precipitation = new Float32Array(cells)
  const ocean = new Uint8Array(cells)
  const biome = new Uint8Array(cells)
  const counts = new Array<number>(17).fill(0)

  let maxElevation = 1
  let minElevation = 0
  let landCells = 0
  let riverCells = 0
  let lakeCells = 0
  let tempSum = 0
  let precipSum = 0

  for (let y = 0; y < height; y++) {
    const sourceRow = data.cell_of[y] ?? []
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const source = byId.get(sourceRow[x] ?? -1)
      if (!source) continue
      const relative = (source.height - seaLevel) / Math.max(1e-6, 1 - seaLevel)
      const below = (source.height - seaLevel) / Math.max(1e-6, seaLevel)
      const elevationValue = source.is_water
        ? Math.min(-1, Math.round(below * 4200))
        : Math.round(Math.max(1, relative * 6800))
      elevation[i] = Math.max(-9000, Math.min(9000, elevationValue))
      mountainField[i] = Math.max(0, Math.min(1, relative))
      flow[i] = source.flux ?? 1
      const isOcean = Boolean(source.is_water)
      const isLake = Boolean(source.is_lake)
      const isRiver = Boolean(source.is_river)
      ocean[i] = isOcean ? 1 : 0
      lakeMask[i] = isLake ? 1 : 0
      riverMask[i] = isRiver ? 1 : 0
      water[i] = isOcean ? 1 : isLake ? 2 : isRiver ? 3 : 0
      if (isOcean) {
        // 海洋
      } else {
        landCells++
      }
      if (isLake) lakeCells++
      if (isRiver) riverCells++
      const temp = Math.round(-20 + (source.temperature ?? 0.5) * 60)
      temperature[i] = temp
      tempSum += temp
      const wet = Math.round((source.moisture ?? 0.5) * 255)
      moisture[i] = wet
      precipitation[i] = Math.round((source.moisture ?? 0.5) * 2200)
      precipSum += precipitation[i]
      const mapped = MAPWRIGHT_TO_BIOME[source.biome ?? 4] ?? BIOME.GRASSLAND
      biome[i] = mapped
      counts[mapped] = (counts[mapped] ?? 0) + 1
      if (elevation[i] > maxElevation) maxElevation = elevation[i]
      if (elevation[i] < minElevation) minElevation = elevation[i]
    }
  }

  const riverSegments: RiverSegment[] = []
  for (const river of data.rivers ?? []) {
    for (let index = 1; index < river.cells.length; index++) {
      const a = byId.get(river.cells[index - 1])
      const b = byId.get(river.cells[index])
      if (!a || !b) continue
      riverSegments.push({
        ax: a.cx,
        ay: a.cy,
        bx: b.cx,
        by: b.cy,
        width: river.width,
        flow: Math.max(1, a.flux ?? b.flux ?? 1),
      })
    }
  }

  const waterMask = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) waterMask[i] = water[i] ? 1 : 0
  const distanceToWater = distanceField(width, height, waterMask)
  const distanceToOcean = distanceField(width, height, ocean)

  const terrain: TerrainData = {
    width,
    height,
    elevation,
    mountainField,
    plates: [],
    minBase: minElevation,
    maxBase: maxElevation,
    seaThreshold: 0,
  }
  const hydrology: HydrologyData = {
    flow,
    water,
    riverMask,
    lakeMask,
    lakeDepth: new Float32Array(width * height),
    riverSegments,
    riverCells,
    lakeCells,
    lakeCount: 0,
  }
  const climate: ClimateData = {
    temperature,
    moisture,
    precipitation,
    distanceToWater,
    distanceToOcean,
    ocean,
    meanTemperature: tempSum / Math.max(1, cells),
    meanPrecipitation: precipSum / Math.max(1, cells),
  }
  const biomes: BiomeData = { biome, counts }
  const biomeCount = counts.filter((count) => count > 0).length
  const stats: MapStats = {
    landRatio: landCells / Math.max(1, cells),
    oceanCells: cells - landCells,
    landCells,
    maxElevation,
    minElevation,
    riverCells,
    lakeCount: 0,
    lakeCells,
    biomeCounts: counts,
    biomeCount,
    meanTemperature: climate.meanTemperature,
    meanPrecipitation: climate.meanPrecipitation,
  }

  const state: MapState = { terrain, hydrology, climate, biomes, params: { ...params, width, height } }
  return {
    state,
    context: buildRenderContext(state),
    stats,
  }
}
