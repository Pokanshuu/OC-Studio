/**
 * 预制的两个官方插件（`docs/插件.md` §0.1）。
 *
 * 它们走**和第三方完全相同的 manifest**：内置只是 `source: 'builtin'`。
 * 地图生成器的算法与 Worker 早就关在 `src/plugins/map-generator/` 里（那条
 * `index.ts` 边界就是将来的沙箱线），这里只是把它的身份登记进宿主。
 *
 * 助手（`agent`）是**整目录移植物**：`src/plugins/agent/` + `src-tauri/src/agent/`
 * 原样搬自 `D:\Codes\Simple-Agent`，宿主只留 `AgentPlugin.tsx` 一道缝。它自带
 * 存储（插件自己的 SQLite）与网络（Rust 侧流式），所以这里只登记身份与权限。
 * 出厂不开：要先填端点与密钥才有意义。
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
  /**
   * 生成器**不占侧栏导航位**。
   *
   * 它只为一张具体的地图服务：进「地图」→ 新建一张 → 生成底图，生成器就在
   * 那里出现。没有「泛泛地打开生成器」这回事，摆在侧栏只会让人以为它是个
   * 独立工具、还得再选一次目标地图。
   *
   * 页面本身（`features/tools/MapToolView`）**保留**：它是唯一能脱离地图、
   * 直接指定目标地图调试生成的地方。从 设置 › 插件 里点进去。
   */
  nav: 'contextual',
}

export const AGENT_PLUGIN: PluginManifest = {
  id: 'official.agent',
  // 界面里不出现「AI」字样（`AGENTS.md` 约束 15）：叫「助手」，代码 id 仍是 agent
  name: '助手',
  kind: 'tool',
  version: '0.1.0',
  apiVersion: 1,
  description: '和设定库对话，读写条目',
  // 对话要网络与自己的存储；读库是逐项授权项（关掉后助手照常能聊，只是看不见库）
  permissions: ['network', 'own-storage', 'read-entities'],
  source: 'builtin',
  // 助手有独立的对话界面，任何地方都不依赖上下文 —— 它占侧栏导航位
  nav: 'sidebar',
  // 一方工具，和地图生成器一样出厂就在侧栏里可见：插件自己带设置页，
  // 没配端点时点进去是它的引导，而不是一块空白。藏起来只会让人找不到。
  enabledByDefault: true,
  available: true,
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
