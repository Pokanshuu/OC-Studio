'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Brush, Eraser, Maximize, Minus, Plus, X } from 'lucide-react'
import type { MapAnnotation, MapAnnotationPoint } from '@/types'
import type { MapLine, MapPolygon, MapVectors } from '../types'
import type { PoliticalData } from '../political'

export interface RegionOverlay {
  id: number
  name: string
  url: string
  placement: { x: number; y: number; width: number; height: number }
}

interface MapCanvasProps {
  image: ImageData | null
  view: string
  line: MapLine
  onLineChange: (line: MapLine) => void
  annotations: MapAnnotation[]
  onAddAnnotation: (annotation: MapAnnotation) => void
  onDeleteAnnotation?: (id: string) => void
  paintBlob?: Blob | null
  onPaintChange?: (blob: Blob | null) => void
  political?: PoliticalData | null
  politicalVisible?: boolean
  selectedStateId?: number | null
  annotationCountry?: { id: number; name: string; color: string } | null
  annotationRoadColor?: string
  showContourWater?: boolean
  politicalEditStateId?: number | null
  onPoliticalAssign?: (x: number, y: number) => void
  onCountryDrop?: (countryId: number, x: number, y: number) => void
  onWorldEntryDrop?: (entryId: number, x: number, y: number) => void
  roadEditMode?: boolean
  onRoadPoint?: (x: number, y: number) => void
  cityMoveMode?: boolean
  onCityMove?: (x: number, y: number) => void
  roadNodeEditRoadId?: number | null
  onRoadNodeMove?: (roadId: number, index: number, x: number, y: number) => void
  regionOverlays?: RegionOverlay[]
  onRegionPlacementChange?: (
    id: number,
    placement: { x: number; y: number; width: number; height: number },
  ) => void
  vectors?: MapVectors | null
}

interface CanvasBox {
  width: number
  height: number
}

function createAnnotationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `anno-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function polygonPath(polygon: MapPolygon): string {
  if (polygon.points.length === 0) return ''
  return (
    polygon.points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ') + ' Z'
  )
}

function segmentPath(segments: Array<{ ax: number; ay: number; bx: number; by: number }>): string {
  const parts: string[] = []
  for (const segment of segments) {
    parts.push(`M${segment.ax.toFixed(2)} ${segment.ay.toFixed(2)}L${segment.bx.toFixed(2)} ${segment.by.toFixed(2)}`)
  }
  return parts.join('')
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length < 3) {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join('')
  }
  const parts = [`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`]
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]
    const current = points[i]
    const next = points[i + 1]
    const after = points[i + 2] ?? next
    const c1x = current.x + (next.x - previous.x) / 6
    const c1y = current.y + (next.y - previous.y) / 6
    const c2x = next.x - (after.x - current.x) / 6
    const c2y = next.y - (after.y - current.y) / 6
    parts.push(
      `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`,
    )
  }
  return parts.join('')
}

function pointInPolygon(point: MapAnnotationPoint, polygon: MapAnnotationPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-6) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function annotationAt(
  point: MapAnnotationPoint,
  annotations: MapAnnotation[],
): MapAnnotation | null {
  // 从后往前命中最近一次绘制的标注。
  for (let index = annotations.length - 1; index >= 0; index--) {
    const annotation = annotations[index]
    if (annotation.type === 'polygon' && annotation.points.length >= 3) {
      if (pointInPolygon(point, annotation.points)) return annotation
    } else if (annotation.type === 'city' && annotation.points[0]) {
      const dx = annotation.points[0].x - point.x
      const dy = annotation.points[0].y - point.y
      if (dx * dx + dy * dy <= 18 * 18) return annotation
    } else if (annotation.type === 'road') {
      for (let index = 1; index < annotation.points.length; index++) {
        const a = annotation.points[index - 1]
        const b = annotation.points[index]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const length = dx * dx + dy * dy
        if (length === 0) continue
        const t = Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
        )
        const px = a.x + dx * t
        const py = a.y + dy * t
        if (Math.hypot(px - point.x, py - point.y) <= 10) return annotation
      }
    }
  }
  return null
}

function drawPoliticalLayer(
  context: CanvasRenderingContext2D,
  political: PoliticalData,
  imageWidth: number,
  imageHeight: number,
  selectedStateId: number | null,
): void {
  const stateById = new Map(political.states.map((state) => [state.id, state]))
  const cellWidth = imageWidth / political.cols
  const cellHeight = imageHeight / political.rows
  context.save()

  for (let y = 0; y < political.rows; y++) {
    for (let x = 0; x < political.cols; x++) {
      const owner = political.owner[y * political.cols + x]
      if (!owner) continue
      const state = stateById.get(owner)
      if (!state) continue
      context.globalAlpha = owner === selectedStateId ? 0.34 : 0.18
      context.fillStyle = state.color
      context.fillRect(x * cellWidth, y * cellHeight, cellWidth + 0.5, cellHeight + 0.5)
    }
  }

  context.globalAlpha = 0.9
  context.strokeStyle = '#3F3832'
  context.lineWidth = Math.max(1, imageWidth / political.cols / 10)
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
  context.lineWidth = Math.max(1, imageWidth / political.cols / 14)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const road of political.roads ?? []) {
    if (road.points.length < 2) continue
    context.beginPath()
    road.points.forEach((point, index) => {
      const x = point.x * imageWidth
      const y = point.y * imageHeight
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
  }

  for (const city of political.cities) {
    const state = stateById.get(city.stateId)
    if (!state) continue
    const x = city.x * imageWidth
    const y = city.y * imageHeight
    context.globalAlpha = 1
    context.beginPath()
    context.arc(x, y, city.capital ? 5 : 3.2, 0, Math.PI * 2)
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

function drawAnnotationLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  context.save()
  context.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const metrics = context.measureText(text)
  const width = metrics.width + 14
  const height = 20
  context.fillStyle = 'rgba(254, 252, 248, 0.92)'
  context.strokeStyle = color
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(x - width / 2, y - height / 2, width, height, 4)
  context.fill()
  context.stroke()
  context.fillStyle = '#2B2B2B'
  context.fillText(text, x, y + 0.5)
  context.restore()
}

export function MapCanvas({
  image,
  view,
  line,
  onLineChange,
  annotations,
  onAddAnnotation,
  onDeleteAnnotation,
  paintBlob,
  onPaintChange,
  political,
  politicalVisible = false,
  selectedStateId = null,
  annotationCountry = null,
  annotationRoadColor = '#8A6A46',
  showContourWater = false,
  politicalEditStateId = null,
  onPoliticalAssign,
  onCountryDrop,
  onWorldEntryDrop,
  roadEditMode = false,
  onRoadPoint,
  cityMoveMode = false,
  onCityMove,
  roadNodeEditRoadId = null,
  onRoadNodeMove,
  regionOverlays = [],
  onRegionPlacementChange,
  vectors,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState<CanvasBox>({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [tool, setTool] = useState<'none' | 'polygon' | 'city' | 'road'>('none')
  const [paintTool, setPaintTool] = useState<'none' | 'brush' | 'eraser'>('none')
  const [paintColor, setPaintColor] = useState('#5E8B5A')
  const [paintSize, setPaintSize] = useState(18)
  const paintStrokeRef = useRef<null | { x: number; y: number }>(null)
  const politicalStrokeRef = useRef(false)
  const roadNodeRef = useRef<null | { roadId: number; index: number }>(null)
  const activeRegionRef = useRef<MapAnnotation | null>(null)
  const [polygon, setPolygon] = useState<MapAnnotationPoint[]>([])
  const [regionPreview, setRegionPreview] = useState<
    Record<number, { x: number; y: number; width: number; height: number }>
  >({})
  const [menu, setMenu] = useState<{
    x: number
    y: number
    point: MapAnnotationPoint
    annotation?: MapAnnotation
  } | null>(null)
  const drawingRef = useRef<null | { ax: number; ay: number }>(null)
  const panRef = useRef<null | { startX: number; startY: number; originX: number; originY: number }>(null)
  const regionDragRef = useRef<null | {
    id: number
    mode: 'move' | 'resize'
    startX: number
    startY: number
    placement: { x: number; y: number; width: number; height: number }
  }>(null)

  const imageWidth = image?.width ?? 1024
  const imageHeight = image?.height ?? 1024

  const vectorPaths = useMemo(() => {
    if (!vectors) return null
    const coast = segmentPath(vectors.coastline)
    const lakes = vectors.lakes.map(polygonPath).join(' ')
    const lakeContours = segmentPath(vectors.lakeContours)
    // 更细的分级：支流保持细线，只有干流才明显变宽。
    const bucketWidths = [0.5, 0.75, 1.05, 1.45, 2.0, 2.8]
    const bucketOf = (width: number): number =>
      width < 0.9 ? 0 : width < 1.2 ? 1 : width < 1.6 ? 2 : width < 2.1 ? 3 : width < 2.7 ? 4 : 5
    const paths: string[][] = bucketWidths.map(() => [])

    if (vectors.riverPaths && vectors.riverPaths.length > 0) {
      for (const river of vectors.riverPaths) {
        paths[bucketOf(river.width)].push(smoothPath(river.points))
      }
    } else {
      const segments: Array<Array<(typeof vectors.rivers)[number]>> = bucketWidths.map(() => [])
      for (const river of vectors.rivers) {
        segments[bucketOf(river.width)].push(river)
      }
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].length > 0) paths[i].push(segmentPath(segments[i]))
      }
    }

    return {
      coast,
      lakes,
      lakeContours,
      rivers: bucketWidths
        .map((width, index) => ({ width, path: paths[index].join(' ') }))
        .filter((river) => river.path.length > 0),
    }
  }, [vectors])

  const clampPan = useCallback(
    (x: number, y: number, nextZoom: number): { x: number; y: number } => {
      const maxX = Math.max(0, (box.width * (nextZoom - 1)) / 2)
      const maxY = Math.max(0, (box.height * (nextZoom - 1)) / 2)
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      }
    },
    [box.height, box.width],
  )

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = (): void => {
      const rect = element.getBoundingClientRect()
      const availableWidth = Math.max(200, rect.width - 32)
      const availableHeight = Math.max(160, rect.height - 32)
      const aspect = imageWidth / imageHeight
      let width = availableWidth
      let height = width / aspect
      if (height > availableHeight) {
        height = availableHeight
        width = height * aspect
      }
      setBox((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width: Math.floor(width), height: Math.floor(height) },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [imageWidth, imageHeight])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [imageWidth, imageHeight])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.putImageData(image, 0, 0)
  }, [image])

  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    canvas.width = imageWidth
    canvas.height = imageHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, imageWidth, imageHeight)

    if (politicalVisible && political) {
      drawPoliticalLayer(context, political, imageWidth, imageHeight, selectedStateId)
    }

    // 地图标注：圈地多边形 + 城邦点。
    for (const annotation of annotations) {
      if (annotation.type === 'polygon' && annotation.points.length >= 3) {
        context.save()
        context.beginPath()
        annotation.points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y)
          else context.lineTo(point.x, point.y)
        })
        context.closePath()
        context.fillStyle = `${annotation.color}2e`
        context.fill()
        context.strokeStyle = annotation.color
        context.lineWidth = 2.5
        context.stroke()
        const cx = annotation.points.reduce((sum, p) => sum + p.x, 0) / annotation.points.length
        const cy = annotation.points.reduce((sum, p) => sum + p.y, 0) / annotation.points.length
        drawAnnotationLabel(context, annotation.name, cx, cy, annotation.color)
        context.restore()
      } else if (annotation.type === 'road' && annotation.points.length >= 2) {
        context.save()
        context.beginPath()
        annotation.points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y)
          else context.lineTo(point.x, point.y)
        })
        context.strokeStyle = annotation.color
        context.lineWidth = 3
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.stroke()
        context.restore()
      } else if (annotation.type === 'city' && annotation.points[0]) {
        const point = annotation.points[0]
        context.save()
        context.beginPath()
        context.arc(point.x, point.y, 8, 0, Math.PI * 2)
        context.fillStyle = '#FEFCF8'
        context.fill()
        context.lineWidth = 3
        context.strokeStyle = annotation.color
        context.stroke()
        context.beginPath()
        context.arc(point.x, point.y, 3, 0, Math.PI * 2)
        context.fillStyle = annotation.color
        context.fill()
        drawAnnotationLabel(context, annotation.name, point.x, point.y - 14, annotation.color)
        context.restore()
      }
    }

    // 正在绘制的多边形。
    if (polygon.length > 0) {
      context.save()
      context.beginPath()
      polygon.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.strokeStyle = '#B36651'
      context.lineWidth = 2
      context.setLineDash([6, 4])
      context.stroke()
      context.setLineDash([])
      for (const point of polygon) {
        context.beginPath()
        context.arc(point.x, point.y, 4, 0, Math.PI * 2)
        context.fillStyle = '#B36651'
        context.fill()
      }
      context.restore()
    }

    if (view !== 'profile') return
    context.save()
    context.lineCap = 'round'
    context.strokeStyle = 'rgba(43, 43, 43, 0.55)'
    context.lineWidth = 6
    context.beginPath()
    context.moveTo(line.ax, line.ay)
    context.lineTo(line.bx, line.by)
    context.stroke()
    context.strokeStyle = '#E8744B'
    context.lineWidth = 2.5
    context.beginPath()
    context.moveTo(line.ax, line.ay)
    context.lineTo(line.bx, line.by)
    context.stroke()
    for (const [x, y] of [
      [line.ax, line.ay],
      [line.bx, line.by],
    ]) {
      context.beginPath()
      context.arc(x, y, 7, 0, Math.PI * 2)
      context.fillStyle = '#FEFCF8'
      context.fill()
      context.lineWidth = 3
      context.strokeStyle = '#B36651'
      context.stroke()
    }
    context.restore()
  }, [
    annotations,
    line,
    polygon,
    view,
    imageWidth,
    imageHeight,
    political,
    politicalVisible,
    selectedStateId,
  ])

  const toMapPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * imageWidth
    const y = ((event.clientY - rect.top) / rect.height) * imageHeight
    return {
      x: Math.max(0, Math.min(imageWidth - 1, x)),
      y: Math.max(0, Math.min(imageHeight - 1, y)),
    }
  }, [imageHeight, imageWidth])

  useEffect(() => {
    const canvas = paintRef.current
    if (!canvas) return
    canvas.width = imageWidth
    canvas.height = imageHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, imageWidth, imageHeight)
    if (!paintBlob) return
    let cancelled = false
    void createImageBitmap(paintBlob).then((bitmap) => {
      if (cancelled) {
        bitmap.close()
        return
      }
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [imageHeight, imageWidth, paintBlob])

  const commitPaint = useCallback(() => {
    const canvas = paintRef.current
    if (!canvas || !onPaintChange) return
    canvas.toBlob((blob) => onPaintChange(blob), 'image/png')
  }, [onPaintChange])

  const paintAt = useCallback(
    (point: { x: number; y: number }, from: { x: number; y: number } | null) => {
      const canvas = paintRef.current
      const context = canvas?.getContext('2d')
      if (!context) return
      context.save()
      context.globalCompositeOperation = paintTool === 'eraser' ? 'destination-out' : 'source-over'
      context.strokeStyle = paintColor
      context.fillStyle = paintColor
      context.lineWidth = paintSize
      context.lineCap = 'round'
      context.lineJoin = 'round'
      if (from) {
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.lineTo(point.x, point.y)
        context.stroke()
      } else {
        context.beginPath()
        context.arc(point.x, point.y, paintSize / 2, 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
    },
    [paintColor, paintSize, paintTool],
  )

  const handlePaintPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (paintTool === 'none' || event.button !== 0) return
      const point = toMapPoint(event)
      if (!point) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      paintStrokeRef.current = point
      paintAt(point, null)
    },
    [paintAt, paintTool, toMapPoint],
  )

  const handlePaintPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!paintStrokeRef.current || paintTool === 'none') return
      const point = toMapPoint(event)
      if (!point) return
      paintAt(point, paintStrokeRef.current)
      paintStrokeRef.current = point
    },
    [paintAt, paintTool, toMapPoint],
  )

  const handlePaintPointerUp = useCallback(() => {
    if (!paintStrokeRef.current) return
    paintStrokeRef.current = null
    commitPaint()
  }, [commitPaint])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button === 2) return
    const point = toMapPoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)

    if (event.button === 0 && (tool === 'polygon' || tool === 'road')) {
      setPolygon((current) => [...current, point])
      return
    }
    if (event.button === 0 && tool === 'city') {
      const region = activeRegionRef.current
      const name = window.prompt('城市名称', '新城市')
      if (name !== null) {
        onAddAnnotation({
          id: createAnnotationId(),
          type: 'city',
          name: name.trim() || '新城市',
          color: region?.color ?? annotationCountry?.color ?? '#4D7F8F',
          points: [point],
          linkedEntity:
            region?.linkedEntity ??
            (annotationCountry ? { type: 'country', id: annotationCountry.id } : undefined),
        })
      }
      activeRegionRef.current = null
      setTool('none')
      return
    }

    if (cityMoveMode && onCityMove) {
      onCityMove(point.x / imageWidth, point.y / imageHeight)
      return
    }

    if (roadNodeEditRoadId !== null && political && onRoadNodeMove) {
      const road = political.roads?.find((item) => item.id === roadNodeEditRoadId)
      if (road) {
        const threshold = imageWidth / 90
        let bestIndex = -1
        let bestDistance = threshold * threshold
        road.points.forEach((node, index) => {
          const dx = node.x * imageWidth - point.x
          const dy = node.y * imageHeight - point.y
          const distance = dx * dx + dy * dy
          if (distance <= bestDistance) {
            bestDistance = distance
            bestIndex = index
          }
        })
        if (bestIndex >= 0) {
          roadNodeRef.current = { roadId: road.id, index: bestIndex }
          onRoadNodeMove(road.id, bestIndex, point.x / imageWidth, point.y / imageHeight)
          return
        }
      }
    }

    if (roadEditMode && onRoadPoint) {
      onRoadPoint(point.x / imageWidth, point.y / imageHeight)
      return
    }

    if (politicalEditStateId && onPoliticalAssign) {
      politicalStrokeRef.current = true
      onPoliticalAssign(point.x / imageWidth, point.y / imageHeight)
      return
    }

    if (view === 'profile' && event.button === 1) {
      event.preventDefault()
      drawingRef.current = { ax: point.x, ay: point.y }
      onLineChange({ ax: point.x, ay: point.y, bx: point.x + 1, by: point.y + 1 })
      panRef.current = null
      return
    }

    // 剖面视图下左键仍用于平移；只有中键绘制剖面。
    drawingRef.current = null
    // 绘制国家/道路时左键连线，中键仍用于拖动画布。
    if (event.button === 1) event.preventDefault()
    drawingRef.current = null
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    }
  }, [
    onAddAnnotation,
    onLineChange,
    onPoliticalAssign,
    pan.x,
    pan.y,
    politicalEditStateId,
    imageHeight,
    imageWidth,
    toMapPoint,
    tool,
    view,
  ])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (roadNodeRef.current && onRoadNodeMove) {
      const point = toMapPoint(event)
      if (point) {
        onRoadNodeMove(
          roadNodeRef.current.roadId,
          roadNodeRef.current.index,
          point.x / imageWidth,
          point.y / imageHeight,
        )
      }
      return
    }
    if (politicalStrokeRef.current && politicalEditStateId && onPoliticalAssign) {
      const point = toMapPoint(event)
      if (point) onPoliticalAssign(point.x / imageWidth, point.y / imageHeight)
      return
    }
    if (drawingRef.current) {
      const point = toMapPoint(event)
      if (!point) return
      const start = drawingRef.current
      if (Math.abs(point.x - start.ax) + Math.abs(point.y - start.ay) < 3) return
      onLineChange({ ax: start.ax, ay: start.ay, bx: point.x, by: point.y })
      return
    }
    if (panRef.current) {
      const start = panRef.current
      setPan(
        clampPan(
          start.originX + event.clientX - start.startX,
          start.originY + event.clientY - start.startY,
          zoom,
        ),
      )
    }
  }, [clampPan, onLineChange, toMapPoint, zoom])

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = null
    panRef.current = null
    politicalStrokeRef.current = false
    roadNodeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    // 3072 底图在 5x 时仍接近 1:1；再放大只会暴露像素，不提供更多地形信息。
    const next = Math.max(0.5, Math.min(5, zoom * factor))
    setZoom(next)
    setPan((currentPan) => clampPan(currentPan.x, currentPan.y, next))
  }, [clampPan, zoom])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    setPan((current) => clampPan(current.x, current.y, zoom))
  }, [clampPan, zoom])

  const startRegionDrag = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      overlay: RegionOverlay,
      mode: 'move' | 'resize',
    ) => {
      if (!onRegionPlacementChange) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      regionDragRef.current = {
        id: overlay.id,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        placement: regionPreview[overlay.id] ?? overlay.placement,
      }
    },
    [onRegionPlacementChange, regionPreview],
  )

  const moveRegionDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = regionDragRef.current
      if (!drag || !box.width || !box.height) return
      const dx = (event.clientX - drag.startX) / (box.width * zoom)
      const dy = (event.clientY - drag.startY) / (box.height * zoom)
      const next =
        drag.mode === 'move'
          ? {
              x: Math.max(0, Math.min(1 - drag.placement.width, drag.placement.x + dx)),
              y: Math.max(0, Math.min(1 - drag.placement.height, drag.placement.y + dy)),
              width: drag.placement.width,
              height: drag.placement.height,
            }
          : {
              x: drag.placement.x,
              y: drag.placement.y,
              width: Math.max(0.06, Math.min(1 - drag.placement.x, drag.placement.width + dx)),
              height: Math.max(0.06, Math.min(1 - drag.placement.y, drag.placement.height + dy)),
            }
      setRegionPreview((current) => ({ ...current, [drag.id]: next }))
    },
    [box.height, box.width, zoom],
  )

  const endRegionDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = regionDragRef.current
      if (!drag) return
      regionDragRef.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      const placement = regionPreview[drag.id] ?? drag.placement
      onRegionPlacementChange?.(drag.id, placement)
      setRegionPreview((current) => {
        const next = { ...current }
        delete next[drag.id]
        return next
      })
    },
    [onRegionPlacementChange, regionPreview],
  )

  const finishPolygon = useCallback(() => {
    const region = activeRegionRef.current
    if (tool === 'road' && polygon.length >= 2) {
      onAddAnnotation({
        id: createAnnotationId(),
        type: 'road',
        name: region?.name ? `${region.name}道路` : '道路',
        color: annotationRoadColor,
        points: polygon,
        linkedEntity:
          region?.linkedEntity ??
          (annotationCountry ? { type: 'country', id: annotationCountry.id } : undefined),
      })
    } else if (tool === 'polygon' && polygon.length >= 3) {
      const name = window.prompt(
        annotationCountry ? '国家区域名称' : '区域名称',
        annotationCountry?.name ?? '未命名区域',
      )
      if (name === null) {
        setPolygon([])
        setTool('none')
        return
      }
      onAddAnnotation({
        id: createAnnotationId(),
        type: 'polygon',
        name: name.trim() || annotationCountry?.name || '未命名区域',
        color: annotationCountry?.color ?? '#B36651',
        points: polygon,
        linkedEntity: annotationCountry
          ? { type: 'country', id: annotationCountry.id }
          : undefined,
      })
    }
    activeRegionRef.current = null
    setPolygon([])
    setTool('none')
  }, [annotationCountry, annotationRoadColor, onAddAnnotation, polygon, tool])

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (
      (tool === 'polygon' && polygon.length >= 3) ||
      (tool === 'road' && polygon.length >= 2)
    ) {
      finishPolygon()
      return
    }
    const point = toMapPoint(event)
    if (!point) return
    setMenu({
      x: event.clientX,
      y: event.clientY,
      point,
      annotation: annotationAt(point, annotations) ?? undefined,
    })
  }, [annotations, finishPolygon, polygon.length, toMapPoint, tool])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setTool('none')
        setPolygon([])
        setMenu(null)
      } else if (
        event.key === 'Enter' &&
        (tool === 'polygon' || tool === 'road')
      ) {
        finishPolygon()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finishPolygon, tool])

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-4"
      onWheel={handleWheel}
      onDragOver={(event) => {
        if (!onCountryDrop && !onWorldEntryDrop) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        if (!onCountryDrop && !onWorldEntryDrop) return
        event.preventDefault()
        const point = toMapPoint(event)
        if (!point) return
        const countryRaw = event.dataTransfer.getData('application/x-oc-country')
        if (countryRaw && onCountryDrop) {
          const countryId = Number(countryRaw)
          if (Number.isFinite(countryId)) {
            onCountryDrop(countryId, point.x / imageWidth, point.y / imageHeight)
          }
          return
        }
        const entryRaw = event.dataTransfer.getData('application/x-oc-world')
        if (entryRaw && onWorldEntryDrop) {
          const entryId = Number(entryRaw)
          if (Number.isFinite(entryId)) {
            onWorldEntryDrop(entryId, point.x / imageWidth, point.y / imageHeight)
          }
        }
      }}
    >
      <div
        className="relative shrink-0 overflow-hidden rounded-sm border border-line bg-paper-card shadow-[0_18px_45px_rgba(43,43,43,0.12)]"
        style={{
          width: box.width,
          height: box.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        <canvas
          ref={canvasRef}
          width={imageWidth}
          height={imageHeight}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'auto' }}
        />
        {vectorPaths ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {vectorPaths.coast ? (
              <path
                d={vectorPaths.coast}
                fill="none"
                stroke="#284B5A"
                strokeOpacity={0.55}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ) : null}
            {(view !== 'contour' || showContourWater) && vectorPaths.lakes ? (
              <path
                d={vectorPaths.lakes}
                fill={view === 'contour' ? '#B0C6CA' : '#4E949E'}
                fillOpacity={view === 'contour' ? 0.9 : 1}
                stroke="none"
              />
            ) : null}
            {(view !== 'contour' || showContourWater) && vectorPaths.lakeContours ? (
              <path
                d={vectorPaths.lakeContours}
                fill="none"
                stroke={view === 'contour' ? '#528191' : '#2E5F6A'}
                strokeOpacity={view === 'contour' ? 0.55 : 0.3}
                strokeWidth={view === 'contour' ? 0.75 : 0.6}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ) : null}
            {(view !== 'contour' || showContourWater) && vectorPaths.rivers.map((river) => (
              <path
                key={river.width}
                d={river.path}
                fill="none"
                stroke={view === 'contour' ? '#528191' : '#3E88A4'}
                strokeOpacity={view === 'contour' ? 0.8 : 0.95}
                strokeWidth={
                  view === 'contour'
                    ? Math.min(1.1, 0.55 + Math.log2(1 + river.width) * 0.1)
                    : river.width
                }
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        ) : null}
        <canvas
          ref={paintRef}
          width={imageWidth}
          height={imageHeight}
          className="absolute inset-0 h-full w-full"
          style={{
            touchAction: 'none',
            pointerEvents: paintTool === 'none' ? 'none' : 'auto',
            cursor: paintTool === 'none' ? 'default' : 'crosshair',
          }}
          onPointerDown={handlePaintPointerDown}
          onPointerMove={handlePaintPointerMove}
          onPointerUp={handlePaintPointerUp}
          onPointerCancel={handlePaintPointerUp}
        />
        <canvas
          ref={overlayRef}
          width={imageWidth}
          height={imageHeight}
          className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none', pointerEvents: paintTool === 'none' ? 'auto' : 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onAuxClick={(event) => event.preventDefault()}
          onContextMenu={handleContextMenu}
          onDoubleClick={() => {
            if (tool === 'polygon' || tool === 'road') finishPolygon()
            else resetView()
          }}
        />
        {regionOverlays.map((overlay) => {
          const placement = regionPreview[overlay.id] ?? overlay.placement
          return (
            <div
              key={overlay.id}
              className="absolute z-10 border-2 border-[#4E949E] bg-paper/10 shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
              style={{
                left: `${placement.x * 100}%`,
                top: `${placement.y * 100}%`,
                width: `${placement.width * 100}%`,
                height: `${placement.height * 100}%`,
                cursor: 'move',
              }}
              title={`${overlay.name} · 拖动移动，右下角缩放`}
              onPointerDown={(event) => startRegionDrag(event, overlay, 'move')}
              onPointerMove={moveRegionDrag}
              onPointerUp={endRegionDrag}
              onPointerCancel={endRegionDrag}
            >
              <img
                src={overlay.url}
                alt={overlay.name}
                className="h-full w-full select-none object-cover"
                draggable={false}
              />
              <span className="absolute left-1 top-1 rounded bg-paper/85 px-1 py-0.5 text-[10px] text-ink backdrop-blur">
                {overlay.name}
              </span>
              <div
                className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-paper bg-[#4E949E]"
                onPointerDown={(event) => startRegionDrag(event, overlay, 'resize')}
                onPointerMove={moveRegionDrag}
                onPointerUp={endRegionDrag}
                onPointerCancel={endRegionDrag}
              />
            </div>
          )
        })}

        {!image ? (
          <div className="absolute inset-0 flex items-center justify-center bg-paper-alt">
            <span className="text-sm text-ink-muted">等待地图生成</span>
          </div>
        ) : null}
      </div>

      {tool !== 'none' ? (
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded border border-line bg-paper/95 px-3 py-2 text-[10px] text-ink-muted shadow-sm backdrop-blur">
          <span>
            {tool === 'polygon'
              ? '圈国家区域：左键添加顶点，中键拖动地图，右键 / Enter / 双击完成，Esc 取消'
              : tool === 'road'
                ? '画道路：左键添加折点，中键拖动地图，右键 / Enter / 双击完成，Esc 取消'
                : '放置城市：点击地图放置点位'}
          </span>
          <button
            onClick={() => {
              setTool('none')
              setPolygon([])
            }}
            className="text-ink-faint hover:text-ink"
            title="取消"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {menu ? (
        <div
          className="fixed z-50 w-40 rounded border border-line bg-paper p-1 text-xs shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu.annotation ? (
            <>
              <div className="truncate px-2 py-1 text-[10px] text-ink-faint">
                {menu.annotation.type === 'polygon'
                  ? '国家区域'
                  : menu.annotation.type === 'road'
                    ? '道路'
                    : '城邦'}{' '}
                · {menu.annotation.name}
              </div>
              {menu.annotation.type === 'polygon' ? (
                <>
                  <button
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-muted hover:bg-paper-card hover:text-ink"
                    onClick={() => {
                      activeRegionRef.current = menu.annotation ?? null
                      setPolygon([])
                      setTool('city')
                      setMenu(null)
                    }}
                  >
                    放置城市
                  </button>
                  <button
                    className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-muted hover:bg-paper-card hover:text-ink"
                    onClick={() => {
                      activeRegionRef.current = menu.annotation ?? null
                      setPolygon([])
                      setTool('road')
                      setMenu(null)
                    }}
                  >
                    画道路
                  </button>
                </>
              ) : null}
              <button
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-error hover:bg-paper-card"
                onClick={() => {
                  onDeleteAnnotation?.(menu.annotation!.id)
                  setMenu(null)
                }}
              >
                删除此标注
              </button>
              <button
                className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-faint hover:bg-paper-card hover:text-ink"
                onClick={() => setMenu(null)}
              >
                取消
              </button>
            </>
          ) : (
            <>
          <button
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-muted hover:bg-paper-card hover:text-ink"
            onClick={() => {
              setTool('polygon')
              setPolygon([menu.point])
              setMenu(null)
            }}
          >
            圈国家区域（多边形）
          </button>
          <button
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-muted hover:bg-paper-card hover:text-ink"
            onClick={() => {
              setTool('road')
              setPolygon([])
              setMenu(null)
            }}
          >
            画道路（折线）
          </button>
          <button
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-muted hover:bg-paper-card hover:text-ink"
            onClick={() => {
              setTool('city')
              setMenu(null)
            }}
          >
            放置城市
          </button>
          <button
            className="flex w-full items-center rounded px-2 py-1.5 text-left text-ink-faint hover:bg-paper-card hover:text-ink"
            onClick={() => setMenu(null)}
          >
            取消
          </button>
            </>
          )}
        </div>
      ) : null}

      <div className="hidden" aria-hidden="true">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setTool('none')
              setPaintTool(paintTool === 'brush' ? 'none' : 'brush')
            }}
            className={`flex h-7 items-center gap-1 rounded px-2 text-[10px] ${
              paintTool === 'brush' ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-paper-card hover:text-ink'
            }`}
          >
            <Brush size={12} strokeWidth={2} />
            手绘
          </button>
          <button
            type="button"
            onClick={() => {
              setTool('none')
              setPaintTool(paintTool === 'eraser' ? 'none' : 'eraser')
            }}
            className={`flex h-7 w-7 items-center justify-center rounded ${
              paintTool === 'eraser' ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-paper-card hover:text-ink'
            }`}
            title="橡皮擦"
          >
            <Eraser size={12} strokeWidth={2} />
          </button>
        </div>
        {paintTool !== 'none' ? (
          <>
            <div className="flex items-center gap-1">
              {['#5E8B5A', '#8FA36B', '#B7A17A', '#8B8579', '#3E88A4', '#2E5F6A'].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setPaintColor(color)}
                  className={`h-4 w-4 rounded-full border ${
                    paintColor === color ? 'border-ink' : 'border-line'
                  }`}
                  style={{ background: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-[9px] text-ink-faint">笔刷</span>
              <input
                type="range"
                min={4}
                max={80}
                value={paintSize}
                onChange={(event) => setPaintSize(Number(event.target.value))}
                className="h-1 w-20 accent-[#5E8B5A]"
              />
              <button
                type="button"
                className="text-[9px] text-ink-faint hover:text-error"
                onClick={() => {
                  const canvas = paintRef.current
                  const context = canvas?.getContext('2d')
                  if (canvas && context) {
                    context.clearRect(0, 0, canvas.width, canvas.height)
                    commitPaint()
                  }
                }}
              >
                清除
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded border border-line bg-paper/90 p-1 shadow-sm backdrop-blur">
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
          className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-paper-card hover:text-ink"
          title="缩小"
        >
          <Minus size={13} strokeWidth={2} />
        </button>
        <span className="w-12 text-center font-mono text-[10px] text-ink-faint">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
          className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-paper-card hover:text-ink"
          title="放大"
        >
          <Plus size={13} strokeWidth={2} />
        </button>
        <button
          onClick={resetView}
          className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-paper-card hover:text-ink"
          title="复位视图"
        >
          <Maximize size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
