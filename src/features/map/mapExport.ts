import { db } from '@/lib/db'
import type { MapAnnotation, WorldMapRecord } from '@/types'
import { normalizeMapParams } from './params'
import type { PoliticalData } from './political'

const OCMAP_FORMAT = 'oc-studio-map'
const OCMAP_VERSION = 1

function safeFileName(name: string): string {
  return (name || '地图').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(dataUrl)
    return await response.blob()
  } catch {
    return null
  }
}

async function compositeRecordImage(record: WorldMapRecord): Promise<Blob> {
  if (!record.imageBlob) throw new Error('这张地图还没有完整图片，请先在生成器中重新生成。')
  if (!record.paintBlob && (record.annotations ?? []).length === 0) return record.imageBlob
  const base = await createImageBitmap(record.imageBlob)
  const canvas = document.createElement('canvas')
  canvas.width = base.width
  canvas.height = base.height
  const context = canvas.getContext('2d')
  if (!context) {
    base.close()
    throw new Error('无法创建图片画布')
  }
  context.drawImage(base, 0, 0)
  paintAnnotations(context, record.annotations ?? [], base.width, base.height)
  base.close()
  if (record.paintBlob) {
    const paint = await createImageBitmap(record.paintBlob)
    context.drawImage(paint, 0, 0)
    paint.close()
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('合成地图失败')
  return blob
}

function paintPolitical(
  context: CanvasRenderingContext2D,
  political: PoliticalData,
  width: number,
  height: number,
): void {
  const stateById = new Map(political.states.map((state) => [state.id, state]))
  const cellWidth = width / political.cols
  const cellHeight = height / political.rows
  context.save()
  for (let y = 0; y < political.rows; y++) {
    for (let x = 0; x < political.cols; x++) {
      const owner = political.owner[y * political.cols + x]
      const state = owner ? stateById.get(owner) : undefined
      if (!state) continue
      context.globalAlpha = 0.2
      context.fillStyle = state.color
      context.fillRect(x * cellWidth, y * cellHeight, cellWidth + 0.5, cellHeight + 0.5)
    }
  }
  context.globalAlpha = 0.9
  context.strokeStyle = '#3F3832'
  context.lineWidth = Math.max(1, width / political.cols / 10)
  context.beginPath()
  for (let y = 0; y < political.rows; y++) {
    for (let x = 0; x < political.cols; x++) {
      const owner = political.owner[y * political.cols + x]
      if (!owner) continue
      const right = x + 1 < political.cols ? political.owner[y * political.cols + x + 1] : 0
      const down = y + 1 < political.rows ? political.owner[(y + 1) * political.cols + x] : 0
      if (right !== owner) {
        context.moveTo((x + 1) * cellWidth, y * cellHeight)
        context.lineTo((x + 1) * cellWidth, (y + 1) * cellHeight)
      }
      if (down !== owner) {
        context.moveTo(x * cellWidth, (y + 1) * cellHeight)
        context.lineTo((x + 1) * cellWidth, (y + 1) * cellHeight)
      }
    }
  }
  context.stroke()
  context.globalAlpha = 0.8
  context.strokeStyle = '#8A6A46'
  context.lineWidth = Math.max(1, width / political.cols / 14)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const road of political.roads ?? []) {
    if (road.points.length < 2) continue
    context.beginPath()
    road.points.forEach((point, index) => {
      const x = point.x * width
      const y = point.y * height
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }
  for (const city of political.cities) {
    const state = stateById.get(city.stateId)
    if (!state) continue
    const x = city.x * width
    const y = city.y * height
    context.globalAlpha = 1
    context.beginPath()
    context.arc(x, y, city.capital ? 5 : 3, 0, Math.PI * 2)
    context.fillStyle = city.capital ? '#FEFCF8' : state.color
    context.fill()
    context.lineWidth = city.capital ? 2 : 1
    context.strokeStyle = state.color
    context.stroke()
    context.font = city.capital
      ? '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      : '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'bottom'
    context.fillStyle = '#FEFCF8'
    context.strokeStyle = 'rgba(43,43,43,0.55)'
    context.lineWidth = 3
    context.strokeText(city.name, x, y - 6)
    context.fillText(city.name, x, y - 6)
  }
  context.restore()
}

function paintAnnotations(
  context: CanvasRenderingContext2D,
  annotations: MapAnnotation[],
  width: number,
  height: number,
): void {
  for (const annotation of annotations) {
    if (annotation.type === 'polygon' && annotation.points.length >= 3) {
      context.save()
      context.beginPath()
      annotation.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.closePath()
      context.globalAlpha = 0.18
      context.fillStyle = annotation.color
      context.fill()
      context.globalAlpha = 1
      context.strokeStyle = annotation.color
      context.lineWidth = Math.max(1.5, width / 1200)
      context.stroke()
      context.restore()
    } else if (annotation.type === 'road' && annotation.points.length >= 2) {
      context.save()
      context.beginPath()
      annotation.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.strokeStyle = annotation.color
      context.lineWidth = Math.max(2, width / 1000)
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.stroke()
      context.restore()
    } else if (annotation.type === 'city' && annotation.points[0]) {
      const point = annotation.points[0]
      context.save()
      context.beginPath()
      context.arc(point.x, point.y, Math.max(3, width / 700), 0, Math.PI * 2)
      context.fillStyle = '#FEFCF8'
      context.fill()
      context.lineWidth = Math.max(1, width / 1800)
      context.strokeStyle = annotation.color
      context.stroke()
      context.font = `600 ${Math.max(9, width / 220)}px sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'bottom'
      context.fillStyle = '#2B2B2B'
      context.fillText(annotation.name, point.x, point.y - Math.max(5, width / 500))
      context.restore()
    }
  }
  void height
}

export async function composeMapBlob(
  image: ImageData,
  political: PoliticalData | null,
  annotations: MapAnnotation[] = [],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建图片画布')
  context.putImageData(image, 0, 0)
  if (political) paintPolitical(context, political, image.width, image.height)
  paintAnnotations(context, annotations, image.width, image.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('地图合成失败')
  return blob
}

export async function downloadMapImage(
  record: WorldMapRecord,
  format: 'png' | 'jpg',
): Promise<void> {
  if (!record.imageBlob) throw new Error('这张地图还没有完整图片，请先在生成器中重新生成。')
  const baseName = safeFileName(record.name)

  const composed = await compositeRecordImage(record)
  if (format === 'png') {
    downloadBlob(composed, `${baseName}.png`)
    return
  }

  const bitmap = await createImageBitmap(composed)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建图片画布')
  context.fillStyle = '#F3EFE9'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!jpeg) throw new Error('JPG 编码失败')
  downloadBlob(jpeg, `${baseName}.jpg`)
}

export async function downloadOcmap(record: WorldMapRecord): Promise<void> {
  const image = record.imageBlob ? await blobToDataUrl(await compositeRecordImage(record)) : undefined
  const payload = {
    format: OCMAP_FORMAT,
    version: OCMAP_VERSION,
    exportedAt: new Date().toISOString(),
    map: {
      name: record.name,
      seed: record.seed,
      params: normalizeMapParams(record.params),
      annotations: record.annotations ?? [],
      political: record.political,
      thumbnail: record.thumbnail,
      stats: record.stats,
      isTemplate: record.isTemplate ?? false,
    },
    image,
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  downloadBlob(blob, `${safeFileName(record.name)}.ocmap`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function importOcmapFile(file: File): Promise<WorldMapRecord> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 .ocmap 文件')
  }
  if (!isRecord(parsed) || parsed.format !== OCMAP_FORMAT || !isRecord(parsed.map)) {
    throw new Error('缺少 OC Studio 地图标识')
  }
  const map = parsed.map
  const name = typeof map.name === 'string' ? map.name : file.name.replace(/\.[^.]+$/, '')
  const seed = typeof map.seed === 'number' ? map.seed >>> 0 : 0
  const params = normalizeMapParams(isRecord(map.params) ? (map.params as never) : undefined)
  const image = typeof parsed.image === 'string' ? await dataUrlToBlob(parsed.image) : null
  const now = Date.now()
  const record: WorldMapRecord = {
    name: name || '导入地图',
    seed,
    params,
    annotations: Array.isArray(map.annotations) ? (map.annotations as WorldMapRecord['annotations']) : [],
    political: isRecord(map.political) ? map.political : undefined,
    thumbnail: typeof map.thumbnail === 'string' ? map.thumbnail : undefined,
    imageBlob: image ?? undefined,
    stats: isRecord(map.stats) ? (map.stats as WorldMapRecord['stats']) : undefined,
    isTemplate: map.isTemplate === true,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
  const id = await db.maps.add(record)
  window.dispatchEvent(new Event('oc-maps-changed'))
  return { ...record, id }
}
