/**
 * 政治标注：地图上的**线**（`docs/地图.md` §10「政治标注」）。
 *
 * 分工是这样的 ——
 * - 点（国家 / 事件 / 词条 / 城市）已经是**锚点**，落在实体自己的 frontmatter 上，
 *   点一下就能跳过去。标注不该再存一份同样的东西。
 * - 线（国界多边形、道路折线）没有实体可以寄放，所以单独存在地图笔记的
 *   `map_annotations` 里（一条 JSON 字符串，和 `map_params` 同一个路数）。
 * - 国界的**填充色**也落在这里（`fill`，存色板中文名），只给面用；道路无填充。
 *
 * 坐标是归一化 0–1，与锚点同一套口径：换分辨率、换底图都不用重画。
 */
import { normalizeRelationColor } from '@/lib/relation-colors'

export type AnnotationKind = 'border' | 'road'

export interface AnnotationPoint {
  x: number
  y: number
}

export interface MapAnnotation {
  id: string
  kind: AnnotationKind
  /** 至少 2 个点；`border` 是闭合多边形，`road` 是折线 */
  points: AnnotationPoint[]
  /** 国界填充色（`RELATION_COLORS` 的中文名）；空 = 只画淡墨底 */
  fill?: string
}

export const ANNOTATION_LABELS: Record<AnnotationKind, string> = {
  border: '国界',
  road: '道路',
}

/** 完成一条线所需要的最少点数（国界要围出一块面） */
export function minPoints(kind: AnnotationKind): number {
  return kind === 'border' ? 3 : 2
}

function clamp01(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}

/** 后端只存 4 位小数：归一化坐标到小数点后 4 位已经是亚像素 */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function normalizePoints(input: unknown): AnnotationPoint[] {
  if (!Array.isArray(input)) return []
  const points: AnnotationPoint[] = []
  for (const item of input) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const x = clamp01(record.x)
    const y = clamp01(record.y)
    if (x === null || y === null) continue
    points.push({ x, y })
  }
  return points
}

/**
 * 读 `map_annotations`。
 *
 * 容错口径：坏 JSON 当没有、点数不够的整条丢掉（国界少于 3 点画不出面，
 * 留着只会在画布上出一条看不见的线，还会让「删除」菜单匹配到幽灵）。
 */
export function parseAnnotations(raw: string | undefined): MapAnnotation[] {
  if (!raw || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: MapAnnotation[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const kind: AnnotationKind | null =
      record.kind === 'border' ? 'border' : record.kind === 'road' ? 'road' : null
    if (!kind) continue
    const points = normalizePoints(record.points)
    if (points.length < minPoints(kind)) continue
    const id = typeof record.id === 'string' && record.id !== '' ? record.id : newAnnotationId()
    // 只有国界有填充色；非法色名一律丢掉（不猜色）
    const fill = kind === 'border' ? normalizeRelationColor(record.fill) : undefined
    out.push({ id, kind, points, ...(fill ? { fill } : {}) })
  }
  return out
}

/** 写 `map_annotations`；空数组写成 `undefined`（frontmatter 里不留空键） */
export function stringifyAnnotations(items: readonly MapAnnotation[]): string | undefined {
  if (items.length === 0) return undefined
  const payload = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    points: item.points.map((point) => ({ x: round4(point.x), y: round4(point.y) })),
    ...(item.kind === 'border' && item.fill ? { fill: item.fill } : {}),
  }))
  return JSON.stringify(payload)
}

export function newAnnotationId(): string {
  return `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/* ── 命中测试（右键删除用） ───────────────────────────────────────────── */

function distanceToSegment(point: AnnotationPoint, a: AnnotationPoint, b: AnnotationPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.min(1, Math.max(0, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/** 射线法：点是否在多边形内 */
function insidePolygon(point: AnnotationPoint, polygon: readonly AnnotationPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * 找到光标下的标注。
 *
 * 命中半径按**归一化坐标**给（0.012 ≈ 1% 图宽），和缩放无关 —— 因为
 * 判定发生在归一化空间里，放大后不会变得更难点到。
 */
export function annotationAt(
  items: readonly MapAnnotation[],
  point: AnnotationPoint,
): MapAnnotation | null {
  const radius = 0.012
  // 后画的压在上面，先测它
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'border' && insidePolygon(point, item.points)) return item
    for (let i = 0; i + 1 < item.points.length; i += 1) {
      if (distanceToSegment(point, item.points[i], item.points[i + 1]) <= radius) return item
    }
    if (item.kind === 'border') {
      const last = item.points[item.points.length - 1]
      if (distanceToSegment(point, last, item.points[0]) <= radius) return item
    }
  }
  return null
}
