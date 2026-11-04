/**
 * 内置「地图」视图的类型 —— **只有视图**。
 *
 * 生成算法是插件（`src/plugins/map-generator/`，官方插件之一，见 `docs/插件.md`）：
 * 去掉插件，这里的手绘底图 + 锚点 + 图层开关仍然能用。
 *
 * 数据口径（`docs/地图.md` §2）：
 * - 地图不是实体，没有自己的表；底图存 `.ocstudio/maps/<名>.png`
 * - 锚点归一化 0–1，写回实体 frontmatter 的 `map_position`，换分辨率不用重摆
 */
export interface MapAnchor {
  /** 相对底图宽度的比例，0–1 */
  x: number
  /** 相对底图高度的比例，0–1 */
  y: number
}

/** 图层 = 实体类型；地图上叠哪几类锚点 */
export type MapLayerKind = 'country' | 'event' | 'worldEntry'

export interface MapLayerState {
  kind: MapLayerKind
  visible: boolean
}

export const MAP_LAYER_LABELS: Record<MapLayerKind, string> = {
  country: '国家',
  event: '事件',
  worldEntry: '词条',
}

/** 默认三层全开；国家在最下（它最密，压住别的会看不见） */
export const DEFAULT_MAP_LAYERS: readonly MapLayerState[] = [
  { kind: 'country', visible: true },
  { kind: 'event', visible: true },
  { kind: 'worldEntry', visible: true },
]

/** 一张手绘底图：只要尺寸与地址，像素本身在文件系统里 */
export interface MapBackground {
  /** `.ocstudio/maps/` 下的文件名 */
  file: string
  width: number
  height: number
}
