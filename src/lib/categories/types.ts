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

/**
 * 内置目录名 —— **不能拿来当自定义分类的名字**。
 *
 * 分类的显示名同时就是笔记 `category` 键的值（见文件头），而小说 / 地图这些内置目录
 * 用的是同一个键：小说根与章节都写着 `category: '小说'`。所以建一个叫「小说」的
 * 自定义分类，等于给同一批数据再开一个入口 —— 侧栏多出一项，点进去是一张平铺的
 * 列表，看起来像小说页却又不是（2026-11-11 助手就是这么把库弄乱的）。
 *
 * 这里只拦「名字完全等于内置目录」的情况；「小说草稿」「我的地图」这些不冲突。
 */
export const RESERVED_CATEGORY_NAMES = ['小说', '地图', '角色', '事件', '国家', '词条', '世界观'] as const

export function isReservedCategoryName(name: string): boolean {
  const trimmed = name.trim()
  return (RESERVED_CATEGORY_NAMES as readonly string[]).includes(trimmed)
}

/** 不能用这个名字的理由；空串 = 可以用 */
export function reservedCategoryReason(name: string): string {
  const trimmed = name.trim()
  if (!isReservedCategoryName(trimmed)) return ''
  return `「${trimmed}」是内置目录的名字，不能用作自定义分类（那批笔记已经由内置页面管了）。换个名字，比如「${trimmed}草稿」。`
}

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
