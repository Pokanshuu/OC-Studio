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
