'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '@/lib/settings'
import { BIOME_COLORS, BIOME_NAMES } from '../types'
import type { ProfilePoint } from '../profile'

interface ProfileChartProps {
  points: ProfilePoint[]
  distanceKm: number
}

const MARGIN = { left: 58, right: 16, top: 16, bottom: 42 }
const BIOME_STRIP = 12

function niceStep(rough: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, rough))))
  const normalized = rough / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

export function ProfileChart({ points, distanceKm }: ProfileChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 600, height: 220 })
  const [hover, setHover] = useState<number | null>(null)
  const { settings } = useSettings()
  const dark = useMemo(() => {
    if (typeof window === 'undefined') return false
    if (settings.theme === 'dark') return true
    if (settings.theme === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }, [settings.theme])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = (): void => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.max(280, Math.floor(rect.width)),
        height: Math.max(160, Math.floor(rect.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length === 0) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = size.width
    const height = size.height
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    const colors = {
      ink: dark ? '#E3DFD8' : '#2B2B2B',
      muted: dark ? '#A5A098' : '#6E6A63',
      faint: dark ? '#6E6A63' : '#A5A098',
      line: dark ? '#38352F' : '#E7E3DC',
      paper: dark ? '#1C1B1A' : '#FEFCF8',
      water: dark ? '#5F92A3' : '#6F9DAA',
      waterDeep: dark ? '#356273' : '#4D7F8F',
      land: dark ? '#8FA079' : '#8EA073',
      landDeep: dark ? '#6D7E5D' : '#6F825B',
      accent: '#B36651',
    }

    const plotW = width - MARGIN.left - MARGIN.right
    const plotH = height - MARGIN.top - MARGIN.bottom
    const maxEle = Math.max(800, ...points.map((p) => p.elevation))
    const minEle = Math.min(-200, ...points.map((p) => p.elevation))
    const step = niceStep((maxEle * 1.06 - minEle * 1.02) / 5)
    const yMax = Math.ceil((maxEle * 1.06) / step) * step
    const yMin = Math.floor((minEle * 1.02) / step) * step
    const tickCount = Math.max(2, Math.round((yMax - yMin) / step))
    const xScale = (distanceKm > 0 ? distanceKm : 1) / plotW
    const yScale = (yMax - yMin) / plotH
    const px = (km: number): number => MARGIN.left + km / xScale
    const py = (ele: number): number => MARGIN.top + (yMax - ele) / yScale

    // 网格
    context.strokeStyle = colors.line
    context.lineWidth = 1
    context.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.fillStyle = colors.muted
    for (let i = 0; i <= tickCount; i++) {
      const ele = yMin + step * i
      const y = py(ele)
      context.beginPath()
      context.moveTo(MARGIN.left, y)
      context.lineTo(width - MARGIN.right, y)
      context.stroke()
      context.textAlign = 'right'
      context.textBaseline = 'middle'
      context.fillText(`${Math.round(ele).toLocaleString()}m`, MARGIN.left - 8, y)
    }
    for (let i = 0; i <= 4; i++) {
      const km = (distanceKm * i) / 4
      const x = px(km)
      context.beginPath()
      context.moveTo(x, MARGIN.top)
      context.lineTo(x, MARGIN.top + plotH)
      context.stroke()
      context.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'
      context.textBaseline = 'top'
      context.fillText(`${Math.round(km).toLocaleString()}km`, x, MARGIN.top + plotH + 8)
    }

    // 地形面积
    context.beginPath()
    context.moveTo(px(points[0].distanceKm), py(0))
    for (const point of points) context.lineTo(px(point.distanceKm), py(point.elevation))
    context.lineTo(px(points[points.length - 1].distanceKm), py(0))
    context.closePath()
    const gradient = context.createLinearGradient(0, MARGIN.top, 0, py(0))
    gradient.addColorStop(0, colors.landDeep)
    gradient.addColorStop(1, colors.land)
    context.globalAlpha = 0.72
    context.fillStyle = gradient
    context.fill()
    context.globalAlpha = 1
    context.restore()

    // 水域填充覆盖在地形之上，保证海面以下呈蓝色。
    context.save()
    context.beginPath()
    context.rect(MARGIN.left, MARGIN.top, plotW, plotH)
    context.clip()
    for (const point of points) {
      if (point.elevation > 0) continue
      const x = px(point.distanceKm)
      const y = py(point.elevation)
      context.fillStyle = colors.water
      context.fillRect(x, Math.min(py(0), y), Math.max(1, plotW / points.length + 1), Math.abs(py(0) - y) + 1)
    }
    context.restore()

    // 海平面
    context.save()
    context.setLineDash([4, 4])
    context.strokeStyle = colors.waterDeep
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(MARGIN.left, py(0))
    context.lineTo(width - MARGIN.right, py(0))
    context.stroke()
    context.restore()

    // 地形剖面线
    context.beginPath()
    points.forEach((point, index) => {
      const x = px(point.distanceKm)
      const y = py(point.elevation)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.strokeStyle = colors.ink
    context.lineWidth = 1.6
    context.stroke()

    // 生物群系色带
    const stripY = height - BIOME_STRIP - 2
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const color = point.water === 1
        ? BIOME_COLORS[0]
        : point.water === 2
          ? BIOME_COLORS[1]
          : BIOME_COLORS[point.biome] ?? BIOME_COLORS[7]
      context.fillStyle = color
      const x = px(point.distanceKm)
      const next = i < points.length - 1 ? px(points[i + 1].distanceKm) : width - MARGIN.right
      context.fillRect(x, stripY, Math.max(1, next - x + 0.5), BIOME_STRIP)
    }
    context.fillStyle = colors.faint
    context.textAlign = 'left'
    context.textBaseline = 'bottom'
    context.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

    // 悬停指示
    if (hover !== null && points[hover]) {
      const point = points[hover]
      const x = px(point.distanceKm)
      context.strokeStyle = colors.accent
      context.lineWidth = 1
      context.setLineDash([3, 3])
      context.beginPath()
      context.moveTo(x, MARGIN.top)
      context.lineTo(x, MARGIN.top + plotH)
      context.stroke()
      context.setLineDash([])
      context.beginPath()
      context.arc(x, py(point.elevation), 3.5, 0, Math.PI * 2)
      context.fillStyle = colors.accent
      context.fill()
    }
  }, [dark, distanceKm, hover, points, size])

  const hovered = hover !== null ? points[hover] : null
  const hoverX = hovered ? (hovered.distanceKm / Math.max(1, distanceKm)) * 100 : 0

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const plotW = rect.width - MARGIN.left - MARGIN.right
          const ratio = (event.clientX - rect.left - MARGIN.left) / plotW
          if (ratio < 0 || ratio > 1) {
            setHover(null)
            return
          }
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      />
      {hovered ? (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[150px] -translate-x-1/2 rounded border border-line bg-paper/95 px-2.5 py-2 text-[11px] shadow-sm backdrop-blur"
          style={{ left: `${Math.max(10, Math.min(90, hoverX))}%` }}
        >
          <div className="mb-1 flex items-center justify-between gap-3 text-ink-faint">
            <span>{Math.round(hovered.distanceKm).toLocaleString()} km</span>
            <span>{hovered.temperature}°C</span>
          </div>
          <div className="font-mono text-sm text-ink">
            {Math.round(hovered.elevation).toLocaleString()} m
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-ink-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: hovered.water === 1
                  ? BIOME_COLORS[0]
                  : hovered.water === 2
                    ? BIOME_COLORS[1]
                    : BIOME_COLORS[hovered.biome] ?? BIOME_COLORS[7],
              }}
            />
            {hovered.water === 1
              ? '海洋'
              : hovered.water === 2
                ? '湖泊'
                : BIOME_NAMES[hovered.biome] ?? '陆地'}
          </div>
          <div className="mt-1 text-ink-faint">湿度 {hovered.moisture}%</div>
        </div>
      ) : null}
    </div>
  )
}
