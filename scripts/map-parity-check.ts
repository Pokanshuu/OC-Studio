/**
 * 地图内核对等自检：`npx tsx scripts/map-parity-check.ts`（`npm run audit:mapkernel`）
 *
 * 为什么需要它：`src/plugins/map-generator/kernel/` 是**搬来的**算法，不是我们写的。
 * 搬的过程中很容易被「顺手清理」—— 改个变量名、删一行看着没用的常量，编译器不会
 * 报错，但同一颗种子会长出另一块大陆。2026-11-05 就发生过：`climate.ts` 少了
 * `const latAbs = Math.abs(lat)`、`terrain.ts` 的变量被改名，结果海拔 / 水系 /
 * 气候全部对不上改版。
 *
 * 基线取自 `D:\Codes\oc_editor\src\features\map\generator\`（v0.18.3 的 generator），
 * 种子 `77001`，六组参数覆盖四种大陆预设 + 区域图 + 极端值。
 * 指纹一致 = **位运算层面**等价，不是「看起来差不多」。
 *
 * 上游更新算法时：先跑一遍旧内核拿到新指纹，再改这里的常量 —— 改之前先想清楚
 * 这是不是有意的行为变化。
 */
import { generateWorld } from '../src/plugins/map-generator/kernel/index'
import type { WorldMapParams } from '../src/plugins/map-generator/types'

const SEED = 77001

const BASE: WorldMapParams = {
  kind: 'world',
  width: 320,
  height: 320,
  landCoverage: 0.42,
  mountainStrength: 0.55,
  plateauStrength: 0.5,
  plainBias: 0,
  lakeDensity: 0.5,
  lakeMinArea: 0.0002,
  lakeMaxArea: 0.01,
  temperatureOffset: 0,
  moistureBias: 0,
  riverDensity: 0.5,
  latitudeSpan: 150,
}

interface Case {
  name: string
  params: WorldMapParams
  /** 归一化后的画布尺寸 */
  size: string
  elev: string
  water: string
  land: number
  rivers: number
  lakes: number
}

const CASES: Case[] = [
  { name: '世界 · 地球型', params: { ...BASE }, size: '512x512', elev: 'b7a74865', water: '8fe4a359', land: 419937, rivers: 12808, lakes: 9 },
  { name: '世界 · 三大陆', params: { ...BASE, terrainPreset: 'three-continents' }, size: '512x512', elev: 'aadcc2a9', water: 'dab4d20e', land: 419758, rivers: 13344, lakes: 11 },
  { name: '世界 · 群岛', params: { ...BASE, terrainPreset: 'islands' }, size: '512x512', elev: 'c4a1a700', water: '84db8bf9', land: 420200, rivers: 11767, lakes: 11 },
  { name: '世界 · 泛大陆', params: { ...BASE, terrainPreset: 'pangaea' }, size: '512x512', elev: 'a1f1f96', water: '42f6a89a', land: 420048, rivers: 11738, lakes: 9 },
  { name: '区域图', params: { ...BASE, kind: 'region' }, size: '512x512', elev: 'b7a74865', water: '8fe4a359', land: 419937, rivers: 12808, lakes: 9 },
  {
    name: '极端值',
    params: {
      ...BASE,
      landCoverage: 0.2,
      mountainStrength: 0.9,
      lakeDensity: 0.9,
      riverDensity: 0.9,
      latitudeSpan: 60,
      temperatureOffset: 8,
      moistureBias: -0.8,
    },
    size: '512x512',
    elev: '55a49815',
    water: '4d9d0af6',
    land: 200024,
    rivers: 3274,
    lakes: 2,
  },
]

let passed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    return
  }
  console.error(`  FAIL ${name}${detail ? `：${detail}` : ''}`)
  process.exitCode = 1
}

/** FNV-1a：够用来发现「位不一样」，不需要密码学强度 */
function fnv(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16)
}

function bytesOf(view: Int16Array | Uint8Array): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

function main(): void {
  const elevations = new Map<string, string>()

  for (const item of CASES) {
    const out = generateWorld(SEED, item.params)
    const terrain = out.state.terrain

    check(`${item.name} · 画布尺寸`, `${terrain.width}x${terrain.height}` === item.size, `${terrain.width}x${terrain.height}`)

    const elev = fnv(bytesOf(terrain.elevation))
    elevations.set(item.name, elev)
    check(`${item.name} · 海拔逐字节一致`, elev === item.elev, `${elev} ≠ ${item.elev}`)

    const water = fnv(bytesOf(out.state.hydrology.water))
    check(`${item.name} · 水系逐字节一致`, water === item.water, `${water} ≠ ${item.water}`)

    check(`${item.name} · 陆地占比`, Math.round(out.stats.landRatio * 1e6) === item.land, String(Math.round(out.stats.landRatio * 1e6)))
    check(`${item.name} · 河流格数`, out.stats.riverCells === item.rivers, String(out.stats.riverCells))
    check(`${item.name} · 湖泊数`, out.stats.lakeCount === item.lakes, String(out.stats.lakeCount))
  }

  // 四种预设必须真的长出四种不同的大陆 —— 否则「预设」只是换了个名字
  const presets = ['世界 · 地球型', '世界 · 三大陆', '世界 · 群岛', '世界 · 泛大陆']
  check('四种大陆预设互不相同', new Set(presets.map((name) => elevations.get(name))).size === 4)

  // 同种子必须可复现（没有 Math.random / 时间混进来）
  const again = generateWorld(SEED, BASE)
  check('同种子可复现', fnv(bytesOf(again.state.terrain.elevation)) === elevations.get('世界 · 地球型'))

  // 换种子必须真的换一块地
  const other = generateWorld(SEED + 1, BASE)
  check('换种子会换地图', fnv(bytesOf(other.state.terrain.elevation)) !== elevations.get('世界 · 地球型'))

  console.log(`地图内核对等自检：${passed} 项断言通过`)
}

main()
