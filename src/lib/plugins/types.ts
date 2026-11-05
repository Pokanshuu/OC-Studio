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

export type PluginKind = 'tool' | 'theme' | 'skill'

/**
 * 权限项（`docs/插件.md` §3 的表）。
 *
 * 默认全关，用户在设置里逐项授权；`own-storage` 是唯一默认开的（插件自己的键值空间）。
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
}

export const PLUGIN_KIND_LABELS: Record<PluginKind, string> = {
  tool: '功能',
  theme: '主题',
  skill: '技能',
}

export const PERMISSION_LABELS: Record<PluginPermission, string> = {
  'read-entities': '读实体',
  'subscribe-data': '订阅变更',
  'render-canvas': '渲染容器',
  'export-image': '导出图片',
  network: '网络',
  'own-storage': '自己的存储',
}

/** 默认就开的权限（其余逐项授权） */
export const DEFAULT_GRANTED: readonly PluginPermission[] = ['own-storage']

/** 侧栏「工具」里能出现的插件 */
export function isToolPlugin(manifest: PluginManifest): boolean {
  return manifest.kind === 'tool' && manifest.available
}
