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
  | 'avatar'
  | 'info'
  | 'relations'
  | 'tags'
  | 'image'
  | 'gallery'
  | 'portrait'
  | 'animation'
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
  /**
   * 文件结构版本（`版本:` 键）。旧文件没有这个键 = 0/1。
   * 只用来做**一次性的组件迁移**（立绘 / 动画组件化；时间 / 地点并回基本信息），
   * 补完随下次保存写成当前版本，之后用户再删掉也不会被加回来。
   */
  schema?: number
}

/**
 * 已退役的组件 id —— **只用于读旧文件**（`serialize.ts` 会放行，`store` 的升级会丢掉）。
 *
 * 它们不在 `COMPONENT_IDS` 里：不能新建、不能添加、不参与渲染。留这一份白名单，
 * 只为让旧模板里的这两块能被认出来再迁移，而不是在解析阶段被静默忽略
 * （静默忽略 = 词条的时间 / 地点从写作面上凭空消失，还找不到原因）。
 */
export const LEGACY_COMPONENT_IDS: readonly string[] = ['time', 'place']

/**
 * 当前模板文件结构版本。
 * - 2：立绘 / 动画组件化
 * - 3（2026-11-10）：时间 / 地点并回「基本信息」—— 两个组件退役，旧模板里的这两块
 *   在升级时移除；时间 / 地点的值一直在实体列上，没动过
 */
export const TEMPLATE_SCHEMA_VERSION = 3

/** 模板文件统一放在库的 `.ocstudio/templates/` 下（随库走、可分享） */
export const TEMPLATE_DIR = '.ocstudio/templates'

/**
 * id → 安全的文件名片段。
 *
 * `id` 可能来自 frontmatter（用户手写 / 别的工具生成），里面出现 `:` `?` `|`
 * 这类 Windows 不认的字符时，写盘会整批失败 —— 一条坏模板就让**所有**模板都改不了。
 * 这里只洗文件名，id 本身不动（模板里的 `id:` 仍原样保留，读回来靠 `sourcePaths` 对齐）。
 */
function safeFileId(id: string): string {
  const cleaned = id
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  return cleaned === '' ? 'template' : cleaned
}

/** 磁盘上模板文件的相对路径 */
export function templatePath(id: string): string {
  return `${TEMPLATE_DIR}/${safeFileId(id)}.md`
}
