/**
 * 关系线配色与箭头 —— 唯一源。
 *
 * 色值不在这里，在 `globals.css` 的 `--oc-accent-1..12`（亮暗两套都验过 ≥ 4.5:1，
 * 因为**关系名与线条同色**，文字也是这个颜色）。组件只拿 `var(--oc-accent-N)`，
 * 不写裸十六进制 —— `npm run audit:design` 会拦。
 *
 * 落盘（阶段二·二）：`关系: [{ 类型, 目标, 名称, 颜色, 箭头 }]`
 * - `颜色` 存**中文名**（`苔绿`），人可读，Obsidian 里也能看懂；缺省 = 走中性线色
 * - `箭头` 取下面四个英文值（与 `none/forward/reverse/both` 一一对应）
 */
export interface RelationColor {
  /** 落盘用的名字，也是面板上显示的名字 */
  name: string
  /** CSS 变量名（不带 var()） */
  token: string
}

export const RELATION_COLORS: readonly RelationColor[] = [
  { name: '赤陶', token: '--oc-accent-1' },
  { name: '琥珀', token: '--oc-accent-2' },
  { name: '苔绿', token: '--oc-accent-3' },
  { name: '松绿', token: '--oc-accent-4' },
  { name: '靛蓝', token: '--oc-accent-5' },
  { name: '紫罗兰', token: '--oc-accent-6' },
  { name: '玫瑰', token: '--oc-accent-7' },
  { name: '赭石', token: '--oc-accent-8' },
  { name: '青灰', token: '--oc-accent-9' },
  { name: '雾紫', token: '--oc-accent-10' },
  { name: '麦金', token: '--oc-accent-11' },
  { name: '石墨', token: '--oc-accent-12' },
] as const

/** 没选颜色时的连线色：中性线色，和图纸上的默认边一致 */
export const RELATION_EDGE_DEFAULT = 'var(--oc-line-hover)'

export type RelationArrow = 'none' | 'forward' | 'reverse' | 'both'

export const RELATION_ARROWS: ReadonlyArray<{
  value: RelationArrow
  label: string
  glyph: string
}> = [
  { value: 'none', label: '无箭头', glyph: '—' },
  { value: 'forward', label: '正向', glyph: '→' },
  { value: 'reverse', label: '反向', glyph: '←' },
  { value: 'both', label: '双向', glyph: '↔' },
] as const

/** 角色之间的关系默认双向；归属 / 参与那两类由调用方显式传 none */
export const DEFAULT_RELATION_ARROW: RelationArrow = 'both'

/** 名字 → CSS 色值；未知或空一律回中性线色（不猜色） */
export function relationColorValue(name: unknown): string {
  if (typeof name !== 'string') return RELATION_EDGE_DEFAULT
  const hit = RELATION_COLORS.find((item) => item.name === name)
  return hit ? `var(${hit.token})` : RELATION_EDGE_DEFAULT
}

/** 收敛非法颜色：只接受色板里的名字，其余返回 undefined（= 中性线色） */
export function normalizeRelationColor(value: unknown): string | undefined {
  return typeof value === 'string' && RELATION_COLORS.some((item) => item.name === value)
    ? value
    : undefined
}

/** 收敛非法箭头：四档之外一律回默认值 */
export function normalizeRelationArrow(value: unknown, fallback: RelationArrow = DEFAULT_RELATION_ARROW): RelationArrow {
  return value === 'none' || value === 'forward' || value === 'reverse' || value === 'both'
    ? value
    : fallback
}

/** 箭头在 SVG 里用哪一端 —— 供边组件按四档标记起止 marker */
export function arrowEnds(arrow: RelationArrow): { start: boolean; end: boolean } {
  return {
    start: arrow === 'reverse' || arrow === 'both',
    end: arrow === 'forward' || arrow === 'both',
  }
}
