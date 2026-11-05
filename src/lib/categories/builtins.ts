/**
 * 内置分类（出厂定义）—— **带上，但不默认启用**。
 *
 * 宠物 / 武器在 `docs/模板.md` 里不是角色的一个单选，而是「分类 = 模板 + 一组笔记」。
 * 但大多数库不需要它们，所以不预建在侧栏里：用户在 设置 › 世界 › 自定义分类 里
 * 打开「宠物」或「武器」，才会出现入口。
 *
 * 两个分类各绑一个同名内置模板（`lib/templates/defaults.ts` 的 `pet` / `weapon`）；
 * id 稳定，分类文件里写的是这个 id，改名字不会丢分类（名字仍固定，见 store.updateCategory）。
 */
import type { Category } from './types'

export const BUILTIN_CATEGORY_IDS = {
  pet: 'cat-pet',
  weapon: 'cat-weapon',
} as const

export const BUILTIN_CATEGORIES: Category[] = [
  {
    id: BUILTIN_CATEGORY_IDS.pet,
    name: '宠物',
    template: 'pet',
    icon: 'pawPrint',
    order: 1000,
    enabled: false,
    builtin: true,
  },
  {
    id: BUILTIN_CATEGORY_IDS.weapon,
    name: '武器',
    template: 'weapon',
    icon: 'swords',
    order: 1001,
    enabled: false,
    builtin: true,
  },
]

/** 内置分类的 id 集合（保存 / 删除前判断用） */
export const BUILTIN_CATEGORY_ID_SET = new Set(BUILTIN_CATEGORIES.map((category) => category.id))
