/**
 * 预制的两个官方插件（`docs/插件.md` §0.1）。
 *
 * 它们走**和第三方完全相同的 manifest**：内置只是 `source: 'builtin'`。
 * 地图生成器的算法与 Worker 早就关在 `src/plugins/map-generator/` 里（那条
 * `index.ts` 边界就是将来的沙箱线），这里只是把它的身份登记进宿主。
 *
 * 助手（`agent`）现在标 `available: false`：界面里能看到、能读它的权限说明，
 * 但侧栏不出入口 —— 免得点进去是块空壳。实装顺序见 `docs/插件.md` §0.2。
 */
import { MAP_GENERATOR_API_VERSION, MAP_GENERATOR_MANIFEST } from '@/plugins/map-generator'
import { THEME_PLUGINS } from './themes'
import type { PluginManifest } from './types'

export const MAP_GENERATOR_PLUGIN: PluginManifest = {
  id: MAP_GENERATOR_MANIFEST.id,
  name: MAP_GENERATOR_MANIFEST.name,
  kind: 'tool',
  version: MAP_GENERATOR_MANIFEST.version,
  apiVersion: MAP_GENERATOR_API_VERSION,
  // 侧栏里显示的一句（manifest 的 description 更长，留给设置页）
  description: '按参数与种子生成底图',
  permissions: ['render-canvas', 'export-image'],
  source: 'builtin',
  enabledByDefault: true,
  available: true,
}

export const AGENT_PLUGIN: PluginManifest = {
  id: 'official.agent',
  // 界面里不出现「AI」字样（`AGENTS.md` 约束 15）：叫「助手」，代码 id 仍是 agent
  name: '助手',
  kind: 'tool',
  version: '0.1.0',
  apiVersion: 1,
  description: '和设定库对话，读写条目',
  permissions: ['read-entities', 'subscribe-data', 'own-storage'],
  source: 'builtin',
  enabledByDefault: false,
  available: false,
}

/** 出厂清单（顺序 = 设置里的顺序；侧栏「工具」只取 kind: 'tool' 的那些） */
export const OFFICIAL_PLUGINS: readonly PluginManifest[] = [
  MAP_GENERATOR_PLUGIN,
  AGENT_PLUGIN,
  // 主题也是插件：四套配色各算一个，只给数据、没有代码
  ...THEME_PLUGINS,
]

export function findPlugin(id: string): PluginManifest | undefined {
  return OFFICIAL_PLUGINS.find((plugin) => plugin.id === id)
}
