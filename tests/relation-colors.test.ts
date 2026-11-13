import { describe, expect, it } from 'vitest'
import {
  RELATION_COLORS,
  RELATION_EDGE_DEFAULT,
  arrowEnds,
  normalizeRelationArrow,
  normalizeRelationColor,
  relationColorValue,
} from '@/lib/relation-colors'

describe('relationColorValue', () => {
  it('色板里的名字映射到对应 CSS 变量', () => {
    expect(relationColorValue('苔绿')).toBe('var(--oc-accent-3)')
    expect(relationColorValue('石墨')).toBe('var(--oc-accent-12)')
  })

  it('未知颜色 / 空值 / 非字符串一律回中性线色', () => {
    expect(relationColorValue('不存在')).toBe(RELATION_EDGE_DEFAULT)
    expect(relationColorValue('')).toBe(RELATION_EDGE_DEFAULT)
    expect(relationColorValue(undefined)).toBe(RELATION_EDGE_DEFAULT)
    expect(relationColorValue(42)).toBe(RELATION_EDGE_DEFAULT)
  })

  it('色板是 12 档且名字唯一', () => {
    expect(RELATION_COLORS).toHaveLength(12)
    expect(new Set(RELATION_COLORS.map((color) => color.name)).size).toBe(12)
    expect(new Set(RELATION_COLORS.map((color) => color.token)).size).toBe(12)
  })
})

describe('normalizeRelationColor', () => {
  it('只接受色板里的名字', () => {
    expect(normalizeRelationColor('玫瑰')).toBe('玫瑰')
    expect(normalizeRelationColor('石榴红')).toBeUndefined()
    expect(normalizeRelationColor(null)).toBeUndefined()
  })
})

describe('normalizeRelationArrow', () => {
  it('四档原样返回', () => {
    expect(normalizeRelationArrow('none')).toBe('none')
    expect(normalizeRelationArrow('forward')).toBe('forward')
    expect(normalizeRelationArrow('reverse')).toBe('reverse')
    expect(normalizeRelationArrow('both')).toBe('both')
  })

  it('非法值回退到默认（both），也可显式指定其它回退值', () => {
    expect(normalizeRelationArrow('up')).toBe('both')
    expect(normalizeRelationArrow(undefined)).toBe('both')
    expect(normalizeRelationArrow('', 'none')).toBe('none')
  })
})

describe('arrowEnds', () => {
  it('四档各自对应起止端点', () => {
    expect(arrowEnds('none')).toEqual({ start: false, end: false })
    expect(arrowEnds('forward')).toEqual({ start: false, end: true })
    expect(arrowEnds('reverse')).toEqual({ start: true, end: false })
    expect(arrowEnds('both')).toEqual({ start: true, end: true })
  })
})
