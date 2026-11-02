import type { WorldMapParams } from '@/types'
import {
  DEFAULT_MAP_PARAMS,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
  MAP_SIZE,
  REGION_MAP_SIZE,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
} from './types'

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 同时兼容旧版 `size` 与新版 width/height。
 * 旧地图保留原来的正方形尺寸，新地图使用 kind 对应的默认尺寸。
 */
export function normalizeMapParams(input: Partial<WorldMapParams> | undefined): WorldMapParams {
  const source = input ?? {}
  const kind = source.kind === 'region' ? 'region' : 'world'
  const legacySize = finite(source.size, 0)
  const defaultWidth = kind === 'world' ? WORLD_MAP_WIDTH : REGION_MAP_SIZE
  const defaultHeight = kind === 'world' ? WORLD_MAP_HEIGHT : REGION_MAP_SIZE
  const width = finite(source.width, 0) || legacySize || defaultWidth
  const height = finite(source.height, 0) || legacySize || defaultHeight

  const preset =
    source.terrainPreset === 'three-continents' ||
    source.terrainPreset === 'islands' ||
    source.terrainPreset === 'pangaea' ||
    source.terrainPreset === 'custom'
      ? source.terrainPreset
      : 'earth'

  return {
    kind,
    terrainPreset: preset,
    width: Math.round(clamp(width, MAP_MIN_SIZE, MAP_MAX_SIZE)),
    height: Math.round(clamp(height, MAP_MIN_SIZE, MAP_MAX_SIZE)),
    size: MAP_SIZE,
    landCoverage: clamp(finite(source.landCoverage, DEFAULT_MAP_PARAMS.landCoverage), 0.08, 0.62),
    mountainStrength: clamp(finite(source.mountainStrength, DEFAULT_MAP_PARAMS.mountainStrength), 0, 1),
    plateauStrength: clamp(finite(source.plateauStrength, DEFAULT_MAP_PARAMS.plateauStrength), 0, 1),
    plainBias: clamp(finite(source.plainBias, DEFAULT_MAP_PARAMS.plainBias), -1, 1),
    lakeDensity: clamp(finite(source.lakeDensity, DEFAULT_MAP_PARAMS.lakeDensity), 0, 1),
    lakeMinArea: clamp(finite(source.lakeMinArea, DEFAULT_MAP_PARAMS.lakeMinArea), 0.00005, 0.01),
    lakeMaxArea: clamp(finite(source.lakeMaxArea, DEFAULT_MAP_PARAMS.lakeMaxArea), 0.0005, 0.05),
    temperatureOffset: clamp(finite(source.temperatureOffset, 0), -10, 10),
    moistureBias: clamp(finite(source.moistureBias, 0), -1, 1),
    riverDensity: clamp(finite(source.riverDensity, DEFAULT_MAP_PARAMS.riverDensity), 0, 1),
    latitudeSpan: clamp(finite(source.latitudeSpan, 150), 80, 180),
  }
}
