/**
 * 地图生成器插件的**唯一对外边界**。
 *
 * 内置侧只能从这里进：参数类型、视图枚举、Worker 工厂、纯内核函数。
 * 不要直接 import `./kernel/*`——那是插件内部实现，将来搬去沙箱时会被整体移走。
 *
 * 两种调用方式：
 * 1. `createMapGeneratorWorker()` —— 界面里用这个（生成在主线程之外，带进度）
 * 2. `generateWorld()` / `renderView()` —— 纯函数，测试与导出脚本用
 *
 * 插件不接触数据层：不读 Dexie、不写文件、不认「地图实体」。
 * 底图与锚点归宿主（`src/features/map/`，阶段 S3）。
 */
export {
  MAP_GENERATOR_API_VERSION,
  MAP_GENERATOR_MANIFEST,
  type PluginManifest,
  type PluginPermission,
} from './manifest'

export {
  BIOME_COLORS,
  BIOME_NAMES,
  DEFAULT_MAP_PARAMS,
  DEFAULT_REGION_PARAMS,
  MAP_ALGORITHM_VERSION,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
  MAP_SIZE,
  MAP_VIEW_LABELS,
  REGION_MAP_SIZE,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
  type BiomeId,
  type GenerateRequest,
  type GeneratedMessage,
  type MapPoint,
  type MapPolygon,
  type MapRiverPath,
  type MapSegment,
  type MapStats,
  type MapVectors,
  type MapView,
  type MapwrightRequest,
  type ProgressMessage,
  type RenderRequest,
  type TerrainPreset,
  type WorkerRequest,
  type WorkerResponse,
  type WorldMapKind,
  type WorldMapParams,
} from './types'

export { generateWorld } from './kernel'
export { buildMapwrightWorld } from './kernel/mapwright'
export { renderView } from './kernel/render'
export { buildMapVectors } from './kernel/vectors'
export { sampleProfile, profileExtremes, lineLengthKm, type MapLayers, type ProfilePoint } from './profile'
export { generatePolitical, type PoliticalData } from './political'

import type { WorldMapParams } from './types'

/** 生成 / 渲染都跑在这个 Worker 里（`worker.ts` 是 `kernel` 的壳） */
export function createMapGeneratorWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
}

/** 参数校验 + 默认值收敛（界面调，避免把非法参数喂给 Worker） */
export { normalizeMapParams } from './params'

/** 该插件是否能处理这组参数（将来多插件并存时由宿主统一询问） */
export function canGenerate(params: Pick<WorldMapParams, 'kind'>): boolean {
  return params.kind === 'world' || params.kind === 'region'
}
