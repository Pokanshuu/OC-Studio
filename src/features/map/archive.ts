/**
 * `.ocmap`：一张地图的**可交换档案**（底图 + 生成快照 + 标注）。
 *
 * 为什么不是「导出 PNG」：PNG 是成品，拿到别人的 PNG 无法继续编辑 —— 切不了档、
 * 改不了标注、也没法在生成器里接着调。`.ocmap` 存的正是「重新画得出来」的那几项。
 *
 * 分工：
 * - **纯函数**（解析 / 序列化 / 像素→归一化换算）放这里，脚本可测（`npm run audit:maparchive`）
 * - 读写磁盘走 `saveMapImage` / `readMapImageBlob`（`assets.ts`），不在这里碰 IO
 *
 * 兼容改版（`D:\Codes\oc_editor`）导出的 `.ocmap`：那份格式同叫 `oc-studio-map`，
 * 但标注坐标是**像素**、`city` 类型我们没有对应物。所以解析层只负责如实读出
 * 「坐标空间」，由导入方在拿到图片尺寸后再换算（见 `scaleAnnotations`）。
 */
import { parseAnnotations, stringifyAnnotations, type MapAnnotation } from './annotations'
import { normalizeRelationColor } from '@/lib/relation-colors'
import { normalizeMapParams } from '@/plugins/map-generator/params'

export const OCMAP_FORMAT = 'oc-studio-map'
export const OCMAP_VERSION = 1

/** 标注坐标的口径：我们写 0–1；改版写像素（需要图片尺寸才能换算） */
export type ArchiveCoordinateSpace = 'normalized' | 'pixel'

export interface MapArchiveImage {
  /** 图片 MIME（`image/png` / `image/jpeg` …） */
  mime: string
  /** base64（不含 `data:` 前缀） */
  base64: string
}

export interface MapArchive {
  name: string
  seed?: number
  /** 生成参数（已过 `normalizeMapParams`，可直接喂给内核） */
  params?: Record<string, unknown>
  /** 当前档位（`terrain` / `contour` / …）；手传底图没有 */
  view?: string
  width?: number
  height?: number
  annotations: MapAnnotation[]
  image?: MapArchiveImage
}

export interface ParsedMapArchive {
  archive: MapArchive
  /** 标注当前是像素还是归一化坐标 */
  coordinateSpace: ArchiveCoordinateSpace
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value)
  return number !== null && number > 0 ? number : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/* ── 图片编解码 ───────────────────────────────────────────────────────── */

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
}

function mimeOfDataUrl(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl)
  return match ? match[1].toLowerCase() : null
}

/**
 * `data:` URL → `{ mime, base64 }`。
 *
 * 只认 `;base64,`：非 base64 的 data URL 是百分号编码的文本，把它当图片解析
 * 只会在后面解码时报一个看不懂的错。认不出来返回 `null`。
 */
export function dataUrlToImage(dataUrl: unknown): MapArchiveImage | null {
  if (typeof dataUrl !== 'string') return null
  const marker = dataUrl.indexOf(';base64,')
  if (!dataUrl.startsWith('data:') || marker < 0) return null
  const mime = mimeOfDataUrl(dataUrl)
  if (mime === null || !mime.startsWith('image/')) return null
  const base64 = dataUrl.slice(marker + ';base64,'.length).replace(/\s+/g, '')
  if (base64 === '') return null
  return { mime, base64 }
}

/** `{ mime, base64 }` → `data:` URL（写档案时用） */
export function imageToDataUrl(image: MapArchiveImage): string {
  return `data:${image.mime};base64,${image.base64}`
}

/** Blob（库里的底图）→ 档案里的图片字段 */
export async function blobToArchiveImage(blob: Blob): Promise<MapArchiveImage> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // 一次 `String.fromCharCode(...bytes)` 在几 MB 的图上会爆参数上限，分块转
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  const mime = blob.type !== '' ? blob.type : 'image/png'
  return { mime, base64: btoa(binary) }
}

/** 档案里的图片 → Blob（交给 `saveMapImage` 落库） */
export function archiveImageToBlob(image: MapArchiveImage): Blob {
  const binary = atob(image.base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: image.mime })
}

/** 文件名里的扩展名 → 给没有 `type` 的图片兜底 MIME */
export function mimeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? 'image/png'
}

/* ── 标注坐标换算 ─────────────────────────────────────────────────────── */

/**
 * 像素坐标 → 归一化 0–1（改版导出的档案用像素）。
 *
 * 尺寸未知时**原样返回**并交给调用方报警：硬除以 0 会把标注全部压到 (0,0)，
 * 那比不导入更糟 —— 用户会以为图上的线「被吃了」。
 */
export function scaleAnnotations(
  items: readonly MapAnnotation[],
  width: number,
  height: number,
): MapAnnotation[] {
  if (!(width > 0) || !(height > 0)) return [...items]
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
  return items.map((item) => ({
    ...item,
    points: item.points.map((point) => ({
      x: clamp01(point.x / width),
      y: clamp01(point.y / height),
    })),
  }))
}

/* ── 解析 ─────────────────────────────────────────────────────────────── */

/** 改版的标注类型：`polygon` = 我们的国界，`road` 一致，`city` 没有对应物 */
function archiveAnnotationsToRaw(
  input: unknown,
  warnings: string[],
): { raw: unknown[]; space: ArchiveCoordinateSpace } {
  if (!Array.isArray(input)) return { raw: [], space: 'normalized' }

  const raw: unknown[] = []
  let pixelVotes = 0
  let normalizedVotes = 0
  let skippedCities = 0

  for (const item of input) {
    if (!isRecord(item)) continue
    const kind = item.kind === 'border' || item.kind === 'road' ? item.kind : null
    const legacyType = item.type
    if (kind === null && legacyType === 'city') {
      skippedCities += 1
      continue
    }
    const mappedKind = kind ?? (legacyType === 'polygon' ? 'border' : legacyType === 'road' ? 'road' : null)
    if (mappedKind === null) continue

    const points = Array.isArray(item.points) ? item.points : []
    // 坐标空间按**数据本身**判：任一坐标大于 1 就说明这是像素
    for (const point of points) {
      if (!isRecord(point)) continue
      const x = finiteNumber(point.x)
      const y = finiteNumber(point.y)
      if (x === null || y === null) continue
      if (x > 1 || y > 1) pixelVotes += 1
      else normalizedVotes += 1
    }

    raw.push({
      id: typeof item.id === 'string' ? item.id : undefined,
      kind: mappedKind,
      points,
      color: item.color,
      fill: item.fill,
    })
  }

  if (skippedCities > 0) warnings.push(`忽略了 ${skippedCities} 条城市标注（本版本没有这个类型）`)
  return { raw, space: pixelVotes > normalizedVotes ? 'pixel' : 'normalized' }
}

/**
 * 像素坐标的标注：**不能走 `parseAnnotations`** —— 那个入口会把坐标夹到 0–1，
 * 换算之前就把 400px 压成 1，图上所有线会缩进左上角那一小块。
 * 所以这里单独读一遍，只做「有限数 + 非负」校验，等导入方拿到尺寸再除。
 */
function parsePixelAnnotations(raw: readonly unknown[]): MapAnnotation[] {
  const items: MapAnnotation[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const kind = item.kind === 'border' || item.kind === 'road' ? item.kind : null
    if (kind === null) continue
    const points: { x: number; y: number }[] = []
    for (const point of Array.isArray(item.points) ? item.points : []) {
      if (!isRecord(point)) continue
      const x = finiteNumber(point.x)
      const y = finiteNumber(point.y)
      if (x === null || y === null || x < 0 || y < 0) continue
      points.push({ x, y })
    }
    if (points.length < (kind === 'border' ? 3 : 2)) continue
    const color = normalizeRelationColor(item.color)
    const fill = kind === 'border' ? normalizeRelationColor(item.fill) : undefined
    items.push({
      id: typeof item.id === 'string' && item.id !== '' ? item.id : `p${items.length + 1}`,
      kind,
      points,
      ...(color ? { color } : {}),
      ...(fill ? { fill } : {}),
    })
  }
  return items
}

/**
 * 解析 `.ocmap` 文本。**坏档案抛错、好档案尽力读全**：
 * 缺标注 / 缺图片都只是少一块内容，不构成拒绝导入的理由。
 */
export function parseMapArchive(text: string): ParsedMapArchive {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('不是有效的 JSON')
  }
  if (!isRecord(parsed)) throw new Error('档案内容不是对象')
  if (parsed.format !== OCMAP_FORMAT) throw new Error('不是 OC Studio 的地图档案')

  const map = isRecord(parsed.map) ? parsed.map : null
  if (map === null) throw new Error('档案里没有地图')

  const warnings: string[] = []
  const version = finiteNumber(parsed.version)
  if (version !== null && version > OCMAP_VERSION) {
    warnings.push('档案来自更新的版本，未识别的字段已忽略')
  }

  const name = nonEmptyString(map.name) ?? '导入地图'
  const seed = finiteNumber(map.seed)
  const view = nonEmptyString(map.view) ?? undefined
  const width = positiveNumber(map.width) ?? undefined
  const height = positiveNumber(map.height) ?? undefined

  const params = isRecord(map.params)
    ? (normalizeMapParams(map.params as never) as unknown as Record<string, unknown>)
    : undefined

  const { raw, space } = archiveAnnotationsToRaw(map.annotations, warnings)
  const annotations =
    space === 'pixel' ? parsePixelAnnotations(raw) : parseAnnotations(JSON.stringify(raw))

  const image = dataUrlToImage(parsed.image)
  if (parsed.image !== undefined && image === null) warnings.push('图片字段无法识别，已跳过')

  return {
    archive: {
      name,
      ...(seed !== null ? { seed: Math.max(0, Math.round(seed)) } : {}),
      ...(params ? { params } : {}),
      ...(view ? { view } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      annotations,
      ...(image ? { image } : {}),
    },
    coordinateSpace: space,
    warnings,
  }
}

/** 组装 `.ocmap` 文本（只写归一化坐标，读的人不需要再猜） */
export function serializeMapArchive(archive: MapArchive, now: Date = new Date()): string {
  const payload = {
    format: OCMAP_FORMAT,
    version: OCMAP_VERSION,
    exportedAt: now.toISOString(),
    map: {
      name: archive.name,
      ...(archive.seed !== undefined ? { seed: archive.seed } : {}),
      ...(archive.params ? { params: archive.params } : {}),
      ...(archive.view ? { view: archive.view } : {}),
      ...(archive.width !== undefined ? { width: archive.width } : {}),
      ...(archive.height !== undefined ? { height: archive.height } : {}),
      ...(archive.annotations.length > 0 ? { annotations: JSON.parse(stringifyAnnotations(archive.annotations) ?? '[]') } : {}),
    },
    ...(archive.image ? { image: imageToDataUrl(archive.image) } : {}),
  }
  return JSON.stringify(payload)
}

/** 导出时的文件名：地图名 + `.ocmap`（去掉 Windows 非法字符） */
export function archiveFileName(name: string): string {
  const stem = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+/, '').trim() || '地图'
  return `${stem.slice(0, 80)}.ocmap`
}
