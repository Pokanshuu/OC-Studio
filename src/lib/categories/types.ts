/**
 * 自定义分类 —— **分类 = 一个模板 + 一组笔记**。
 *
 * 宠物、武器这类东西不该是角色里的一个单选（`kind` 已整体删除），
 * 而应当是和「角色 / 事件 / 国家」并排的一类：自己有一个侧栏入口、
 * 自己的图标、自己绑定的模板。
 *
 * 条目**复用 `worldEntries`**（普通笔记）：分类只靠笔记上的 `category` 键区分，
 * 小说已经这么做了（`category: '小说'`）。所以这里没有新表、没有迁移，
 * 删掉一个分类也不会删掉笔记（只是它们不再出现在那个入口下）。
 *
 * 存哪：库内 `.ocstudio/categories.json`（随库走），浏览器预览退化成 localStorage。
 */
import type { CategoryIcon } from './icons'

export interface Category {
  /** 稳定 id（`cat-xxx`；内置分类固定 `cat-pet` / `cat-weapon`）；侧栏用 `分类:<id>` 定位 */
  id: string
  /** 显示名，同时是笔记 `category` 键的值 */
  name: string
  /** 绑定的模板 id/名（默认 `entry`） */
  template: string
  /** 图标（lucide 名字的子集，见 `icons.ts`） */
  icon: CategoryIcon
  /** 侧栏顺序 */
  order: number
  /** 是否出现在侧栏；内置分类默认关闭，用户按需启用 */
  enabled: boolean
  /** 内置预设分类（宠物 / 武器）：不可删除、名字固定，只能开关 */
  builtin?: boolean
}

export const CATEGORIES_REL_PATH = '.ocstudio/categories.json'

export function newCategoryId(): string {
  return `cat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/** 侧栏里表示「这个分类被选中」的 item 名 */
export function categoryItemName(id: string): string {
  return `分类:${id}`
}

export function isCategoryItem(item: string): boolean {
  return item.startsWith('分类:')
}

export function categoryIdFromItem(item: string): string {
  return item.slice('分类:'.length)
}
