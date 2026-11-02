import type { WorldMapParams, WorldMapRecord } from '@/types'
import type { MapwrightData } from './generator/mapwright'

export type { WorldMapParams, WorldMapRecord }

export const MAP_SIZE = 1024
export const WORLD_MAP_WIDTH = 3072
export const WORLD_MAP_HEIGHT = 1536
export const REGION_MAP_SIZE = 1024
export const MAP_MIN_SIZE = 512
export const MAP_MAX_SIZE = 4096
export const MAP_ALGORITHM_VERSION = 2

export const DEFAULT_MAP_PARAMS: WorldMapParams = {
  kind: 'world',
  terrainPreset: 'earth',
  width: WORLD_MAP_WIDTH,
  height: WORLD_MAP_HEIGHT,
  landCoverage: 0.42,
  mountainStrength: 0.68,
  plateauStrength: 0.55,
  plainBias: 0.05,
  lakeDensity: 0.3,
  lakeMinArea: 0.0007,
  lakeMaxArea: 0.006,
  temperatureOffset: 0,
  moistureBias: 0,
  riverDensity: 0.52,
  latitudeSpan: 150,
}

export const DEFAULT_REGION_PARAMS: WorldMapParams = {
  ...DEFAULT_MAP_PARAMS,
  kind: 'region',
  width: REGION_MAP_SIZE,
  height: REGION_MAP_SIZE,
}

export type MapView =
  | 'terrain'
  | 'contour'
  | 'temperature'
  | 'moisture'
  | 'biome'
  | 'political'
  | 'profile'

export const MAP_VIEW_LABELS: Record<MapView, string> = {
  terrain: '地形',
  contour: '等高线',
  temperature: '温度',
  moisture: '降水',
  biome: '生物群系',
  political: '政治',
  profile: '地形剖面',
}

export const BIOME_NAMES = [
  '深海',
  '湖泊',
  '冰盖',
  '苔原',
  '针叶林',
  '温带雨林',
  '温带落叶林',
  '温带草原',
  '地中海灌丛',
  '荒漠',
  '稀树草原',
  '热带季风林',
  '热带雨林',
  '高山草甸',
  '雪山',
  '海岸',
  '湿地',
] as const

export const BIOME_COLORS = [
  '#1B3543',
  '#4E949E',
  '#DDE4E4',
  '#9FAF9A',
  '#3F6450',
  '#2F6B52',
  '#5A8A4E',
  '#B9B46A',
  '#A89B55',
  '#D8BE82',
  '#C2A24F',
  '#4F8C45',
  '#246A3F',
  '#8E8A6B',
  '#E5E2D8',
  '#DCCB9F',
  '#5E8B74',
] as const

export type BiomeId = number

export interface MapStats {
  landRatio: number
  oceanCells: number
  landCells: number
  maxElevation: number
  minElevation: number
  riverCells: number
  lakeCount: number
  lakeCells: number
  biomeCounts: number[]
  biomeCount: number
  meanTemperature: number
  meanPrecipitation: number
}

export interface MapPoint {
  x: number
  y: number
}

export interface MapSegment {
  ax: number
  ay: number
  bx: number
  by: number
}

export interface MapPolygon {
  points: MapPoint[]
}

export interface MapRiverSegment extends MapSegment {
  width: number
}

export interface MapRiverPath {
  width: number
  points: Array<{ x: number; y: number }>
}

export interface MapVectors {
  coastline: MapSegment[]
  lakes: MapPolygon[]
  /** 湖内等深线，用距岸距离近似水深。 */
  lakeContours: MapSegment[]
  rivers: MapRiverSegment[]
  riverPaths?: MapRiverPath[]
}

export interface GeneratedMeta {
  algorithmVersion: number
  seed: number
  params: WorldMapParams
  generatedAt: number
  stats: MapStats
  width: number
  height: number
}

export interface GenerateRequest {
  type: 'generate'
  requestId: number
  seed: number
  params: WorldMapParams
}

export interface RenderRequest {
  type: 'render'
  requestId: number
  view: MapView
  contourInterval?: number
}

export interface MapwrightRequest {
  type: 'mapwright'
  requestId: number
  data: MapwrightData
  params: WorldMapParams
}

export type WorkerRequest = GenerateRequest | RenderRequest | MapwrightRequest

export interface ProgressMessage {
  type: 'progress'
  requestId: number
  stage: string
  value: number
}

export interface GeneratedMessage {
  type: 'generated'
  requestId: number
  meta: GeneratedMeta
  height: ArrayBuffer
  biome: ArrayBuffer
  water: ArrayBuffer
  temperature: ArrayBuffer
  moisture: ArrayBuffer
  initialImage: ArrayBuffer
  vectors: MapVectors
}

export interface RenderMessage {
  type: 'rendered'
  requestId: number
  view: MapView
  contourInterval?: number
  buffer: ArrayBuffer
}

export interface ErrorMessage {
  type: 'error'
  requestId: number
  message: string
}

export type WorkerResponse = ProgressMessage | GeneratedMessage | RenderMessage | ErrorMessage

export interface ProfileSample {
  t: number
  x: number
  y: number
  elevation: number
  biome: BiomeId
  water: number
}

export interface MapLine {
  ax: number
  ay: number
  bx: number
  by: number
}

export const DEFAULT_PROFILE_LINE: MapLine = {
  ax: 214,
  ay: 392,
  bx: 812,
  by: 626,
}
