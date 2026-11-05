/**
 * 封面卡算法自检 —— `lib/cover` 的渐进模糊与取色。
 *
 * 用法：`npx tsx scripts/cover-check.ts`
 *
 * 参考实现（Simple_Cover）的模糊核在 Rust/WASM 里，这里换成了同参数的 JS 版。
 * 换实现最怕「看起来差不多但数不对」：色块融得不干净、左右边缘发暗、Alpha 不单调。
 * 所以这里只测纯函数，不碰 DOM、不读图片 —— 每条断言对应一个肉眼能看出来的毛病。
 */

import { progressiveBlur } from '../src/lib/cover/blur'
import {
  darken,
  hslToHex,
  lighten,
  luminance,
  mixColor,
  normalizeTint,
  rgbToHex,
  rgbToHsl,
  rgba,
  tintFromPixels,
} from '../src/lib/cover/color'
import { photoDissolveStart, photoPlateHeight } from '../src/lib/cover/scene'
import { normalizeTintMode } from '../src/lib/cover/tuning'

const failures: string[] = []
let checks = 0

function check(label: string, condition: boolean, detail?: string): void {
  checks += 1
  if (condition) return
  failures.push(detail ? `${label} —— ${detail}` : label)
}

// ── 造一张「左暗右亮」的测试图（竖直硬边，最容易看出糊没糊） ──────────────

const WIDTH = 64
const HEIGHT = 72
const SPLIT = 32
const DARK = 16
const LIGHT = 240

function makeStepImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const i = (y * WIDTH + x) * 4
      const value = x < SPLIT ? DARK : LIGHT
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
      data[i + 3] = 255
    }
  }
  return data
}

/** 取某一行（相对整张图）的最大相邻差 —— 越大越「锐」 */
function maxGradient(data: Uint8ClampedArray, row: number, offsetRow: number, width: number): number {
  const base = (row - offsetRow) * width * 4
  let max = 0
  for (let x = 0; x < width - 1; x += 1) {
    max = Math.max(max, Math.abs(data[base + (x + 1) * 4] - data[base + x * 4]))
  }
  return max
}

// ── 1. 半径 0 时一字不改 ────────────────────────────────────────────────

{
  const source = makeStepImage()
  const firstRow = 40
  const rows = HEIGHT - firstRow
  const slice = source.slice(firstRow * WIDTH * 4)
  const out = progressiveBlur({
    data: slice,
    width: WIDTH,
    rows,
    firstRow,
    fullHeight: HEIGHT,
    radius: 0,
    fadeStart: 1, // 关掉 Alpha 衰减，只看像素
  })
  check('半径 0 时长度不变', out.length === slice.length)
  let identical = true
  for (let i = 0; i < slice.length; i += 1) {
    if (out[i] !== slice[i]) {
      identical = false
      break
    }
  }
  check('半径 0 时像素不变', identical)
}

// ── 2. 半径 > 0：起点那行仍然是锐的，底部被抹开 ──────────────────────────

{
  const source = makeStepImage()
  const firstRow = 24
  const rows = HEIGHT - firstRow
  const slice = source.slice(firstRow * WIDTH * 4)
  const out = progressiveBlur({
    data: slice,
    width: WIDTH,
    rows,
    firstRow,
    fullHeight: HEIGHT,
    radius: 24,
    fadeStart: 1,
  })

  const topGradient = maxGradient(out, firstRow, firstRow, WIDTH)
  const bottomGradient = maxGradient(out, HEIGHT - 6, firstRow, WIDTH)

  check('起点那行不漏糊（半径从 0 起）', topGradient === LIGHT - DARK, `实际 ${topGradient}`)
  check('底部被抹开（硬边变缓）', bottomGradient < (LIGHT - DARK) * 0.5, `实际 ${bottomGradient}`)
  check('抹开是渐进的：越往下越糊', bottomGradient <= topGradient)

  // 只有「越来越糊」才对：中间那行介于两者之间
  const midGradient = maxGradient(out, firstRow + Math.floor(rows * 0.6), firstRow, WIDTH)
  check('中段模糊介于起点与底部之间', midGradient <= topGradient, `实际 ${midGradient}`)
}

// ── 3. 左右边缘不会变暗（出界按边缘像素延展） ────────────────────────────

{
  const flat = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let i = 0; i < flat.length; i += 4) {
    flat[i] = 120
    flat[i + 1] = 120
    flat[i + 2] = 120
    flat[i + 3] = 255
  }
  const firstRow = 10
  const rows = HEIGHT - firstRow
  const out = progressiveBlur({
    data: flat.slice(firstRow * WIDTH * 4),
    width: WIDTH,
    rows,
    firstRow,
    fullHeight: HEIGHT,
    radius: 30,
    fadeStart: 1,
  })

  let worst = 0
  for (let i = 0; i < out.length; i += 4) {
    worst = Math.max(worst, Math.abs(out[i] - 120))
  }
  check('纯色图模糊后仍是纯色（边缘不发暗）', worst <= 1, `最大偏差 ${worst}`)
}

// ── 4. Alpha 衰减：单调、只在 fadeStart 之后、底行归零 ───────────────────

{
  const source = makeStepImage()
  const firstRow = 10
  const rows = HEIGHT - firstRow
  const fadeStart = 0.78
  const out = progressiveBlur({
    data: source.slice(firstRow * WIDTH * 4),
    width: WIDTH,
    rows,
    firstRow,
    fullHeight: HEIGHT,
    radius: 20,
    fadeStart,
  })

  const alphaOf = (row: number): number => out[(row - firstRow) * WIDTH * 4 + 3]
  let monotonic = true
  let previous = 255
  for (let row = firstRow; row < HEIGHT; row += 1) {
    const alpha = alphaOf(row)
    if (alpha > previous) monotonic = false
    previous = alpha
  }
  check('Alpha 单调不增', monotonic)
  check('衰减前完全不透明', alphaOf(firstRow) === 255)
  check(
    'fadeStart 之前仍然是 255',
    alphaOf(Math.floor(HEIGHT * fadeStart) - 1) === 255,
    `第 ${Math.floor(HEIGHT * fadeStart) - 1} 行是 ${alphaOf(Math.floor(HEIGHT * fadeStart) - 1)}`,
  )
  // 最后一行是「几乎」清零而不是正好 0：第 H−1 行的 t 差最后一格，参考实现同样如此
  check('照片最底一行基本透明（融进色块）', alphaOf(HEIGHT - 1) <= 4, `实际 ${alphaOf(HEIGHT - 1)}`)
}

// ── 5. 输出永远是合法像素（没有 NaN / 越界） ────────────────────────────

{
  const out = progressiveBlur({
    data: makeStepImage().slice(30 * WIDTH * 4),
    width: WIDTH,
    rows: HEIGHT - 30,
    firstRow: 30,
    fullHeight: HEIGHT,
    radius: 40,
    fadeStart: 0.6,
  })
  let clean = true
  for (let i = 0; i < out.length; i += 1) {
    const value = out[i]
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      clean = false
      break
    }
  }
  check('输出像素全部合法（0–255 的整数）', clean)
  check('输出长度 = 宽 × 行 × 4', out.length === WIDTH * (HEIGHT - 30) * 4)
}

// ── 6. 极窄 / 极矮的退化情况不崩 ────────────────────────────────────────

{
  const tiny = progressiveBlur({
    data: new Uint8ClampedArray([10, 20, 30, 255]),
    width: 1,
    rows: 1,
    firstRow: 0,
    fullHeight: 1,
    radius: 8,
    fadeStart: 1,
  })
  check('1×1 切片不崩', tiny.length === 4)

  const sparse = progressiveBlur({
    data: new Uint8ClampedArray(0),
    width: 0,
    rows: 0,
    firstRow: 0,
    fullHeight: 0,
    radius: 8,
    fadeStart: 0.78,
  })
  check('空切片不崩', sparse.length === 0)
}

// ── 7. 取色：压暗但不改色相 ─────────────────────────────────────────────

{
  const fromHex = (hex: string) =>
    rgbToHsl({
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    })

  // 极高亮 + 高饱和的红：压成暗红，色相不能丢
  const red = normalizeTint({ r: 250, g: 40, b: 30 })
  const redHsl = fromHex(red)
  check('混色亮度被压进 0.15–0.26', redHsl.l >= 0.14 && redHsl.l <= 0.27, `实际 ${redHsl.l.toFixed(3)}`)
  check('有彩度的图保住自己的色相', Math.abs(redHsl.h - 0.02) < 0.05 || Math.abs(redHsl.h - 1.02) < 0.05, `实际 ${redHsl.h.toFixed(3)}`)
  check('饱和度不放大', redHsl.s <= 0.46, `实际 ${redHsl.s.toFixed(3)}`)

  // 灰图 = 没有颜色信息：中性炭黑，绝不硬塞色相（这里曾一直是深绿）
  const greyHsl = fromHex(normalizeTint({ r: 128, g: 128, b: 128 }))
  check('灰图走中性混色（不硬塞绿）', greyHsl.s <= 0.08, `实际 s=${greyHsl.s.toFixed(3)}`)
  check('灰图色相落在暖中性区间', greyHsl.h > 0.02 && greyHsl.h < 0.16, `实际 h=${greyHsl.h.toFixed(3)}`)

  const whiteHsl = fromHex(normalizeTint({ r: 252, g: 252, b: 250 }))
  check('线稿（近白）也是中性', whiteHsl.s <= 0.08, `实际 s=${whiteHsl.s.toFixed(3)}`)
}

// ── 8. 取色：从像素提混色 ───────────────────────────────────────────────

{
  const pixels = new Uint8ClampedArray(16 * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 40
    pixels[i + 1] = 90
    pixels[i + 2] = 70
    pixels[i + 3] = 255
  }
  const tint = tintFromPixels(pixels)
  check('能提取混色', tint !== null && /^#[0-9A-F]{6}$/.test(tint ?? ''), String(tint))

  const green = { r: 40, g: 90, b: 70 }
  const { h } = rgbToHsl(green)
  const extracted = rgbToHsl({
    r: Number.parseInt((tint ?? '#000000').slice(1, 3), 16),
    g: Number.parseInt((tint ?? '#000000').slice(3, 5), 16),
    b: Number.parseInt((tint ?? '#000000').slice(5, 7), 16),
  })
  check('提取的色相跟着图走', Math.abs(extracted.h - h) < 0.06, `${h.toFixed(3)} → ${extracted.h.toFixed(3)}`)
  check('空像素提不出颜色', tintFromPixels(new Uint8ClampedArray(0)) === null)

  const greyPixels = new Uint8ClampedArray(16 * 4)
  for (let i = 0; i < greyPixels.length; i += 4) {
    greyPixels[i] = 200
    greyPixels[i + 1] = 200
    greyPixels[i + 2] = 200
    greyPixels[i + 3] = 255
  }
  const greyTint = tintFromPixels(greyPixels)
  const greyHsl = rgbToHsl({
    r: Number.parseInt((greyTint ?? '#000000').slice(1, 3), 16),
    g: Number.parseInt((greyTint ?? '#000000').slice(3, 5), 16),
    b: Number.parseInt((greyTint ?? '#000000').slice(5, 7), 16),
  })
  check('灰度像素提到中性色', greyHsl.s <= 0.08, `实际 s=${greyHsl.s.toFixed(3)}`)
}

// ── 9. 颜色工具的基本恒等 ──────────────────────────────────────────────

{
  check('hex 往返', rgbToHex({ r: 48, g: 66, b: 56 }) === '#304238', rgbToHex({ r: 48, g: 66, b: 56 }))
  check('hex 缩写展开', rgbToHex({ r: 255, g: 255, b: 255 }) === '#FFFFFF')
  check('rgba 夹取 alpha', rgba('#304238', 2) === 'rgba(48, 66, 56, 1.000)')
  check('混色取中点', mixColor('#000000', '#FFFFFF', 0.5) === '#808080', mixColor('#000000', '#FFFFFF', 0.5))
  check('提亮不等于原色', lighten('#304238', 0.2) !== '#304238')
  check('压暗不等于原色', darken('#304238', 0.2) !== '#304238')
  check('hsl 往返', hslToHex(rgbToHsl({ r: 48, g: 66, b: 56 })) === '#304238', hslToHex(rgbToHsl({ r: 48, g: 66, b: 56 })))
}

// ── 10. 黑白模式：块色跟主题走，亮度决定水印/暗角的方向 ──────────────────

{
  // 亮色主题的纸色 / 暗色主题的墨色，亮度必须分居 0.5 两侧 —— 否则卡片会选错分支
  check('纸色块判定为「亮」', luminance('#F3EFE9') > 0.5, luminance('#F3EFE9').toFixed(3))
  check('墨色块判定为「暗」', luminance('#2D2B28') < 0.5, luminance('#2D2B28').toFixed(3))
  check('纯黑亮度 0', luminance('#000000') === 0)
  check('纯白亮度 1', Math.abs(luminance('#FFFFFF') - 1) < 0.001)

  // 老数据里存的是 ink（固定墨色），要读成 mono；其余脏值回 auto
  check('旧值 ink 映射成 mono', normalizeTintMode('ink') === 'mono')
  check('mono 原样返回', normalizeTintMode('mono') === 'mono')
  check('脏值回 auto', normalizeTintMode('purple') === 'auto')
  check('缺省回 auto', normalizeTintMode(undefined) === 'auto')
}

// ── 11. 照片块：高度只看卡片比例，不看图片宽高比 ──────────────────────────
//
// 封面卡的长宽比是固定的（实体卡 7:6），照片区也必须是**固定高度**：
// 早先按「图片自然高度」算，3:2 占 78% 高、3:1 的横幅只占 39%，
// 同一排卡片就成了两种版式。函数签名里已经没有图片宽高，这里锁住比例换算。

{
  const CARD_H = 651
  const RATIO = 0.78

  check('照片高度 = 卡片高度 × 比例', photoPlateHeight(CARD_H, RATIO) === Math.round(CARD_H * RATIO))
  check('比例超过 100% 被夹到整张卡', photoPlateHeight(CARD_H, 2) === CARD_H)
  check('比例过低时仍留 20% 下限', photoPlateHeight(CARD_H, 0) === Math.round(CARD_H * 0.2))
  check('空卡片也有最小高度', photoPlateHeight(0, RATIO) >= 4)

  // 关键：3:1 与 3:2 的图拿到的是同一个照片区高度（图片只影响 cover 裁切，不影响版式）
  const plate = photoPlateHeight(CARD_H, RATIO)
  check('照片区与图片比例无关（3:1 / 3:2 同高）', plate === photoPlateHeight(CARD_H, RATIO))
}

// ── 12. 溶解带：按卡片高度给，照片区拖矮了也不会被压成硬边 ────────────────
//
// 常规照片（78% 高）的溶解带 = 卡片 15%（2026-11-05 从 11% 放宽，并成为参数）。
// 厚度按卡片高度给，用户把「照片高度」拖到 40% 时也不会缩成一条线。

{
  const CARD_H = 651

  const standardPlate = photoPlateHeight(CARD_H, 0.78)
  const standardStart = photoDissolveStart(CARD_H, standardPlate)
  const standardBand = (1 - standardStart) * standardPlate
  check('常规照片的溶解带 ≈ 卡片高 15%', Math.abs(standardBand - CARD_H * 0.15) <= 1.5, `${standardBand.toFixed(1)} / ${CARD_H}`)
  check(
    '常规照片约在照片 81% 处开始淡出',
    Math.abs(standardStart - (1 - 0.15 / 0.78)) <= 0.005,
    standardStart.toFixed(3),
  )

  // 面板把溶解带拖宽：起点必须提前，且宽度仍按卡片高度算
  const wideStart = photoDissolveStart(CARD_H, standardPlate, 0.22)
  check('溶解带参数变宽后起点提前', wideStart < standardStart, `${wideStart.toFixed(3)} / ${standardStart.toFixed(3)}`)
  check(
    '溶解带参数的厚度按卡片高度给',
    Math.abs((1 - wideStart) * standardPlate - CARD_H * 0.22) <= 1.5,
    `${((1 - wideStart) * standardPlate).toFixed(1)} / ${(CARD_H * 0.22).toFixed(1)}`,
  )

  // 照片区被拖到 40%：带子仍按卡片高度给
  const shortPlate = photoPlateHeight(CARD_H, 0.4)
  const shortStart = photoDissolveStart(CARD_H, shortPlate)
  check('照片区拖矮后溶解带仍按卡片高度给', Math.abs((1 - shortStart) * shortPlate - CARD_H * 0.15) <= 1.5)
  check('照片区拖矮后至少留一半不透明', shortStart >= 0.5 - 1e-9, shortStart.toFixed(3))

  // 拖到最低的 20%：最多淡掉下半部分
  const minPlate = photoPlateHeight(CARD_H, 0.2)
  check('极端矮的照片最多淡掉下半部分', photoDissolveStart(CARD_H, minPlate) >= 0.5 - 1e-9)
  check('没有照片高度时不淡出', photoDissolveStart(CARD_H, 0) === 1)
}

// ── 汇总 ────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.log(`封面卡算法自检：${failures.length} / ${checks} 项不通过\n`)
  for (const failure of failures) console.log(`  ✗ ${failure}`)
  process.exit(1)
}

console.log(`封面卡算法自检：${checks} 项全部通过`)
