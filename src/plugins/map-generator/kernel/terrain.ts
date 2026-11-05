import type { WorldMapParams } from '../types'
import {
  SimplexNoise2D,
  clamp,
  fbm,
  ridgedFbm,
  smoothstep,
} from './noise'
import { generateTectonics, type Plate } from './tectonics'

const EARTH_CONTINENTS: Array<[number, number, number, number]> = [
  [-0.58, -0.24, 0.3, 0.32],
  [-0.3, 0.52, 0.24, 0.31],
  [0.28, -0.2, 0.43, 0.32],
  [0.2, 0.4, 0.26, 0.34],
  [0.72, 0.52, 0.17, 0.2],
  [0, 0.95, 0.64, 0.15],
]

const EARTH_ISLANDS: Array<[number, number, number]> = [
  [-0.78, 0.08, 0.055],
  [0.82, -0.48, 0.045],
  [0.04, -0.86, 0.04],
]

function radialLand(
  nx: number,
  ny: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  const dx = (nx - cx) / rx
  const dy = (ny - cy) / ry
  const distance = Math.sqrt(dx * dx + dy * dy)
  return 1 - smoothstep(0.78, 1.08, distance)
}

function presetLandMask(
  preset: string,
  nx: number,
  ny: number,
  x: number,
  y: number,
  noise: SimplexNoise2D,
  continental: number,
  medium: number,
): number {
  const edge =
    fbm(noise, x * 0.0058 + 21.1, y * 0.0058 - 12.4, 5) * 0.3 +
    fbm(noise, x * 0.016 - 6.8, y * 0.016 + 3.7, 3) * 0.12
  const warpedX =
    nx + fbm(noise, x * 0.0036 - 4.3, y * 0.0036 + 10.7, 4) * 0.22
  const warpedY =
    ny + fbm(noise, x * 0.0041 + 8.9, y * 0.0041 - 6.2, 4) * 0.22
  if (preset === 'earth') {
    let mask = 0
    for (const [cx, cy, rx, ry] of EARTH_CONTINENTS) {
      mask = Math.max(mask, radialLand(warpedX, warpedY, cx, cy, rx, ry))
    }
    for (const [cx, cy, radius] of EARTH_ISLANDS) {
      mask = Math.max(mask, radialLand(warpedX, warpedY, cx, cy, radius, radius) * 0.55)
    }
    return clamp(mask * 0.55 + continental * 0.2 + edge * 0.45, 0, 1)
  }
  if (preset === 'pangaea') {
    const core = radialLand(warpedX, warpedY, 0, 0.02, 0.78, 0.62)
    const lobe = radialLand(warpedX, warpedY, 0.35, 0.3, 0.4, 0.35) * 0.78
    return clamp(Math.max(core, lobe) * 0.72 + continental * 0.16 + edge * 0.42, 0, 1)
  }
  if (preset === 'three-continents') {
    let mask = 0
    const seeds: Array<[number, number, number, number]> = [
      [-0.52, -0.16, 0.35, 0.36],
      [0.52, -0.18, 0.36, 0.36],
      [0, 0.52, 0.34, 0.31],
    ]
    for (const [cx, cy, rx, ry] of seeds) {
      mask = Math.max(mask, radialLand(warpedX, warpedY, cx, cy, rx, ry))
    }
    mask = Math.max(mask, radialLand(warpedX, warpedY, -0.82, 0.52, 0.05, 0.05) * 0.5)
    mask = Math.max(mask, radialLand(warpedX, warpedY, 0.84, 0.5, 0.045, 0.045) * 0.45)
    return clamp(mask * 0.7 + continental * 0.16 + edge * 0.42, 0, 1)
  }
  if (preset === 'islands') {
    const grid = [
      [-0.82, -0.62, 0.11], [-0.48, -0.7, 0.08], [-0.12, -0.58, 0.12],
      [0.28, -0.68, 0.1], [0.68, -0.58, 0.09], [0.86, -0.18, 0.08],
      [-0.72, -0.2, 0.1], [-0.32, -0.12, 0.13], [0.08, -0.08, 0.1],
      [0.45, -0.14, 0.12], [0.78, 0.22, 0.08], [-0.55, 0.38, 0.12],
      [-0.18, 0.5, 0.09], [0.25, 0.42, 0.11], [0.56, 0.62, 0.1],
      [-0.85, 0.7, 0.07], [-0.35, 0.78, 0.08], [0.18, 0.78, 0.09],
      [0.7, 0.8, 0.07], [0.9, 0.58, 0.05],
    ]
    let mask = 0
    for (const [cx, cy, radius] of grid) {
      mask = Math.max(mask, radialLand(warpedX, warpedY, cx, cy, radius, radius))
    }
    return clamp(mask * 0.72 + medium * 0.18 + edge * 0.38, 0, 1)
  }
  return 0
}

export interface TerrainData {
  width: number
  height: number
  elevation: Int16Array
  
  mountainField: Float32Array
  plates: Plate[]
  minBase: number
  maxBase: number
  seaThreshold: number
}

function findThreshold(
  histogram: Uint32Array,
  min: number,
  max: number,
  targetFraction: number,
): number {
  const total = histogram.reduce((sum, value) => sum + value, 0)
  const target = total * targetFraction
  let running = 0
  for (let i = 0; i < histogram.length; i++) {
    running += histogram[i]
    if (running >= target) {
      return min + ((i + 0.5) / histogram.length) * (max - min)
    }
  }
  return max
}

export function generateTerrain(
  seed: number,
  params: WorldMapParams,
  onProgress?: (stage: string, value: number) => void,
): TerrainData {
  const width = params.width
  const height = params.height
  const cells = width * height
  const noise = new SimplexNoise2D(seed)
  const tectonics = generateTectonics(seed, params, onProgress)

  onProgress?.('Generating', 0.13)
  const base = new Float32Array(cells)
  let minBase = Infinity
  let maxBase = -Infinity

  const warpScale = 0.00215
  const continentScale = 0.00145
  const plainBias = clamp(params.plainBias, -1, 1)
  const plateauStrength = clamp(params.plateauStrength, 0, 1)
  const preset = params.terrainPreset ?? 'earth'

  for (let y = 0; y < height; y++) {
    const ny = ((y + 0.5) / height) * 2 - 1
    const row = y * width
    for (let x = 0; x < width; x++) {
      const nx = ((x + 0.5) / width) * 2 - 1
      const i = row + x
      const warpX = fbm(noise, x * warpScale + 31.7, y * warpScale + 11.3, 3) * 125
      const warpY = fbm(noise, x * warpScale - 17.1, y * warpScale + 43.9, 3) * 125
      const wx = x + warpX
      const wy = y + warpY

      const continental = fbm(noise, wx * continentScale, wy * continentScale, 6, 2.03, 0.52)
      const medium = fbm(noise, wx * 0.0046 + 9.2, wy * 0.0046 - 4.7, 4)
      const fine = fbm(noise, wx * 0.0135 - 8.8, wy * 0.0135 + 6.1, 3)
      const conv = Math.max(0, tectonics.convergence[i])
      const div = Math.max(0, -tectonics.convergence[i])
      const boundary = tectonics.boundary[i]

      let value =
        tectonics.plateBase[i] * 0.18 +
        continental * 0.9 +
        medium * 0.2 +
        fine * 0.06

      // 姹囪仛杈圭晫鎶崌鍦板３锛涚鏁ｈ竟鐣屽舰鎴愯璋?娲嬭剨鐨勮礋鍚戜慨姝ｃ€?      value += boundary * conv * (0.045 + 0.11 * plateauStrength)
      value -= boundary * div * (0.02 + 0.024 * (1 - plainBias) * 0.5)

      if (preset !== 'custom') {
        const mask = presetLandMask(preset, nx, ny, x, y, noise, continental, medium)
        // 预设只做很轻的偏向，不覆盖自然噪声；否则会变成几个光滑椭圆。
        const blend =
          preset === 'earth'
            ? 0
            : preset === 'pangaea'
              ? 0.22
              : preset === 'islands'
                ? 0.08
                : 0.14
        value += (mask - 0.5) * blend
      }

      const edge = Math.max(Math.abs(nx), Math.abs(ny))
      const fade = 1 - smoothstep(0.72, 1.04, edge) * 0.55
      value *= fade

      base[i] = value
      if (value < minBase) minBase = value
      if (value > maxBase) maxBase = value
    }
    if ((y & 127) === 0) {
      onProgress?.('Generating', 0.13 + (y / height) * 0.05)
    }
  }

  onProgress?.('Generating', 0.19)
  const bins = 2048
  const histogram = new Uint32Array(bins)
  const range = maxBase - minBase || 1
  for (let i = 0; i < cells; i++) {
    const bin = clamp(Math.floor(((base[i] - minBase) / range) * bins), 0, bins - 1)
    histogram[bin]++
  }
  const seaThreshold = findThreshold(
    histogram,
    minBase,
    maxBase,
    1 - clamp(params.landCoverage, 0.05, 0.7),
  )

  onProgress?.('Generating', 0.22)
  const elevation = new Int16Array(cells)
  const mountainField = new Float32Array(cells)
  const lowlandScale = 2900 - 900 * clamp(plainBias, 0, 1)

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      const b = base[i]
      const boundary = tectonics.boundary[i]
      const conv = Math.max(0, tectonics.convergence[i])
      const div = Math.max(0, -tectonics.convergence[i])

      if (b > seaThreshold) {
        const landT = clamp((b - seaThreshold) / (maxBase - seaThreshold || 1), 0, 1)
        let h = Math.pow(landT, 1.16) * lowlandScale

        const ridgeA = ridgedFbm(noise, x * 0.0062 + 2.4, y * 0.0062 - 8.7, 5, 2.05, 0.54)
        const ridgeB = ridgedFbm(noise, x * 0.0157 - 6.6, y * 0.0157 + 1.9, 4, 2.15, 0.5)
        const ridge = ridgeA * 0.62 + ridgeB * 0.38

        // 姹囪仛杈圭晫锛氬缂撻珮鍘?+ 鍒嗘灞辩郴銆備笉瑕佹妸鏁存潯鏉垮潡缂濇姮鎴愪竴閬撹繛缁伆澧欙細
        const core = Math.pow(boundary, 2.35)
        const orogen = smoothstep(0.42, 0.72, ridgeA * 0.62 + ridgeB * 0.38)
        const alongVariation = 0.28 + ridge * 0.9
        h += boundary * conv * (240 + 760 * plateauStrength) * alongVariation
        h += core * conv * orogen * (1050 + 1550 * params.mountainStrength) * alongVariation
        h += core * conv * orogen * ridge * (1050 + 1400 * params.mountainStrength)
        h += core * conv * orogen * (ridgeB - 0.5) * 520
        h -= boundary * div * (60 + 110 * (1 - plainBias))
        h += fbm(noise, x * 0.026 + 5.1, y * 0.026 + 3.3, 3) * (44 - 18 * clamp(plainBias, 0, 1))
        h += 18

        elevation[i] = Math.round(clamp(h, 1, 8800))
        mountainField[i] = clamp(boundary * conv * orogen * (0.55 + ridge * 0.75), 0, 1)
      } else {
        const oceanT = clamp((seaThreshold - b) / (seaThreshold - minBase || 1), 0, 1)
        let depth = 180 + Math.pow(oceanT, 0.72) * 5450
        // 澶氬昂搴︽捣搴曡捣浼忥紝閬垮厤鍑虹幇澶х墖绾壊鈥滃钩闈㈡捣娲嬧€濄€?        depth += fbm(noise, x * 0.0018 - 3.4, y * 0.0018 + 7.7, 3) * 430
        depth += fbm(noise, x * 0.0052 + 8.1, y * 0.0052 - 2.6, 4) * 260
        depth += fbm(noise, x * 0.013 - 5.3, y * 0.013 + 4.9, 2) * 70
        if (tectonics.oceanic[i]) {
          depth += boundary * conv * 420
        }
        elevation[i] = -Math.round(clamp(depth, 80, 9800))
        mountainField[i] = 0
      }
    }
    if ((y & 127) === 0) {
      onProgress?.('Generating', 0.22 + (y / height) * 0.1)
    }
  }

  onProgress?.('Generating', 0.31)
  applyCoastalLowland(elevation, mountainField, width, height, noise)
  onProgress?.('Generating', 0.32)
  relaxCliffs(elevation, width, height)
  onProgress?.('Generating', 0.325)
  smoothHighlands(elevation, width, height)
  compressHighlands(elevation)
  onProgress?.('Generating', 0.33)
  smoothElevation(elevation, width, height)

  return {
    width,
    height,
    elevation,
    mountainField,
    plates: tectonics.plates,
    minBase,
    maxBase,
    seaThreshold,
  }
}


function applyCoastalLowland(
  elevation: Int16Array,
  mountainField: Float32Array,
  width: number,
  height: number,
  noise: SimplexNoise2D,
): void {
  const cells = width * height
  const distance = new Int32Array(cells)
  const queue = new Int32Array(cells)
  let head = 0
  let tail = 0

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const index = row + x
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (elevation[index] <= 0 || isEdge) {
        distance[index] = 0
        queue[tail++] = index
      } else {
        distance[index] = -1
      }
    }
  }

  while (head < tail) {
    const index = queue[head++]
    const nextDistance = distance[index] + 1
    const x = index % width
    const y = (index / width) | 0
    if (x > 0) {
      const neighbor = index - 1
      if (elevation[neighbor] > 0 && distance[neighbor] < 0) {
        distance[neighbor] = nextDistance
        queue[tail++] = neighbor
      }
    }
    if (x < width - 1) {
      const neighbor = index + 1
      if (elevation[neighbor] > 0 && distance[neighbor] < 0) {
        distance[neighbor] = nextDistance
        queue[tail++] = neighbor
      }
    }
    if (y > 0) {
      const neighbor = index - width
      if (elevation[neighbor] > 0 && distance[neighbor] < 0) {
        distance[neighbor] = nextDistance
        queue[tail++] = neighbor
      }
    }
    if (y < height - 1) {
      const neighbor = index + width
      if (elevation[neighbor] > 0 && distance[neighbor] < 0) {
        distance[neighbor] = nextDistance
        queue[tail++] = neighbor
      }
    }
  }

  const component = new Int32Array(cells)
  component.fill(-1)
  const componentMaxDistance: number[] = []
  let componentCount = 0
  for (let start = 0; start < cells; start++) {
    if (elevation[start] <= 0 || component[start] >= 0) continue
    const id = componentCount++
    componentMaxDistance[id] = 0
    head = 0
    tail = 0
    queue[tail++] = start
    component[start] = id
    while (head < tail) {
      const index = queue[head++]
      componentMaxDistance[id] = Math.max(componentMaxDistance[id], distance[index])
      const x = index % width
      const y = (index / width) | 0
      if (x > 0) {
        const neighbor = index - 1
        if (elevation[neighbor] > 0 && component[neighbor] < 0) {
          component[neighbor] = id
          queue[tail++] = neighbor
        }
      }
      if (x < width - 1) {
        const neighbor = index + 1
        if (elevation[neighbor] > 0 && component[neighbor] < 0) {
          component[neighbor] = id
          queue[tail++] = neighbor
        }
      }
      if (y > 0) {
        const neighbor = index - width
        if (elevation[neighbor] > 0 && component[neighbor] < 0) {
          component[neighbor] = id
          queue[tail++] = neighbor
        }
      }
      if (y < height - 1) {
        const neighbor = index + width
        if (elevation[neighbor] > 0 && component[neighbor] < 0) {
          component[neighbor] = id
          queue[tail++] = neighbor
        }
      }
    }
  }

  const coastCap = clamp(Math.round(Math.min(width, height) * 0.075), 30, 140)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const index = row + x
      if (elevation[index] <= 0) continue
      const id = component[index]
      if (id < 0) continue
      const localWidth = Math.min(
        coastCap,
        Math.max(9, Math.round(componentMaxDistance[id] * 0.8)),
      )
      const t = clamp((distance[index] < 0 ? 0 : distance[index]) / localWidth, 0, 1)
      const eased = t * t * (3 - 2 * t)
      const coastalFloor =
        8 + 14 * (0.5 + 0.5 * Math.sin(x * 0.031 + y * 0.017 + id * 1.7))
      const inland = smoothstep(4, 42, distance[index] < 0 ? 0 : distance[index])
      const rolling =
        fbm(noise, x * 0.0048 + 13.7, y * 0.0048 - 5.3, 4) * 86 +
        fbm(noise, x * 0.0135 - 2.6, y * 0.0135 + 8.1, 3) * 30
      const relief = rolling * (0.35 + 0.65 * inland)
      elevation[index] = Math.max(
        3,
        Math.round(coastalFloor + (elevation[index] - coastalFloor) * eased + relief),
      )
      mountainField[index] *= 0.2 + 0.8 * eased
    }
  }
}


function relaxCliffs(elevation: Int16Array, width: number, height: number): void {
  const maxStep = 100
  for (let pass = 0; pass < 4; pass++) {
    const source = new Int16Array(elevation)
    for (let y = 1; y < height - 1; y++) {
      const row = y * width
      for (let x = 1; x < width - 1; x++) {
        const index = row + x
        if (source[index] <= 0) continue
        let sum = 0
        let count = 0
        for (const offset of [-1, 1, -width, width]) {
          const value = source[index + offset]
          if (value > 0) {
            sum += value
            count++
          }
        }
        if (count === 0) continue
        const average = sum / count
        const difference = source[index] - average
        if (Math.abs(difference) <= maxStep) continue
        elevation[index] = Math.round(average + Math.sign(difference) * maxStep)
      }
    }
  }
}


/**
 * 高处再做一次低频化，避免山峰出现高频尖刺，
 * 否则 100m 等高线会在山顶挤成一团黑块。
 */
function smoothHighlands(elevation: Int16Array, width: number, height: number): void {
  // 宽半径平均值：把山峰的高频尖刺摊平，等高线才不会在峰顶叠成一团。
  const radius = Math.max(8, Math.round(Math.min(width, height) * 0.01))
  const source = new Float32Array(elevation.length)
  for (let i = 0; i < elevation.length; i++) {
    source[i] = elevation[i] > 0 ? elevation[i] : 0
  }
  const horizontal = new Float32Array(elevation.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let sum = 0
      let count = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx))
        const value = source[row + xx]
        if (value > 0) {
          sum += value
          count++
        }
      }
      horizontal[row + x] = count > 0 ? sum / count : 0
    }
  }
  const blurred = new Float32Array(elevation.length)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0
      let count = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy))
        const value = horizontal[yy * width + x]
        if (value > 0) {
          sum += value
          count++
        }
      }
      blurred[y * width + x] = count > 0 ? sum / count : 0
    }
  }

  for (let i = 0; i < elevation.length; i++) {
    const center = elevation[i]
    if (center <= 500) continue
    const average = blurred[i]
    if (average <= 0) continue
    const strength = clamp((center - 500) / 2200, 0, 0.82)
    elevation[i] = Math.round(center + (average - center) * strength)
  }
}

function compressHighlands(elevation: Int16Array): void {
  for (let i = 0; i < elevation.length; i++) {
    const value = elevation[i]
    if (value <= 1800) continue
    elevation[i] = Math.round(1800 + (value - 1800) * 0.72)
  }
}

function smoothElevation(elevation: Int16Array, width: number, height: number): void {
  const source = new Int16Array(elevation)
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const i = row + x
      const center = source[i]
      if (center <= 0) continue
      let k = 0
      let landWeight = 0
      let landSum = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const value = source[i + dy * width + dx]
          const w = kernel[k++]
          if (value > 0) {
            landSum += value * w
            landWeight += w
          }
        }
      }
      if (landWeight >= 4) {
        elevation[i] = Math.round(landSum / landWeight)
      } else {
        elevation[i] = center
      }
    }
  }
}
