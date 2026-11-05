import type { TerrainData } from './terrain'
import { SimplexNoise2D, clamp, fbm } from './noise'

export interface ClimateData {
  temperature: Int16Array
  moisture: Uint8Array
  precipitation: Float32Array
  distanceToWater: Float32Array
  /** 到海岸（仅海洋，不含河流/湖泊）的格距，用于沙滩分类。 */
  distanceToOcean: Float32Array
  ocean: Uint8Array
  meanTemperature: number
  meanPrecipitation: number
}

function distanceToWaterMap(
  width: number,
  height: number,
  water: Uint8Array,
): Float32Array {
  const cells = width * height
  const dist = new Float32Array(cells)
  const inf = 1e8
  for (let i = 0; i < cells; i++) dist[i] = water[i] ? 0 : inf

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      let d = dist[i]
      if (x > 0) d = Math.min(d, dist[i - 1] + 1)
      if (y > 0) {
        d = Math.min(d, dist[i - width] + 1)
        if (x > 0) d = Math.min(d, dist[i - width - 1] + 1.414)
        if (x < width - 1) d = Math.min(d, dist[i - width + 1] + 1.414)
      }
      dist[i] = d
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    const row = y * width
    for (let x = width - 1; x >= 0; x--) {
      const i = row + x
      let d = dist[i]
      if (x < width - 1) d = Math.min(d, dist[i + 1] + 1)
      if (y < height - 1) {
        d = Math.min(d, dist[i + width] + 1)
        if (x < width - 1) d = Math.min(d, dist[i + width + 1] + 1.414)
        if (x > 0) d = Math.min(d, dist[i + width - 1] + 1.414)
      }
      dist[i] = d
    }
  }
  return dist
}

function boxBlur(source: Float32Array, width: number, height: number, passes: number): Float32Array {
  let current = source
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(current.length)
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        let sum = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= width) continue
            sum += current[ny * width + nx]
            count++
          }
        }
        next[row + x] = sum / count
      }
    }
    current = next
  }
  return current
}

export function generateClimate(
  terrain: TerrainData,
  hydrology: { water: Uint8Array; lakeMask: Uint8Array },
  seed: number,
  params: { temperatureOffset: number; moistureBias: number; latitudeSpan: number },
  onProgress?: (stage: string, value: number) => void,
): ClimateData {
  const { width, height, elevation } = terrain
  const cells = width * height
  const noise = new SimplexNoise2D(seed ^ 0x6a09e667)
  const ocean = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) ocean[i] = elevation[i] <= 0 ? 1 : 0

  const dist = distanceToWaterMap(width, height, hydrology.water)
  const oceanDistance = distanceToWaterMap(width, height, ocean)
  const temperature = new Int16Array(cells)
  const latSpan = clamp(params.latitudeSpan, 60, 180)

  onProgress?.('纬度温度梯度', 0.61)
  for (let y = 0; y < height; y++) {
    const lat = latSpan / 2 - ((y + 0.5) / height) * latSpan
    const latAbs = Math.abs(lat)
    const base = 29.5 - 0.00565 * lat * lat + params.temperatureOffset
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      const elev = Math.max(0, elevation[i])
      const local = fbm(noise, x * 0.006 + 3.7, y * 0.006 - 1.2, 3) * 1.4
      let t = base - elev * 0.0065 + local
      if (ocean[i]) {
        // 海洋热惯性：冬季不至于比同纬度陆地更极端。
        t = base + 1.1 - Math.max(0, -elev) * 0.00025 + local * 0.5
      }
      // 高山永久冻土带
      if (elev > 5200) t -= (elev - 5200) * 0.002
      temperature[i] = Math.round(clamp(t, -55, 48))
    }
    if ((y & 127) === 0) onProgress?.('纬度温度梯度', 0.61 + (y / height) * 0.04)
  }

  onProgress?.('盛行风与雨影', 0.66)
  const precipitation = new Float32Array(cells)
  const carried = new Float32Array(cells)
  const riverBoost = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) {
    if (hydrology.water[i] === 3) riverBoost[i] = 1
  }

  for (let y = 0; y < height; y++) {
    const lat = latSpan / 2 - ((y + 0.5) / height) * latSpan
    const latAbs = Math.abs(lat)
    // 0-30° 信风（向东岸吹），30-60° 西风（向西岸吹），60-90° 极地东风。
    const windX = latAbs < 30 ? -1 : latAbs < 60 ? 1 : -1
    const start = windX > 0 ? 0 : width - 1
    const end = windX > 0 ? width : -1
    let m = 0.88
    for (let x = start; x !== end; x += windX) {
      const i = y * width + x
      const t = temperature[i]
      const evap = clamp((t + 12) / 42, 0.1, 1)
      const marine = Math.exp(-dist[i] / 85)
      const localWater = hydrology.water[i] > 0 || riverBoost[i] > 0

      if (localWater) {
        m = Math.max(m * 0.995, 0.55 + evap * 0.45)
        carried[i] = m
        continue
      }

      const upX = x - windX
      const up2X = x - windX * 2
      let upElev = elevation[i]
      if (up2X >= 0 && up2X < width) upElev = elevation[y * width + up2X]
      else if (upX >= 0 && upX < width) upElev = elevation[y * width + upX]
      const rise = elevation[i] - upElev
      const orographic = clamp(rise / 620, 0, 1)
      const lee = clamp(-rise / 620, 0, 1)

      // 上风方向的水汽平流；跨行混合避免出现完全笔直的干湿带。
      const crossRow = y > 0 ? carried[(y - 1) * width + x] : 0
      m = Math.max(m * 0.991, 0.38 + marine * 0.55 + crossRow * 0.1)
      let rain = m * (0.018 + orographic * 0.43 + marine * 0.105)
      rain *= 0.56 + evap * 0.62
      rain -= lee * m * 0.015
      rain = clamp(rain, 0.003, 0.5)
      m = clamp(m - rain * 0.8 + 0.003, 0.08, 1)

      let mm = 120 + rain * 4250 + marine * 500 + params.moistureBias * 480
      mm += riverBoost[i] * 60
      mm += fbm(noise, x * 0.018 - 5.2, y * 0.018 + 9.8, 2) * 55
      precipitation[i] = Math.max(45, mm)
      carried[i] = m
    }
    if ((y & 127) === 0) onProgress?.('盛行风与雨影', 0.66 + (y / height) * 0.08)
  }

  onProgress?.('平滑降水场', 0.75)
  const smoothed = boxBlur(precipitation, width, height, 2)
  // 海洋也保留一条极低的“降水”值，仅用于着色；气候图会单独处理海洋。
  for (let i = 0; i < cells; i++) {
    if (ocean[i] && smoothed[i] < 60) smoothed[i] = 60
  }

  const moisture = new Uint8Array(cells)
  let tempSum = 0
  let precipSum = 0
  let landCount = 0
  for (let i = 0; i < cells; i++) {
    tempSum += temperature[i]
    if (!ocean[i]) {
      precipSum += smoothed[i]
      landCount++
    }
    const normalized = clamp((smoothed[i] - 110) / 2050, 0, 1)
    moisture[i] = Math.round(normalized * 255)
  }

  return {
    temperature,
    moisture,
    precipitation: smoothed,
    distanceToWater: dist,
    distanceToOcean: oceanDistance,
    ocean,
    meanTemperature: tempSum / cells,
    meanPrecipitation: landCount > 0 ? precipSum / landCount : 0,
  }
}
