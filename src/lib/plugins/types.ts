/**
 * 插件系统的类型与契约（`docs/插件.md`）。
 *
 * 口径：**插件分三类**，差别在「它能碰什么」，不在它长什么样：
 * - `tool`   功能插件：有自己的界面（一块容器），走白名单 API，可能要权限
 * - `theme`  主题插件：**只有数据**（令牌 / 背景 / 排版），没有可执行代码，所以最安全
 * - `skill`  技能包：只有提示词与工具声明（`docs/插件.md` §0.2），给助手用
 *
 * 三类共用一份 manifest：`kind` 决定它出现在哪、要不要走沙箱。以后从 zip 装进来的
 * 第三方插件与内置插件走**完全相同的结构**——内置的只是 `source: 'builtin'`。
 *
 * 这份文件不 import React，脚本与界面都能读。
 */

export type PluginKind = 'tool' | 'skill'

/** 插件怎么被打开：占导航位，还是只在上下文里出现（见 PluginManifest.nav） */
export type PluginNav = 'sidebar' | 'contextual'

/**
 * 权限项（`docs/插件.md` §3 的表）。
 *
 * 这份清单是**声明**：插件要碰什么写在 manifest 里，由宿主在调用处自己判。
 * 设置页只署名作者，不做逐项开关 —— 内置插件随包发行，授权开关既没有真实
 * 边界，还把「谁写的」这一行挤掉了（2026-11-06）。
 */
export type PluginPermission =
  | 'read-entities'
  | 'subscribe-data'
  | 'render-canvas'
  | 'export-image'
  | 'network'
  | 'own-storage'

export interface PluginManifest {
  /** 稳定 id（`official.map-generator` / `custom-xxx`） */
  id: string
  /** 人可读名（侧栏 / 设置里显示的就是它） */
  name: string
  /** 作者署名（设置里显示在类型后面） */
  author: string
  kind: PluginKind
  version: string
  /** 宿主 API 版本：宿主升级到不兼容时据此拒绝加载 */
  apiVersion: number
  /** 一句话说明（≤ 20 字，`AGENTS.md` 约束 13） */
  description: string
  permissions: readonly PluginPermission[]
  /** `builtin` = 随包走；`file` = 用户从文件装的（v1 只有内置） */
  source: 'builtin' | 'file'
  /** 出厂是否启用 */
  enabledByDefault: boolean
  /** false = 界面里标「开发中」，不进侧栏、不能启用 */
  available: boolean
  /**
   * 导航位：它该怎么被打开。
   *
   * - sidebar（默认）：侧栏「工具」里列一条，任何时候都能进
   * - contextual：**不占导航位**，只在某个具体上下文里出现
   *   （地图生成器：日常从「地图」里打开；它另有一个不选目标的工具页，
   *   但那个入口不占导航位，见 `official.ts` 的注释）
   */
  nav?: PluginNav
}

export const PLUGIN_KIND_LABELS: Record<PluginKind, string> = {
  tool: '功能',
  skill: '技能',
}

/** 侧栏「工具」里能出现的插件 */
export function isToolPlugin(manifest: PluginManifest): boolean {
  return manifest.kind === 'tool' && manifest.available
}

/**
 * 是否**占侧栏导航位**。上下文插件（
av: 'contextual'）返回 false ——
 * 它不是“还没做完”，而是**故意不出现在导航里**，只在需要它的那个界面上出现。
 */
export function isSidebarTool(manifest: PluginManifest): boolean {
  return isToolPlugin(manifest) && (manifest.nav ?? 'sidebar') === 'sidebar'
}
