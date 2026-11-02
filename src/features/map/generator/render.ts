import type { WorldMapParams } from '../types'
import { BIOME_COLORS } from '../types'
import type { BiomeData } from './biomes'
import { BIOME } from './biomes'
import type { ClimateData } from './climate'
import type { HydrologyData } from './hydrology'
import type { TerrainData } from './terrain'
import { clamp } from './noise'

export interface MapState {
  terrain: TerrainData
  hydrology: HydrologyData
  climate: ClimateData
  biomes: BiomeData
  params: WorldMapParams
}

export interface RenderContext {
  shade: Float32Array
  maxElevation: number
}

type RGB = readonly [number, number, number]

const DEEP_OCEAN: RGB = [20, 40, 52]
const MID_OCEAN: RGB = [36, 67, 81]
const SHALLOW_OCEAN: RGB = [77, 118, 128]
// 湖泊刻意区别于海洋：更亮的青蓝，并在岸边描一圈深色轮廓。
const LAKE: RGB = [78, 148, 158]
const RIVER: RGB = [62, 136, 160]
const BEACH: RGB = [211, 195, 157]
const ROCK: RGB = [139, 133, 121]
const SNOW: RGB = [225, 223, 215]

function mix(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1)
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

function hexToRgb(hex: string): RGB {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

const BIOME_RGB: RGB[] = BIOME_COLORS.map(hexToRgb)

export function buildRenderContext(state: MapState): RenderContext {
  const { width, height, elevation } = state.terrain
  const cells = width * height
  const shade = new Float32Array(cells)
  let maxElevation = 1
  for (let i = 0; i < cells; i++) {
    if (elevation[i] > maxElevation) maxElevation = elevation[i]
  }

  const lightX = -0.58
  const lightY = -0.64
  const lightZ = 0.72
  const lightLen = Math.sqrt(lightX * lightX + lightY * lightY + lightZ * lightZ)
  const lx = lightX / lightLen
  const ly = lightY / lightLen
  const lz = lightZ / lightLen

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      if (elevation[i] <= 0) {
        shade[i] = 1
        continue
      }
      const xl = x > 0 ? i - 1 : i
      const xr = x < width - 1 ? i + 1 : i
      const yu = y > 0 ? i - width : i
      const yd = y < height - 1 ? i + width : i
      const dzdx = (elevation[xr] - elevation[xl]) / 1100
      const dzdy = (elevation[yd] - elevation[yu]) / 1100
      const nx = -dzdx
      const ny = -dzdy
      const nz = 1
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      const dot = (nx * lx + ny * ly + nz * lz) / len
      shade[i] = clamp(0.72 + dot * 0.42, 0.55, 1.28)
    }
  }

  return { shade, maxElevation }
}

function shadeColor(color: RGB, factor: number): RGB {
  return [
    clamp(Math.round(color[0] * factor), 0, 255),
    clamp(Math.round(color[1] * factor), 0, 255),
    clamp(Math.round(color[2] * factor), 0, 255),
  ]
}

function terrainLandColor(elev: number, temp: number, moisture: number): RGB {
  // 分层高程色带：平原 / 丘陵 / 高原 / 山地 / 高山裸岩。
  // 每段内部仍连续混合，避免地图变成生硬的色块拼图。
  if (elev < 180) {
    const dry: RGB = [112, 139, 80]
    const wet: RGB = [58, 101, 72]
    return mix(dry, wet, clamp(moisture * 0.95 + (temp > 22 ? 0.08 : 0), 0, 1))
  }
  if (elev < 750) {
    const low: RGB = [96, 124, 74]
    const high: RGB = [75, 103, 66]
    return mix(low, high, clamp((elev - 180) / 570, 0, 1))
  }
  if (elev < 2200) {
    // 高原：偏暖的黄褐，与丘陵的绿色拉开层次。
    const low: RGB = [156, 138, 94]
    const high: RGB = [181, 158, 112]
    return mix(low, high, clamp((elev - 750) / 1450, 0, 1))
  }
  if (elev < 3800) {
    const low: RGB = [152, 143, 120]
    const high: RGB = [126, 120, 108]
    return mix(low, high, clamp((elev - 2200) / 1600, 0, 1))
  }
  return mix(ROCK, [146, 141, 132], clamp((elev - 3800) / 2200, 0, 1))
}

function writePixel(
  rgba: Uint8ClampedArray,
  index: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const offset = index * 4
  rgba[offset] = r
  rgba[offset + 1] = g
  rgba[offset + 2] = b
  rgba[offset + 3] = a
}

function blendPixel(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RGB,
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const offset = (y * width + x) * 4
  if (alpha >= 0.99) {
    rgba[offset] = color[0]
    rgba[offset + 1] = color[1]
    rgba[offset + 2] = color[2]
    return
  }
  rgba[offset] = Math.round(rgba[offset] * (1 - alpha) + color[0] * alpha)
  rgba[offset + 1] = Math.round(rgba[offset + 1] * (1 - alpha) + color[1] * alpha)
  rgba[offset + 2] = Math.round(rgba[offset + 2] * (1 - alpha) + color[2] * alpha)
}

function drawLine(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGB,
  alpha: number,
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const x = Math.round(x0 + dx * t)
    const y = Math.round(y0 + dy * t)
    blendPixel(rgba, width, height, x, y, color, alpha)
  }
}

/** 河流中心线覆盖：按流量画平滑线段，不再使用圆形 stamp。 */
function overlayRiverSegments(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  segments: HydrologyData['riverSegments'],
): void {
  for (const segment of segments) {
    const dx = segment.bx - segment.ax
    const dy = segment.by - segment.ay
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2))
    const radius = Math.max(0.55, segment.width / 2)
    const r = Math.ceil(radius)
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const px = Math.round(segment.ax + dx * t)
      const py = Math.round(segment.ay + dy * t)
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (ox * ox + oy * oy > radius * radius + 0.35) continue
          blendPixel(rgba, width, height, px + ox, py + oy, RIVER, 0.82)
        }
      }
    }
  }
}

export function renderTerrain(state: MapState, context: RenderContext): Uint8ClampedArray {
  const { width, height, elevation } = state.terrain
  const cells = width * height
  const rgba = new Uint8ClampedArray(cells * 4)
  const { climate, hydrology, biomes } = state
  for (let i = 0; i < cells; i++) {
    const water = hydrology.water[i]
    if (water === 1) {
      const depth = clamp(-elevation[i] / 6200, 0, 1)
      let color = mix(SHALLOW_OCEAN, MID_OCEAN, Math.pow(depth, 0.42))
      color = mix(color, DEEP_OCEAN, clamp((depth - 0.35) / 0.65, 0, 1))
      writePixel(rgba, i, color[0], color[1], color[2])
      continue
    }
    if (water === 2) {
      const color = shadeColor(LAKE, 0.92 + context.shade[i] * 0.08)
      writePixel(rgba, i, color[0], color[1], color[2])
      continue
    }
    const temp = climate.temperature[i]
    const moisture = climate.moisture[i] / 255
    const biome = biomes.biome[i]
    const landElev = state.terrain.elevation[i]
    const biomeColor =
      (biome === BIOME.SNOW || biome === BIOME.ICE) && landElev < 6500
        ? ROCK
        : BIOME_RGB[biome] ?? BIOME_RGB[BIOME.GRASSLAND]
    const physical = terrainLandColor(landElev, temp, moisture)
    // 地形高程分层占主导；生物群系只做轻微染色，避免整片地图被沙漠色吞掉。
    let land = mix(physical, biomeColor, 0.34)
    // 山脉场让山体呈裸岩色；分段山系的高点要能被一眼识别。
    land = mix(land, ROCK, clamp(state.terrain.mountainField[i] * 1.05, 0, 0.7))
    // 高山逐步过渡为裸岩与雪。
    if (landElev > 2600) land = mix(land, ROCK, clamp((landElev - 2600) / 2400, 0, 0.66))
    if (landElev > 6500) land = mix(land, SNOW, clamp((landElev - 6500) / 900, 0, 0.88))
    if (temp < -4) land = mix(land, [190, 199, 201], clamp((-temp - 4) / 24, 0, 0.5))
    // 湿润的洼地颜色更深，干旱盆地更暖。
    if (moisture > 0.66 && landElev < 900) land = mix(land, [70, 105, 78], 0.24)
    if (moisture < 0.18 && temp > 12) land = mix(land, [193, 169, 116], 0.25)
    const color = shadeColor(land, context.shade[i])
    writePixel(rgba, i, color[0], color[1], color[2])
    if (biome === BIOME.BEACH) {
      blendPixel(rgba, width, height, i % width, (i / width) | 0, BEACH, 0.4)
    }
  }
  // 河流/湖泊轮廓全部交给 SVG 矢量层，栅格中不再绘制，避免放大后出现模糊双边缘。
  return rgba
}

export function renderBiome(state: MapState, context: RenderContext): Uint8ClampedArray {
  const { width, height, elevation } = state.terrain
  const cells = width * height
  const rgba = new Uint8ClampedArray(cells * 4)
  for (let i = 0; i < cells; i++) {
    const biome = state.biomes.biome[i]
    const base = BIOME_RGB[biome] ?? BIOME_RGB[0]
    if (biome === BIOME.OCEAN) {
      const depth = clamp(-elevation[i] / 6200, 0, 1)
      const color = mix([67, 105, 116], [22, 45, 58], Math.pow(depth, 0.5))
      writePixel(rgba, i, color[0], color[1], color[2])
      continue
    }
    const shade = biome === BIOME.LAKE ? 1 : context.shade[i]
    const color = shadeColor(base, 0.84 + shade * 0.16)
    writePixel(rgba, i, color[0], color[1], color[2])
  }
  return rgba
}

const TEMP_STOPS: Array<{ t: number; color: RGB }> = [
  { t: -30, color: [48, 61, 103] },
  { t: -15, color: [60, 88, 132] },
  { t: 0, color: [96, 144, 158] },
  { t: 10, color: [152, 174, 128] },
  { t: 20, color: [206, 181, 105] },
  { t: 30, color: [197, 119, 82] },
  { t: 42, color: [153, 72, 61] },
]

function temperatureColor(temp: number): RGB {
  if (temp <= TEMP_STOPS[0].t) return TEMP_STOPS[0].color
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    if (temp <= TEMP_STOPS[i].t) {
      const a = TEMP_STOPS[i - 1]
      const b = TEMP_STOPS[i]
      const t = (temp - a.t) / (b.t - a.t)
      return mix(a.color, b.color, t)
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1].color
}

export function renderTemperature(state: MapState, context: RenderContext): Uint8ClampedArray {
  const width = state.terrain.width
  const height = state.terrain.height
  const cells = state.terrain.width * state.terrain.height
  const rgba = new Uint8ClampedArray(cells * 4)
  for (let i = 0; i < cells; i++) {
    const temp = state.climate.temperature[i]
    if (state.climate.ocean[i]) {
      const color = mix([58, 92, 108], [40, 67, 83], clamp(-state.terrain.elevation[i] / 6000, 0, 1))
      writePixel(rgba, i, color[0], color[1], color[2])
      continue
    }
    const color = shadeColor(temperatureColor(temp), 0.88 + context.shade[i] * 0.12)
    writePixel(rgba, i, color[0], color[1], color[2])
  }
  return rgba
}

const MOISTURE_STOPS: Array<{ m: number; color: RGB }> = [
  { m: 0, color: [197, 178, 124] },
  { m: 0.2, color: [178, 167, 104] },
  { m: 0.4, color: [148, 161, 98] },
  { m: 0.6, color: [103, 145, 96] },
  { m: 0.8, color: [65, 127, 111] },
  { m: 1, color: [46, 101, 126] },
]

function moistureColor(m: number): RGB {
  for (let i = 1; i < MOISTURE_STOPS.length; i++) {
    if (m <= MOISTURE_STOPS[i].m) {
      const a = MOISTURE_STOPS[i - 1]
      const b = MOISTURE_STOPS[i]
      return mix(a.color, b.color, (m - a.m) / (b.m - a.m))
    }
  }
  return MOISTURE_STOPS[MOISTURE_STOPS.length - 1].color
}

export function renderMoisture(state: MapState, context: RenderContext): Uint8ClampedArray {
  const width = state.terrain.width
  const height = state.terrain.height
  const cells = state.terrain.width * state.terrain.height
  const rgba = new Uint8ClampedArray(cells * 4)
  for (let i = 0; i < cells; i++) {
    if (state.climate.ocean[i]) {
      const color = mix([62, 96, 112], [38, 65, 81], clamp(-state.terrain.elevation[i] / 6000, 0, 1))
      writePixel(rgba, i, color[0], color[1], color[2])
      continue
    }
    const color = shadeColor(moistureColor(state.climate.moisture[i] / 255), 0.88 + context.shade[i] * 0.12)
    writePixel(rgba, i, color[0], color[1], color[2])
  }
  return rgba
}

function contourEdge(
  x: number,
  y: number,
  h00: number,
  h10: number,
  h11: number,
  h01: number,
  level: number,
  edge: number,
): [number, number] {
  if (edge === 0) {
    const t = (level - h00) / (h10 - h00 || 1)
    return [x + clamp(t, 0, 1), y]
  }
  if (edge === 1) {
    const t = (level - h10) / (h11 - h10 || 1)
    return [x + 1, y + clamp(t, 0, 1)]
  }
  if (edge === 2) {
    const t = (level - h01) / (h11 - h01 || 1)
    return [x + clamp(t, 0, 1), y + 1]
  }
  const t = (level - h00) / (h01 - h00 || 1)
  return [x, y + clamp(t, 0, 1)]
}

function drawContourCell(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  h00: number,
  h10: number,
  h11: number,
  h01: number,
  level: number,
  color: RGB,
  alpha: number,
): void {
  const idx =
    (h00 > level ? 1 : 0) |
    (h10 > level ? 2 : 0) |
    (h11 > level ? 4 : 0) |
    (h01 > level ? 8 : 0)
  if (idx === 0 || idx === 15) return
  const top = contourEdge(x, y, h00, h10, h11, h01, level, 0)
  const right = contourEdge(x, y, h00, h10, h11, h01, level, 1)
  const bottom = contourEdge(x, y, h00, h10, h11, h01, level, 2)
  const left = contourEdge(x, y, h00, h10, h11, h01, level, 3)
  const draw = (a: [number, number], b: [number, number]): void => {
    drawLine(rgba, width, height, a[0], a[1], b[0], b[1], color, alpha)
  }

  switch (idx) {
    case 1:
    case 14:
      draw(left, top)
      break
    case 2:
    case 13:
      draw(top, right)
      break
    case 3:
    case 12:
      draw(left, right)
      break
    case 4:
    case 11:
      draw(right, bottom)
      break
    case 6:
    case 9:
      draw(top, bottom)
      break
    case 7:
    case 8:
      draw(left, bottom)
      break
    case 5: {
      const center = (h00 + h10 + h11 + h01) / 4
      if (center > level) {
        draw(left, bottom)
        draw(top, right)
      } else {
        draw(left, top)
        draw(right, bottom)
      }
      break
    }
    case 10: {
      const center = (h00 + h10 + h11 + h01) / 4
      if (center > level) {
        draw(left, top)
        draw(right, bottom)
      } else {
        draw(left, bottom)
        draw(top, right)
      }
      break
    }
    default:
      break
  }
}

export function renderContour(
  state: MapState,
  context: RenderContext,
  contourInterval = 100,
): Uint8ClampedArray {
  const step = clamp(Math.round(contourInterval / 50) * 50, 50, 500)
  const { width, height, elevation } = state.terrain
  const { water } = state.hydrology
  const cells = width * height
  const rgba = new Uint8ClampedArray(cells * 4)
  const maxElev = context.maxElevation

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      if (water[i] === 1 || elevation[i] <= 0) {
        const depth = clamp(-elevation[i] / 6200, 0, 1)
        const color = mix([222, 231, 230], [176, 198, 202], Math.pow(depth, 0.6))
        writePixel(rgba, i, color[0], color[1], color[2])
      } else if (water[i] === 2 || water[i] === 3) {
        // 等高线视图只表达地形；湖泊和河流不在这一层绘制。
        writePixel(rgba, i, 234, 231, 211)
      } else {
        const t = clamp(elevation[i] / Math.max(1, maxElev), 0, 1)
        const base = mix([234, 231, 211], [183, 166, 137], Math.pow(t, 0.72))
        const shaded = shadeColor(base, 0.86 + context.shade[i] * 0.14)
        writePixel(rgba, i, shaded[0], shaded[1], shaded[2])
      }
    }
  }

  const contour: RGB = [118, 101, 78]
  const coast: RGB = [62, 53, 40]
  for (let level = step; level <= maxElev; level += step) {
    // 高海拔区域自动抽稀，避免 100m 线在陡坡上叠成黑块。
    if (level > 2000) {
      if (level % (step * 4) !== 0) continue
    } else if (level > 1000) {
      if (level % (step * 2) !== 0) continue
    }
    for (let y = 0; y < height - 1; y++) {
      const row = y * width
      for (let x = 0; x < width - 1; x++) {
        const i = row + x
        if (water[i] || water[i + 1] || water[i + width] || water[i + width + 1]) continue
        const h00 = elevation[i]
        const h10 = elevation[i + 1]
        const h11 = elevation[i + width + 1]
        const h01 = elevation[i + width]
        if (h00 <= 0 && h10 <= 0 && h11 <= 0 && h01 <= 0) continue
        const min = Math.min(h00, h10, h11, h01)
        const max = Math.max(h00, h10, h11, h01)
        if (level < min || level > max) continue
        drawContourCell(
          rgba,
          width,
          height,
          x,
          y,
          h00,
          h10,
          h11,
          h01,
          level,
          contour,
          0.42,
        )
      }
    }
  }

  // 海洋等深线：让海底也有可读的地形层次。
  const oceanContour: RGB = [82, 129, 145]
  const oceanStep = Math.max(500, step * 2)
  for (let level = -oceanStep; level >= -7000; level -= oceanStep) {
    for (let y = 0; y < height - 1; y++) {
      const row = y * width
      for (let x = 0; x < width - 1; x++) {
        const i = row + x
        const h00 = elevation[i]
        const h10 = elevation[i + 1]
        const h11 = elevation[i + width + 1]
        const h01 = elevation[i + width]
        if (h00 > 0 || h10 > 0 || h11 > 0 || h01 > 0) continue
        const min = Math.min(h00, h10, h11, h01)
        const max = Math.max(h00, h10, h11, h01)
        if (level < min || level > max) continue
        drawContourCell(
          rgba,
          width,
          height,
          x,
          y,
          h00,
          h10,
          h11,
          h01,
          level,
          oceanContour,
          0.28,
        )
      }
    }
  }

  // 海岸线单独强调。
  for (let y = 0; y < height - 1; y++) {
    const row = y * width
    for (let x = 0; x < width - 1; x++) {
      const i = row + x
      const h00 = elevation[i]
      const h10 = elevation[i + 1]
      const h11 = elevation[i + width + 1]
      const h01 = elevation[i + width]
      const min = Math.min(h00, h10, h11, h01)
      const max = Math.max(h00, h10, h11, h01)
      if (min > 0 || max <= 0) continue
      drawContourCell(rgba, width, height, x, y, h00, h10, h11, h01, 0, coast, 0.8)
    }
  }

  return rgba
}

export function renderView(
  state: MapState,
  context: RenderContext,
  view: 'terrain' | 'contour' | 'temperature' | 'moisture' | 'biome' | 'political',
  contourInterval = 100,
): Uint8ClampedArray {
  switch (view) {
    case 'contour':
      return renderContour(state, context, contourInterval)
    case 'temperature':
      return renderTemperature(state, context)
    case 'moisture':
      return renderMoisture(state, context)
    case 'biome':
      return renderBiome(state, context)
    case 'terrain':
    default:
      return renderTerrain(state, context)
  }
}
