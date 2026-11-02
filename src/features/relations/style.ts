'use client'

/**
 * 关系线固定配色与箭头方向。
 * 颜色只用于连线描边与标签文字，保证二者始终同色。
 */
export const RELATION_COLORS = [
  { name: '赤陶', value: '#B36651' },
  { name: '琥珀', value: '#C68D44' },
  { name: '苔绿', value: '#8FA36B' },
  { name: '松绿', value: '#5E8B74' },
  { name: '靛蓝', value: '#6A8FA8' },
  { name: '紫罗兰', value: '#7C7BA8' },
  { name: '玫瑰', value: '#9C6B7D' },
  { name: '赭石', value: '#A77B62' },
  { name: '青灰', value: '#6E8B8B' },
  { name: '雾紫', value: '#8B7BA8' },
  { name: '麦金', value: '#B08A5A' },
  { name: '石墨', value: '#7A7A72' },
] as const

export const DEFAULT_RELATION_COLOR = '#8C877E'

export type RelationArrow = 'none' | 'forward' | 'reverse' | 'both'

export const DEFAULT_RELATION_ARROW: RelationArrow = 'none'

export const RELATION_ARROW_OPTIONS: Array<{
  value: RelationArrow
  label: string
  glyph: string
  hint: string
}> = [
  { value: 'none', label: '无箭头', glyph: '—', hint: '两端都不显示箭头' },
  { value: 'forward', label: '正向', glyph: '→', hint: '箭头指向终点' },
  { value: 'reverse', label: '反向', glyph: '←', hint: '箭头指向起点' },
  { value: 'both', label: '双向', glyph: '↔', hint: '两端都有箭头' },
]

const COLOR_VALUES = new Set<string>(RELATION_COLORS.map((item) => item.value))

export function resolveRelationColor(value: unknown): string {
  return typeof value === 'string' && COLOR_VALUES.has(value)
    ? value
    : DEFAULT_RELATION_COLOR
}

export function resolveRelationArrow(value: unknown): RelationArrow {
  return value === 'forward' || value === 'reverse' || value === 'both' || value === 'none'
    ? value
    : DEFAULT_RELATION_ARROW
}
