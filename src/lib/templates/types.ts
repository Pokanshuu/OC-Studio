/**
 * 模板系统 —— 类型与常量（阶段一）。
 *
 * 口径见 `docs/模板.md`：
 * - **笔记 = 模板 + 一串组件**；文件里只记模板名（`模板: 角色`），不记布局
 * - 组件是**闭集**：用户能改用哪些、什么顺序、组件内部参数，不能改渲染逻辑
 * - 阶段一**零迁移**：数据仍写原有强类型列，模板只决定「怎么拼」
 *
 * 这份文件不 import React，脚本（`scripts/templates-check.ts`）也能直接读。
 */

/** 内置模板 id（稳定，不可改；`自定义` 模板 id 建议 `custom-<slug>`） */
export type BuiltinTemplateId = 'character' | 'event' | 'country' | 'entry' | 'pet' | 'weapon'

/**
 * 组件 id —— 与 `docs/模板.md §4` 的清单一一对应。
 * **新增组件必须同时**：进这里、进 `registry.ts`、有渲染器，否则 `audit:templates` 会报。
 */
export type TemplateComponentId =
  | 'cover'
  | 'info'
  | 'relations'
  | 'tags'
  | 'image'
  | 'gallery'
  | 'time'
  | 'place'
  | 'summary'
  | 'body'

export interface TemplateComponent {
  id: TemplateComponentId
  /** 关掉的组件仍留在模板里（参数不丢），渲染时跳过 */
  enabled: boolean
  /**
   * 组件参数。阶段一只有少量「呈现」参数会被消费：
   * `title`（是否显示标题行）/ `presentation`（关系表的紧凑 / 表格 / 图）/
   * `mode`（画廊的网格 / 滑动）/ `columns`（画廊列数）/
   * `fields`（基本信息组里属于这个模板的自定义字段键，字符串数组）。
   */
  params?: Record<string, string | number | boolean | string[]>
}

export interface TemplateDoc {
  /** 稳定 id（`character` / `custom-xxx`）；笔记里不存 id，见 §3.1 */
  id: string
  /** 人可读名；笔记的 `模板:` 存的就是它 */
  name: string
  /** 旧名：改名后按别名兜住盘上的老笔记（不批量回写） */
  aliases: string[]
  components: TemplateComponent[]
  /** 主题 id（阶段五才消费） */
  theme?: string
}

/** 模板文件统一放在库的 `.ocstudio/templates/` 下（随库走、可分享） */
export const TEMPLATE_DIR = '.ocstudio/templates'

/** 磁盘上模板文件的相对路径 */
export function templatePath(id: string): string {
  return `${TEMPLATE_DIR}/${id}.md`
}
