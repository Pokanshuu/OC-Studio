import { describe, expect, it } from 'vitest'
import { isLatinQuery, pinyinInitial, pinyinInitials } from '@/lib/pinyin-initials'

describe('pinyinInitials', () => {
  it('按字符取拼音首字母，非汉字跳过', () => {
    expect(pinyinInitials('艾拉')).toBe('al')
    expect(pinyinInitials('北境')).toBe('bj')
    expect(pinyinInitials('艾拉 Alice')).toBe('al')
    expect(pinyinInitials('第 1 章')).toBe('dz')
    expect(pinyinInitials('')).toBe('')
  })

  it('多音字取 ICU 选定的读音，与姓氏读音可能不同', () => {
    expect(pinyinInitial('曾')).toBe('c')
    expect(pinyinInitial('单')).toBe('d')
    expect(pinyinInitial('查')).toBe('c')
  })

  it('每个首字母锚点都落在本组（表写错会在这里暴露）', () => {
    const anchors: Array<[string, string]> = [
      ['a', '阿'], ['b', '八'], ['c', '擦'], ['d', '搭'], ['e', '鹅'], ['f', '发'],
      ['g', '噶'], ['h', '哈'], ['j', '击'], ['k', '喀'], ['l', '拉'], ['m', '妈'],
      ['n', '拿'], ['o', '哦'], ['p', '啪'], ['q', '七'], ['r', '然'], ['s', '撒'],
      ['t', '他'], ['w', '挖'], ['x', '昔'], ['y', '压'], ['z', '匝'],
    ]
    for (const [letter, anchor] of anchors) {
      expect(pinyinInitial(anchor), `锚点「${anchor}」应属于 ${letter}`).toBe(letter)
    }
  })

  it('ICU 未收录的罕用字返回空串，不猜测字母', () => {
    expect(pinyinInitial('㐀')).toBe('')
  })

  it('非汉字返回空串', () => {
    expect(pinyinInitial('A')).toBe('')
    expect(pinyinInitial('1')).toBe('')
    expect(pinyinInitial('あ')).toBe('')
    expect(pinyinInitial('〇')).toBe('')
  })

  it('只有纯拉丁字母的查询才尝试首字母匹配', () => {
    expect(isLatinQuery('al')).toBe(true)
    expect(isLatinQuery('AL')).toBe(true)
    expect(isLatinQuery('a1')).toBe(false)
    expect(isLatinQuery('艾')).toBe(false)
    expect(isLatinQuery('')).toBe(false)
  })
})
