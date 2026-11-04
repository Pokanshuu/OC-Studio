/**
 * 内置地图视图（`docs/地图.md`）。
 *
 * 这里只放**视图**：底图、锚点、图层开关、跳转实体。
 * 生成能力是插件 `official.map-generator`（`src/plugins/map-generator/`），
 * 通过它的门面调用，不要直接引插件内部文件。
 */
export {
  DEFAULT_MAP_LAYERS,
  MAP_LAYER_LABELS,
  type MapAnchor,
  type MapBackground,
  type MapLayerKind,
  type MapLayerState,
} from './types'
export { MapView } from './MapView'
export { listAnchors, setAnchor, normalizeAnchor, groupAnchors, MAIN_MAP_ID } from './services'
    export type { AnchorPoint, AnchorKind } from './services'
