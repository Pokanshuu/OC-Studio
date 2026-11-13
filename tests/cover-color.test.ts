import { describe, expect, it } from 'vitest'
import {
  NEUTRAL_TINT,
  contrastRatio,
  darken,
  hexToRgb,
  hslToHex,
  lighten,
  luminance,
  mixColor,
  mixRgb,
  normalizeTint,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  rgba,
  tintFromPixels,
} from '@/lib/cover/color'

function hslOf(hex: string) {
  return rgbToHsl(hexToRgb(hex))
}

describe('hexToRgb / rgbToHex', () => {
  it('解析 6 位与 3 位写法', () => {
    expect(hexToRgb('#2A2825')).toEqual({ r: 42, g: 40, b: 37 })
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('  #FF0000  ')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('非法输入回黑，不抛错', () => {
    expect(hexToRgb('not-a-color')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('输出大写十六进制并夹住越界通道', () => {
    expect(rgbToHex({ r: 42, g: 40, b: 37 })).toBe('#2A2825')
    expect(rgbToHex({ r: -20, g: 300, b: 12.6 })).toBe('#00FF0D')
  })
})

describe('mixColor', () => {
  it('amount 0 / 1 返回端点原色', () => {
    expect(mixColor('#000000', '#FFFFFF', 0)).toBe('#000000')
    expect(mixColor('#000000', '#FFFFFF', 1)).toBe('#FFFFFF')
  })

  it('0.5 取中点，amount 越界被夹住', () => {
    expect(mixColor('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(mixColor('#000000', '#FFFFFF', -1)).toBe('#000000')
    expect(mixColor('#000000', '#FFFFFF', 2)).toBe('#FFFFFF')
  })

  it('lighten 往暖白走、darken 往近黑走', () => {
    expect(luminance(lighten(NEUTRAL_TINT, 0.2))).toBeGreaterThan(luminance(NEUTRAL_TINT))
    expect(luminance(darken(NEUTRAL_TINT, 0.2))).toBeLessThan(luminance(NEUTRAL_TINT))
  })
})

describe('rgba', () => {
  it('按三通道拼 rgba，alpha 保留三位并夹在 0–1', () => {
    expect(rgba('#2A2825', 0.5)).toBe('rgba(42, 40, 37, 0.500)')
    expect(rgba('#2A2825', 5)).toBe('rgba(42, 40, 37, 1.000)')
    expect(rgba('#2A2825', -5)).toBe('rgba(42, 40, 37, 0.000)')
  })
})

describe('亮度与对比度', () => {
  it('未线性化亮度：纯白 1、纯黑 0', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 10)
    expect(luminance('#000000')).toBe(0)
  })

  it('WCAG 对比度：黑白 = 21，同色 = 1，且与顺序无关', () => {
    const white = hexToRgb('#FFFFFF')
    const black = hexToRgb('#000000')
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })

  it('相对亮度在 0–1 之间且随亮度单调', () => {
    const mid = relativeLuminance(hexToRgb('#808080'))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(relativeLuminance(hexToRgb('#FFFFFF'))).toBeCloseTo(1, 5)
    expect(relativeLuminance(hexToRgb('#000000'))).toBeCloseTo(0, 5)
  })
})

describe('mixRgb', () => {
  it('按 alpha 叠色，alpha 夹在 0–1', () => {
    expect(mixRgb({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0.5)).toEqual({ r: 50, g: 100, b: 25 })
    expect(mixRgb({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0)).toEqual({ r: 0, g: 0, b: 0 })
    expect(mixRgb({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 9)).toEqual({ r: 100, g: 200, b: 50 })
  })
})

describe('rgbToHsl / hslToHex', () => {
  it('灰阶饱和度为 0，色相为 0', () => {
    expect(hslOf('#808080').s).toBe(0)
    expect(hslOf('#808080').h).toBe(0)
    expect(hslOf('#808080').l).toBeCloseTo(128 / 255, 3)
  })

  it('原色色相落在对应区间', () => {
    expect(hslOf('#FF0000').h).toBeCloseTo(0, 3)
    expect(hslOf('#00FF00').h).toBeCloseTo(1 / 3, 3)
    expect(hslOf('#0000FF').h).toBeCloseTo(2 / 3, 3)
  })

  it('往返转换回到原色（±1）', () => {
    for (const hex of ['#2A2825', '#AC604B', '#557992', '#F3EFE9']) {
      expect(hslToHex(rgbToHsl(hexToRgb(hex)))).toBe(hex)
    }
  })
})

describe('normalizeTint', () => {
  it('无彩度的图转中性炭黑，不硬塞色相', () => {
    const tint = normalizeTint({ r: 128, g: 128, b: 128 })
    const { s, l } = hslOf(tint)
    expect(s).toBeLessThan(0.1)
    expect(l).toBeGreaterThanOrEqual(0.15)
    // 目标区间是 0.15–0.25；转成十六进制会四舍五入，留一点余量
    expect(l).toBeLessThan(0.26)
  })

  it('近白色虽然 HSL 饱和度不低，但按 max−min 判为无彩', () => {
    const tint = normalizeTint({ r: 252, g: 252, b: 250 })
    expect(hslOf(tint).s).toBeLessThan(0.1)
  })

  it('有彩度时保留色相，亮度压到 0.15–0.26', () => {
    const tint = normalizeTint({ r: 200, g: 60, b: 40 })
    const { h, l } = hslOf(tint)
    expect(h).toBeGreaterThan(0)
    expect(h).toBeLessThan(0.08)
    expect(l).toBeGreaterThanOrEqual(0.15)
    expect(l).toBeLessThanOrEqual(0.26)
  })
})

describe('tintFromPixels', () => {
  it('空数据返回 null', () => {
    expect(tintFromPixels(new Uint8ClampedArray(0))).toBeNull()
  })

  it('从像素里提色，结果仍是可用作底色的深色', () => {
    const pixels = new Uint8ClampedArray([
      200, 60, 40, 255,
      190, 70, 50, 255,
      180, 80, 60, 255,
    ])
    const tint = tintFromPixels(pixels)
    expect(tint).not.toBeNull()
    const { l } = hslOf(tint as string)
    expect(l).toBeGreaterThanOrEqual(0.15)
    expect(l).toBeLessThanOrEqual(0.26)
  })
})
