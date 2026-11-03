/**
 * 地图生成器 —— 第一个官方插件。
 *
 * 按 `docs/插件.md` §0.1：**先做成内置模块 + 插件形状的接口**，等沙箱就绪再真正装成插件。
 * 也就是说：这里的代码与内置代码之间**只有** `src/plugins/map-generator/index.ts`
 * 这一条边界——不碰 Dexie、不碰 localStorage、不碰 DOM、不读写用户文件。
 *
 * 内置侧「地图」只保留视图（手绘底图 + 锚点 + 图层开关，见 `src/features/map/`），
 * 生成能力全部在插件里；去掉这个目录，地图视图仍然可用。
 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  /** 宿主 API 版本；不匹配就拒绝加载 */
  apiVersion: number
  kind: 'official'
  description: string
  /** 逐项权限：这里只有渲染与导出图片，没有数据读写 */
  permissions: PluginPermission[]
  /** `builtin` = 当前随应用一起编译；将来换沙箱时改成 `entry.js` */
  entry: 'builtin'
}

export type PluginPermission = 'render-canvas' | 'export-image' | 'read-params'

export const MAP_GENERATOR_API_VERSION = 1

export const MAP_GENERATOR_MANIFEST: PluginManifest = {
  id: 'official.map-generator',
  name: '地图生成器',
  version: '1.0.0',
  apiVersion: MAP_GENERATOR_API_VERSION,
  kind: 'official',
  // 只说界面上真能切到的视图（`MapGeneratorPanel` 的 VIEWS）。
  // 内核还有 `political` / `profile`，但宿主暂无入口，不写进对外描述。
  description: '按参数与种子生成世界 / 区域地图：地形、等高线、温度、降水、生物群系',
  permissions: ['render-canvas', 'export-image', 'read-params'],
  entry: 'builtin',
}
