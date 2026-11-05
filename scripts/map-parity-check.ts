/**
 * 地图内核对等自检：`npx tsx scripts/map-parity-check.ts`（`npm run audit:mapkernel`）
 *
 * 为什么需要它：`src/plugins/map-generator/kernel/` 是**搬来的**算法，不是我们写的。
 * 搬的过程中很容易被「顺手清理」—— 改个变量名、删一行看着没用的常量，编译器不会
 * 报错，但同一颗种子会长出另一块大陆。2026-11-05 就发生过：`climate.ts` 少了
 * `const latAbs = Math.abs(lat)`、`terrain.ts` 的变量被改名，结果海拔 / 水系 /
 * 气候全部对不上改版（见下面的基线值）。
 *
 * 这个脚本把**改版原始内核**在同一颗种子下的输出指纹钉死在这里。指纹一致 =
 * 位运算层面等价，不是「看起来差不多」。
 *
 * 基线取自 `D:\Codes\oc_editor\src\features\map\generator\`（v0.18.3 的 generator），
 * 种子 `20261105`、参数 `{ kind: 'world', width: 320, height: 200 }`（归一化到 512×512）。
 * 上游更新算法时：跑一遍旧内核拿到新指纹，再改这里的常量 —— 改之前先想清楚
 * 这是不是有意的行为变化。
 */
import { generateWorld } from '../src/plugins/map-generator/kernel/index'

const SEED = 20261105
const PARAMS = { kind: 'world', width: 320, height: 200 }

const EXPECTED = {
  size: [512, 512],
  elev: '25be9ffd',
  water: '3e399264',
  land: 420258,
  rivers: 13291,
  lakes: 4,
  meanT: 17833473,
  meanP: 907430267,
  biomeCount: 12,
}

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

function main(): void {
  const out = generateWorld(SEED, PARAMS as never)
  const terrain = out.state.terrain
  const stats = out.stats

  const elevationBytes = new Uint8Array(
    terrain.elevation.buffer,
    terrain.elevation.byteOffset,
    terrain.elevation.byteLength,
  )

  check('画布尺寸', terrain.width === EXPECTED.size[0] && terrain.height === EXPECTED.size[1], `${terrain.width}×${terrain.height}`)

  const elev = fnv(elevationBytes)
  check('海拔缓冲逐字节一致', elev === EXPECTED.elev, `${elev} ≠ ${EXPECTED.elev}`)

  const water = fnv(out.state.hydrology.water)
  check('水系掩码逐字节一致', water === EXPECTED.water, `${water} ≠ ${EXPECTED.water}`)

  check('陆地占比一致', Math.round(stats.landRatio * 1e6) === EXPECTED.land, String(Math.round(stats.landRatio * 1e6)))
  check('河流格数一致', stats.riverCells === EXPECTED.rivers, String(stats.riverCells))
  check('湖泊数一致', stats.lakeCount === EXPECTED.lakes, String(stats.lakeCount))
  check(
    '平均温度一致',
    Math.round(stats.meanTemperature * 1e6) === EXPECTED.meanT,
    String(Math.round(stats.meanTemperature * 1e6)),
  )
  check(
    '平均降水一致',
    Math.round(stats.meanPrecipitation * 1e6) === EXPECTED.meanP,
    String(Math.round(stats.meanPrecipitation * 1e6)),
  )
  check('生物群系数一致', stats.biomeCount === EXPECTED.biomeCount, String(stats.biomeCount))

  // 同一颗种子必须可复现：跑第二遍应与第一遍完全一样（没有 Math.random 混进来）
  const again = generateWorld(SEED, PARAMS as never)
  const againBytes = new Uint8Array(
    again.state.terrain.elevation.buffer,
    again.state.terrain.elevation.byteOffset,
    again.state.terrain.elevation.byteLength,
  )
  check('同种子可复现', fnv(againBytes) === elev)

  // 换种子必须真的换一块地（否则「随机」是假的）
  const other = generateWorld(SEED + 1, PARAMS as never)
  const otherBytes = new Uint8Array(
    other.state.terrain.elevation.buffer,
    other.state.terrain.elevation.byteOffset,
    other.state.terrain.elevation.byteLength,
  )
  check('换种子会换地图', fnv(otherBytes) !== elev)

  console.log(`地图内核对等自检：${passed} 项断言通过`)
}

main()
