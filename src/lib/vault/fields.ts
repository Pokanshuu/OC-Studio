import type { VaultStorableKind } from './types'

// ── frontmatter 词汇表（唯一源） ─────────────────────────────────────────
// 读与写共用这一张表，从结构上消除「导入器认一个键、导出器写另一个键」的漂移。
//
// 每个字段是一条**键链**：第一个是写回时使用的主键，其余只在读时回落，
// 用来吃下手工/AI 写出来的同义键（`阵营` / `faction`、`所属国家` / `country`）。
// 不在任何键链里的 frontmatter 键，写回时**一个字节都不动**（见 serialize.ts）。

export interface KeyChain {
  primary: string
  alt: readonly string[]
}

function chain(primary: string, ...alt: string[]): KeyChain {
  return { primary, alt }
}

/** 键链的全部键名（写回时用于判定「这个键由我们管理」） */
export function chainKeys(c: KeyChain): string[] {
  return [c.primary, ...c.alt]
}

export const CHARACTER_KEYS = {
  title: chain('title', 'name'),
  aliases: chain('aliases'),
  race: chain('race', '种族'),
  element: chain('element', '元素'),
  occupation: chain('occupation', '职业', '身份'),
  faction: chain('faction', '阵营'),
  country: chain('country', '所属国家', '国籍', 'nationality'),
  height: chain('height', '身高'),
  birthday: chain('birthday', '生日'),
  /** 简介：编辑器里的一行说明，既不是正文也不是标题，必须在 frontmatter 里有一格 */
  bio: chain('bio', '简介'),
  /** 旧版「人生故事」：早期版本的大段文本，编辑器已合并进正文展示，但数据不能丢 */
  lifeStory: chain('lifeStory', '人生故事'),
  isMajor: chain('isMajor', '主要角色'),
  avatar: chain('avatar', 'avatarUrl'),
  header: chain('header', 'headerUrl'),
  /** OC 动画（视频文件，存在库里附件目录） */
  animation: chain('animation', '动画'),
  gallery: chain('gallery'),
  avatars: chain('avatars'),
  relations: chain('relations'),
  /** 角色 → 笔记的命名关系（与笔记自身 relations 同形） */
  relatedNotes: chain('related_notes', '相关笔记'),
  tags: chain('tags'),
  order: chain('order', '排序'),
  /** 角色文件夹：只存文件夹**名字**（不是 id），空 = 未分组；删文件夹不删角色（见 docs/待设计决策清单 §2） */
  folder: chain('folder', '文件夹', '分类'),
  /** 关系图坐标：`{ x, y }`。只有用户拖过节点才有这个键 */
  graphPosition: chain('graph_position', 'graphPosition'),
  date: chain('date'),
  /**
   * 旧版武器 / 宠物标记（`kind` / `类别`）：只用于一次性导入，导入后清掉；
   * 不属于现行角色模型，但由序列化器持有，才能把盘上的旧键真正删掉。
   */
  legacyKind: chain('kind', '类别'),
} as const

export const COUNTRY_KEYS = {
  title: chain('title', 'name'),
  aliases: chain('aliases'),
  parent: chain('parent', '上级', '所属'),
  description: chain('description', '简介', '概述'),
  system: chain('system', '体制', '制度', '政体'),
  geography: chain('geography', '地理'),
  culture: chain('culture', '文化'),
  flag: chain('flag', 'flagUrl', '旗帜'),
  header: chain('header', 'headerUrl'),
  /** 图集（模板「画廊」组件的槽位） */
  gallery: chain('gallery'),
  // `characters` / `events` 两格**已退役**（阶段二·一）：成员关系只有实体侧一份
  // （`Character.countryId` / `Event.countries`），国家页的名单是查询结果。
  // 从词汇表里摘掉 = 既不读也不写；盘上遗留的键原样留着，一个字节都不动。
  tags: chain('tags'),
  order: chain('order', '排序'),
  /** 关系图坐标：`{ x, y }`。只有用户拖过节点才有这个键 */
  graphPosition: chain('graph_position', 'graphPosition'),
  /** 地图锚点：归一化 0–1，换分辨率不用重摆（docs/地图.md §2） */
  mapPosition: chain('map_position', 'mapPosition'),
  mapId: chain('map_id', 'mapId'),
  date: chain('date'),
} as const

export const EVENT_KEYS = {
  title: chain('title', 'name'),
  aliases: chain('aliases'),
  time: chain('time', '时间'),
  endTime: chain('endTime', '结束时间'),
  location: chain('location', '地点'),
  /** 概要：时间轴节点与列表上显示的那一行，正文之外唯一能塞它的地方 */
  summary: chain('summary', '概要'),
  isMajor: chain('isMajor', '重大'),
  parent: chain('parent', '父事件'),
  characters: chain('characters', '参与角色', '角色'),
  countries: chain('countries', '相关国家', '国家'),
  header: chain('header', 'headerUrl'),
  images: chain('images'),
  /** 事件之间的关联（与角色关系同形：{ name, relation }） */
  relations: chain('relations'),
  tags: chain('tags'),
  order: chain('order', '排序'),
  /** 关系图坐标：`{ x, y }`。只有用户拖过节点才有这个键 */
  graphPosition: chain('graph_position', 'graphPosition'),
  /** 地图锚点：归一化 0–1，换分辨率不用重摆（docs/地图.md §2） */
  mapPosition: chain('map_position', 'mapPosition'),
  mapId: chain('map_id', 'mapId'),
  date: chain('date'),
} as const

export const WORLD_KEYS = {
  title: chain('title', 'name'),
  aliases: chain('aliases'),
  category: chain('category', '分类'),
  /** 自定义分类里的文件夹（与角色的 folder 同名，**不能**再用「分类」） */
  folder: chain('folder', '文件夹'),
  /** 分类条目封面（3:2）；`封面图` 是手写常见写法，`封面` 留给小说根节点 */
  cover: chain('cover', '封面图'),
  /**
   * 模板组件的图片 / 时间 / 地点槽位（2026-11-06 新增）。
   *
   * **不给中文别名**：中文键是用户自定义字段最常用的写法（「时间」「地点」「图片」），
   * 认作同义词会让同一份 frontmatter 键有两个主人 —— 自定义字段那边一写就把组件值盖掉。
   * 自定义字段与词汇表撞名时以第一类列为准（scan / serialize 的 readCustomFields 会跳过）。
   */
  avatar: chain('avatar'),
  image: chain('image'),
  gallery: chain('gallery'),
  time: chain('time'),
  endTime: chain('endTime'),
  location: chain('location'),
  /** 一行简介：分类条目的副标题，也给列表摘要用 */
  summary: chain('summary', '简介'),
  /** 单篇笔记覆盖用的模板名（空 = 跟随所在分类 / 内置词条模板） */
  template: chain('template', '模板'),
  /** 笔记之间的命名关系（与角色 / 事件同形：`{ name, relation, color?, arrow? }`） */
  relations: chain('relations'),
  parent: chain('parent', '父词条'),
  order: chain('order', '排序'),
  isConcept: chain('isConcept', '概念'),
  /** 关系图坐标：只有分类条目进图并拖动过才有 */
  graphPosition: chain('graph_position', 'graphPosition'),
  /** 地图锚点：归一化 0–1，换分辨率不用重摆（docs/地图.md §2） */
  mapPosition: chain('map_position', 'mapPosition'),
  mapId: chain('map_id', 'mapId'),
  /** 小说作品信息（只有小说根节点会写；别的词条上不存在这些键） */
  novelAuthor: chain('novel_author', '作者'),
  novelSynopsis: chain('novel_synopsis', '作品简介'),
  novelTargetWords: chain('novel_target_words', '目标字数'),
  novelNotes: chain('novel_notes', '作品笔记'),
  /** 封面（2:3 槽位，见 docs/小说.md §9） */
  novelCover: chain('novel_cover', '封面'),
  /** 地图笔记：底图相对路径 + 像素尺寸（只有 category=地图 的条目会写） */
  mapImage: chain('map_image', '底图'),
  mapWidth: chain('map_width', '地图宽'),
  mapHeight: chain('map_height', '地图高'),
  /** 地图生成参数快照（JSON 字符串）+ 种子：重生成用 */
  mapSeed: chain('map_seed', '种子'),
  mapParams: chain('map_params', '生成参数'),
  /** 当前视图：切模式只是换 `map_image` 指向的文件，视图名必须记在自己的格子里 */
  mapMode: chain('map_mode', '视图'),
  /** 政治标注：国界多边形 / 道路折线（JSON，归一化坐标） */
  mapAnnotations: chain('map_annotations', '标注'),
  /** 章节大纲 / 备注（只有章节会写） */
  chapterOutline: chain('chapter_outline', '章节大纲'),
  tags: chain('tags'),
  date: chain('date'),
} as const

export const TAG_KEYS = {
  title: chain('title', 'name'),
  color: chain('color', '颜色'),
  category: chain('category', '分类'),
} as const

export const PERIOD_KEYS = {
  title: chain('title', 'name'),
  startTime: chain('startTime', '开始'),
  endTime: chain('endTime', '结束'),
  color: chain('color', '颜色'),
} as const

export const ALL_KEY_TABLES: Record<VaultStorableKind, Record<string, KeyChain>> = {
  character: CHARACTER_KEYS,
  country: COUNTRY_KEYS,
  event: EVENT_KEYS,
  worldEntry: WORLD_KEYS,
  tag: TAG_KEYS,
  period: PERIOD_KEYS,
}

/** 某实体类型下由我们管理的全部 frontmatter 键 */
export function ownedKeys(kind: VaultStorableKind): string[] {
  const table = ALL_KEY_TABLES[kind]
  const keys = new Set<string>()
  for (const c of Object.values(table)) {
    for (const key of chainKeys(c)) keys.add(key)
  }
  return [...keys]
}

// ── 读取原语 ────────────────────────────────────────────────────────────

function firstPresent(fm: Record<string, unknown>, c: KeyChain): unknown {
  for (const key of chainKeys(c)) {
    const value = fm[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export function readString(fm: Record<string, unknown>, c: KeyChain): string {
  const value = firstPresent(fm, c)
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function readStringList(fm: Record<string, unknown>, c: KeyChain): string[] {
  const value = firstPresent(fm, c)
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
      .map((item) => String(item).trim())
      .filter((item) => item !== '')
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter((item) => item !== '')
  }
  return []
}

export function readBool(fm: Record<string, unknown>, c: KeyChain): boolean {
  const value = firstPresent(fm, c)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return /^(true|yes|on|是|1)$/i.test(value.trim())
  return false
}

export function readNumber(fm: Record<string, unknown>, c: KeyChain): number | undefined {
  const value = firstPresent(fm, c)
  return toFinite(value)
}

function toFinite(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** `{ x, y }` 坐标（关系图位置）；缺一个轴就当没有 */
export function readPosition(
  fm: Record<string, unknown>,
  c: KeyChain,
): { x: number; y: number } | undefined {
  const value = firstPresent(fm, c)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const x = toFinite(record.x)
  const y = toFinite(record.y)
  if (x === undefined || y === undefined) return undefined
  return { x, y }
}

export function readTimestamp(
  fm: Record<string, unknown>,
  c: KeyChain,
  fallback: number,
): number {
  const value = firstPresent(fm, c)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const retry = Date.parse(value.replace(/[./]/g, '-'))
    if (!Number.isNaN(retry)) return retry
  }
  return fallback
}

/** 对象数组（如 relations / gallery），只保留对象元素 */
export function readObjects(
  fm: Record<string, unknown>,
  c: KeyChain,
): Record<string, unknown>[] {
  const value = firstPresent(fm, c)
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item),
  )
}

/** 兼容「字符串数组」与「对象数组」两种图片写法（历史数据两种都有） */
export function readImageList(
  fm: Record<string, unknown>,
  c: KeyChain,
): { url: string; caption: string }[] {
  const value = firstPresent(fm, c)
  if (!Array.isArray(value)) return []
  const out: { url: string; caption: string }[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item.trim() !== '') out.push({ url: item.trim(), caption: '' })
      continue
    }
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      const url = typeof record.url === 'string' ? record.url.trim() : ''
      if (url === '') continue
      const caption = typeof record.caption === 'string' ? record.caption : ''
      out.push({ url, caption })
    }
  }
  return out
}

// ── 写入原语 ────────────────────────────────────────────────────────────
// 空值一律**删除键**（不写 `race: ""`），保持 frontmatter 干净。

export function writeString(value: string | null | undefined): string | undefined {
  // 旧备份 / 手改过的行可能缺字段，这里必须容错：undefined 当成空串，
  // 否则 `.trim()` 直接抛错，整批落盘会一起失败（见 vault-persist 的 per-item 捕获）。
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? undefined : trimmed
}

export function writeStringList(value: string[] | null | undefined): string[] | undefined {
  const cleaned = (value ?? []).map((item) => (item ?? '').trim()).filter((item) => item !== '')
  return cleaned.length === 0 ? undefined : cleaned
}

export function writeBool(value: boolean): boolean | undefined {
  return value ? true : undefined
}

export function writeNumber(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value
}

/**
 * 关系图坐标落盘：保留 1 位小数（拖拽给的是 123.456789 这种），非法值当没有。
 * 键顺序固定 `{ x, y }` —— `sameDiskValue` 用 JSON 比较，顺序必须稳定。
 */
export function writePosition(
  value: { x: number; y: number } | undefined,
): { x: number; y: number } | undefined {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined
  return { x: Math.round(value.x * 10) / 10, y: Math.round(value.y * 10) / 10 }
}
