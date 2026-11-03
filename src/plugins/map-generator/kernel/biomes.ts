import type { ClimateData } from './climate'
import type { HydrologyData } from './hydrology'
import type { TerrainData } from './terrain'

export const BIOME = {
  OCEAN: 0,
  LAKE: 1,
  ICE: 2,
  TUNDRA: 3,
  TAIGA: 4,
  TEMPERATE_RAINFOREST: 5,
  TEMPERATE_FOREST: 6,
  GRASSLAND: 7,
  MEDITERRANEAN: 8,
  DESERT: 9,
  SAVANNA: 10,
  TROPICAL_SEASONAL: 11,
  TROPICAL_RAINFOREST: 12,
  ALPINE: 13,
  SNOW: 14,
  BEACH: 15,
  WETLAND: 16,
} as const

export interface BiomeData {
  biome: Uint8Array
  counts: number[]
}

/**
 * Whittaker 温度 × 湿度查表，叠加海拔、海岸与湿地修正。
 * 这个分类刻意保持离散、可解释：用户能从图例反推每一块颜色的成因。
 */
export function classifyBiomes(
  terrain: TerrainData,
  hydrology: HydrologyData,
  climate: ClimateData,
  onProgress?: (stage: string, value: number) => void,
): BiomeData {
  const { width, height, elevation } = terrain
  const cells = width * height
  const biome = new Uint8Array(cells)
  const counts = new Array<number>(17).fill(0)

  onProgress?.('分类生物群系', 0.79)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      const water = hydrology.water[i]
      if (water === 1) {
        biome[i] = BIOME.OCEAN
        counts[BIOME.OCEAN]++
        continue
      }
      if (water === 2) {
        biome[i] = BIOME.LAKE
        counts[BIOME.LAKE]++
        continue
      }

      const elev = elevation[i]
      const temp = climate.temperature[i]
      const moist = climate.moisture[i] / 255
      const dist = climate.distanceToWater[i]
      const coastDist = climate.distanceToOcean[i]
      let id: number

      // 只有真正靠海才形成沙滩；河岸与湖岸不用沙色，避免“黄色描边”。
      if (elev < 18 && coastDist < 3.2) {
        id = BIOME.BEACH
      } else if (temp < -18 || (elev > 7000 && temp < -12)) {
        id = BIOME.ICE
      } else if (elev > 6500 || temp < -12) {
        id = BIOME.SNOW
      } else if (elev > 3000) {
        id = BIOME.ALPINE
      } else if (temp < 1.5) {
        id = BIOME.TUNDRA
      } else if (temp < 8) {
        id = moist > 0.46 ? BIOME.TAIGA : BIOME.TUNDRA
      } else if (temp < 13) {
        if (moist > 0.68) id = BIOME.TEMPERATE_RAINFOREST
        else if (moist > 0.4) id = BIOME.TEMPERATE_FOREST
        else if (moist > 0.22) id = BIOME.GRASSLAND
        else id = BIOME.DESERT
      } else if (temp < 20) {
        if (moist > 0.7) id = BIOME.TEMPERATE_RAINFOREST
        else if (moist > 0.42) id = BIOME.TEMPERATE_FOREST
        else if (moist > 0.27) id = BIOME.MEDITERRANEAN
        else if (moist > 0.16) id = BIOME.GRASSLAND
        else id = BIOME.DESERT
      } else {
        if (moist > 0.62) id = BIOME.TROPICAL_RAINFOREST
        else if (moist > 0.42) id = BIOME.TROPICAL_SEASONAL
        else if (moist > 0.22) id = BIOME.SAVANNA
        else id = BIOME.DESERT
      }

      // 低洼、湿润、靠水的地带是湿地；不覆盖海滩与高山。
      if (
        id !== BIOME.BEACH &&
        elev < 120 &&
        moist > 0.7 &&
        dist < 7
      ) {
        id = BIOME.WETLAND
      }
      if (id === BIOME.BEACH && (elev > 26 || moist > 0.55)) {
        id = moist > 0.55 ? BIOME.WETLAND : BIOME.GRASSLAND
      }

      biome[i] = id
      counts[id] = (counts[id] ?? 0) + 1
    }
    if ((y & 127) === 0) onProgress?.('分类生物群系', 0.79 + (y / height) * 0.07)
  }

  return { biome, counts }
}
