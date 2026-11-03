import type { MapLine } from './types'

export const KM_PER_CELL = 18

export interface MapLayers {
  height: Int16Array
  biome: Uint8Array
  water: Uint8Array
  temperature: Int16Array
  moisture: Uint8Array
  width: number
  mapHeight: number
}

export interface ProfilePoint {
  t: number
  x: number
  y: number
  elevation: number
  biome: number
  water: number
  temperature: number
  moisture: number
  distanceKm: number
}

function bilinearHeight(
  height: Int16Array,
  width: number,
  imageHeight: number,
  x: number,
  y: number,
): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(imageHeight - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const h00 = height[y0 * width + x0]
  const h10 = height[y0 * width + x1]
  const h01 = height[y1 * width + x0]
  const h11 = height[y1 * width + x1]
  return (
    h00 * (1 - fx) * (1 - fy) +
    h10 * fx * (1 - fy) +
    h01 * (1 - fx) * fy +
    h11 * fx * fy
  )
}

export function sampleProfile(
  layers: MapLayers,
  line: MapLine,
  maxSamples = 720,
): ProfilePoint[] {
  const { width, mapHeight } = layers
  const dx = line.bx - line.ax
  const dy = line.by - line.ay
  const pixelLength = Math.sqrt(dx * dx + dy * dy)
  if (pixelLength < 2) return []
  const steps = Math.max(48, Math.min(maxSamples, Math.round(pixelLength * 1.25)))
  const points: ProfilePoint[] = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const x = line.ax + dx * t
    const y = line.ay + dy * t
    const xi = Math.max(0, Math.min(width - 1, Math.round(x)))
    const yi = Math.max(0, Math.min(mapHeight - 1, Math.round(y)))
    const i = yi * width + xi
    points.push({
      t,
      x,
      y,
      elevation: bilinearHeight(layers.height, width, mapHeight, x, y),
      biome: layers.biome[i],
      water: layers.water[i],
      temperature: layers.temperature[i],
      moisture: Math.round((layers.moisture[i] / 255) * 100),
      distanceKm: t * pixelLength * KM_PER_CELL,
    })
  }
  return points
}

export function lineLengthKm(line: MapLine): number {
  const dx = line.bx - line.ax
  const dy = line.by - line.ay
  return Math.sqrt(dx * dx + dy * dy) * KM_PER_CELL
}

export function profileExtremes(points: ProfilePoint[]): { min: number; max: number } {
  if (points.length === 0) return { min: 0, max: 1000 }
  let min = 0
  let max = 100
  for (const point of points) {
    if (point.elevation < min) min = point.elevation
    if (point.elevation > max) max = point.elevation
  }
  return { min, max }
}
