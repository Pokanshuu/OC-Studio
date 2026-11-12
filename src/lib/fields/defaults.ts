import type { FieldConfig, FieldDef, FieldKind } from './types'

/**
 * 内置字段目录 —— 表单上「可以出现」的全部行（不在这里的东西没有行：正文、关系、图片）。
 *
 * 顺序即默认顺序；`id` 必须与实体列名一致（`Character.race` / `Event.time` / …），
 * 因为值永远从列里读、写回列里去。删掉某一行只是把 `id` 从配置里去掉，列还在。
 */
export const BUILTIN_FIELDS: Record<FieldKind, FieldDef[]> = {
  character: [
    { id: 'aliases', label: '别名', type: 'text' },
    { id: 'race', label: '种族', type: 'text' },
    { id: 'element', label: '元素', type: 'text' },
    { id: 'occupation', label: '职业', type: 'text' },
    { id: 'faction', label: '阵营', type: 'text' },
    { id: 'country', label: '国籍', type: 'country' },
    { id: 'height', label: '身高', type: 'text' },
    { id: 'birthday', label: '生日', type: 'text' },
    { id: 'isMajor', label: '主要角色', type: 'bool' },
  ],
  // 时间 / 结束时间 / 地点**是**基本信息里的行（2026-11-10 收回）：值仍写 `Event.time` /
  // `endTime` / `location`，控件由 `EventInfoSection` 按列名特判成「年 / 月 / 日」三段。
  // 独立的「时间 / 地点」组件已退役 —— 同一份数据只能有一个入口，也不能随模板开关漂移。
  // 标签仍然归「标签」组件，不在这里。
  event: [
    { id: 'time', label: '时间', type: 'text' },
    { id: 'endTime', label: '结束时间', type: 'text' },
    { id: 'location', label: '地点', type: 'text' },
    { id: 'isMajor', label: '重大事件', type: 'bool' },
  ],
  // 国家：体制 / 地理 / 文化已经并进正文，没有内置列可编；这里只放自建字段
  country: [],
  // 词条没有全局字段：它的字段来自「按篇选的模板」里的基本信息组件（见 `docs/模板.md` §6.2）
  worldEntry: [],
}

/**
 * 出厂自带的**自建字段**（值落实体 `custom`，frontmatter 写同名键）。
 *
 * 和 `BUILTIN_FIELDS` 分开：后者是「实体本来就有列」的字段，前者只是默认配置里的
 * 普通自建字段 —— 用户可以删、可以改名，删了不会从列里丢数据。
 *
 * 国家这组是 2026-11-13 补的：建立 / 结束时间、政体、首都、官方语言、货币都是国家
 * 的短事实，适合放在基本信息里；「政治制度 / 地理环境 / 人文风貌」的长文仍归正文。
 * `政体` 的键刻意用 `政体类型`，避开 `vault/fields.ts` 里 `system` 的读别名「政体」。
 */
export const DEFAULT_CUSTOM_FIELDS: Partial<Record<FieldKind, FieldDef[]>> = {
  country: [
    { id: 'f_country_founded', label: '建立时间', type: 'time', key: '建立时间' },
    { id: 'f_country_dissolved', label: '结束时间', type: 'time', key: '结束时间' },
    { id: 'f_country_regime', label: '政体', type: 'text', key: '政体类型' },
    { id: 'f_country_capital', label: '首都', type: 'text', key: '首都' },
    { id: 'f_country_language', label: '官方语言', type: 'text', key: '官方语言' },
    { id: 'f_country_currency', label: '货币', type: 'text', key: '货币' },
  ],
}

/** 默认配置 = 全部内置字段 + 出厂自建字段，默认顺序 */
export function defaultFields(kind: FieldKind): FieldDef[] {
  return BUILTIN_FIELDS[kind].map((field) => ({ ...field }))
}

export function defaultFieldConfig(): FieldConfig {
  const config = {} as FieldConfig
  for (const kind of Object.keys(BUILTIN_FIELDS) as FieldKind[]) {
    config[kind] = [
      ...defaultFields(kind),
      ...(DEFAULT_CUSTOM_FIELDS[kind] ?? []).map((field) => ({ ...field })),
    ]
  }
  return config
}

/** 某类实体里还没出现在配置中的内置字段（设置页「+ 添加字段」用） */
export function missingBuiltinFields(kind: FieldKind, current: FieldDef[]): FieldDef[] {
  const present = new Set(current.map((field) => field.id))
  return BUILTIN_FIELDS[kind].filter((field) => !present.has(field.id)).map((field) => ({ ...field }))
}
