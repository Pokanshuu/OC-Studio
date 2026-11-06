/**
 * 笔记的「归属类别」——决定它出现在哪些界面。
 *
 * 小说章节与地图都**是笔记**（`worldEntries`），但**不属于世界观目录**：
 * 默认不进词条树、不进相册（关系图同理）。判定集中在这里，避免各处写字符串比较。
 *
 * 地图现在也是「实体」：一条笔记 = 一张地图，底图路径与尺寸存在它自己的 frontmatter 上，
 * 实体锚点用 `map_id`（存地图的**名字**，因为 id 只在本次会话有效）指向它。
 */
export const NOVEL_CATEGORY = '小说'
export const MAP_CATEGORY = '地图'

export function isNovelEntry(entry: { category?: string | null }): boolean {
  return (entry.category ?? '') === NOVEL_CATEGORY
}

export function isMapEntry(entry: { category?: string | null }): boolean {
  return (entry.category ?? '') === MAP_CATEGORY
}

/** 世界观目录 / 相册 只收「设定类」条目 */
export function isCodexEntry(entry: { category?: string | null }): boolean {
  return !isNovelEntry(entry) && !isMapEntry(entry)
}

/**
 * 导航项里的「工具」——插件提供的功能面板（`工具:<插件 id>`）。
 *
 * 与 `分类:<id>` 同一套路：导航状态是一个字符串，靠前缀区分是哪一类视图。
 * 工具不是内容，所以不进词条树、不进相册、不落库。
 */
export const TOOL_PREFIX = '工具:'

export function toolItem(pluginId: string): string {
  return `${TOOL_PREFIX}${pluginId}`
}

export function isToolItem(item: string | null | undefined): boolean {
  return (item ?? '').startsWith(TOOL_PREFIX)
}

export function toolIdFromItem(item: string): string {
  return item.startsWith(TOOL_PREFIX) ? item.slice(TOOL_PREFIX.length) : ''
}
