import { classifyBiomes, type BiomeData } from './biomes'
import { generateClimate, type ClimateData } from './climate'
import { generateHydrology, type HydrologyData } from './hydrology'
import { buildRenderContext, type MapState, type RenderContext } from './render'
import { generateTerrain, type TerrainData } from './terrain'
import type { MapStats, WorldMapParams } from '../types'
import { normalizeMapParams } from '../params'

export interface GeneratedWorld {
  state: MapState
  context: RenderContext
  stats: MapStats
}

export { normalizeMapParams as normalizeParams }

export function generateWorld(
  seed: number,
  rawParams: WorldMapParams,
  onProgress?: (stage: string, value: number) => void,
): GeneratedWorld {
  const params = normalizeMapParams(rawParams)
  onProgress?.('初始化种子', 0.01)
  const terrain: TerrainData = generateTerrain(seed >>> 0, params, onProgress)
  const hydrology: HydrologyData = generateHydrology(terrain, params, onProgress)
  const climate: ClimateData = generateClimate(
    terrain,
    { water: hydrology.water, lakeMask: hydrology.lakeMask },
    seed,
    params,
    onProgress,
  )
  const biomes: BiomeData = classifyBiomes(terrain, hydrology, climate, onProgress)

  onProgress?.('建立着色缓存', 0.9)
  const state: MapState = { terrain, hydrology, climate, biomes, params }
  const context = buildRenderContext(state)

  const cells = terrain.width * terrain.height
  let landCells = 0
  let oceanCells = 0
  let riverCells = 0
  let lakeCells = 0
  let maxElevation = 0
  let minElevation = 0

  for (let i = 0; i < cells; i++) {
    const elev = terrain.elevation[i]
    if (elev > 0) landCells++
    else oceanCells++
    if (elev > maxElevation) maxElevation = elev
    if (elev < minElevation) minElevation = elev
    if (hydrology.water[i] === 3) riverCells++
    if (hydrology.water[i] === 2) lakeCells++
  }

  const biomeCount = biomes.counts.filter((count, id) => count > 0 && id !== 0 && id !== 1).length

  onProgress?.('生成地图', 0.96)
  return {
    state,
    context,
    stats: {
      landRatio: landCells / cells,
      oceanCells,
      landCells,
      maxElevation,
      minElevation,
      riverCells: riverCells || hydrology.riverCells,
      lakeCount: hydrology.lakeCount,
      lakeCells,
      biomeCounts: biomes.counts,
      biomeCount,
      meanTemperature: climate.meanTemperature,
      meanPrecipitation: climate.meanPrecipitation,
    },
  }
}
