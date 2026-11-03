/**
 * 小说在库里的归属标记。
 *
 * 章节就是 `worldEntries`（`docs/小说.md` §1–§2），但**不属于世界观**：
 * 默认不进世界观目录树、不进关系图、不进相册（同文档 §6 风险条）。
 * 判定集中在这里，避免各处各写一个字符串比较。
 */
export const NOVEL_CATEGORY = '小说'

export function isNovelEntry(entry: { category?: string | null }): boolean {
  return (entry.category ?? '') === NOVEL_CATEGORY
}
