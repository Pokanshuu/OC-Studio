/**
 * 时间线 PNG 导出 —— **离线重绘**，和关系图导出同一套做法（不截屏、不引第三方）。
 *
 * 布局数字与页面同源：`constants.ts` 的泳道高度 / 左右边距、`utils.ts` 的 `parseYear` /
 * `assignLanes` / `buildYearTicks` / `isLightColor`，时期色板取 `types.ts` 的 `PERIOD_COLORS`。
 * 差别只有一个：页面上会按缩放把事件聚成「桶」，导出**永远逐年排布** —— 导出是给人看的
 * 一张图，不是可滚动的控件，聚成桶反而看不出时间点。
 */
import type { Period } from '@/types'
import { PERIOD_COLORS } from '@/types'
import {
  LEFT_PADDING,
  RIGHT_PADDING,
  LANE_HEIGHT,
  MAX_LANES,
  MIN_PX_PER_YEAR,
  YEAR_TICK_HEIGHT,
} from './constants'
import { assignLanes, buildYearTicks, computeDensity, isLightColor, parseYear } from './utils'
import type { TimelineEvent } from './types'
import { token, withAlpha, roundedRectPath, truncateText } from '@/lib/canvas-tokens'

/** 导出浓度：每年占多少像素（越密事件越挤，靠泳道往上叠） */
export type TimelineExportDensity = 'compact' | 'normal' | 'loose'

export const TIMELINE_DENSITY_PX: Record<TimelineExportDensity, number> = {
  compact: 48,
  normal: 80,
  loose: 128,
}

export const TIMELINE_DENSITY_OPTIONS: ReadonlyArray<{ value: TimelineExportDensity; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'normal', label: '标准' },
  { value: 'loose', label: '稀疏' },
] as const

/** 画布上限（再大既慢又费内存） */
const MAX_WIDTH = 4096
const MAX_HEIGHT = 2160
/** 顶部标题区、底部署名区 */
const HEADER_HEIGHT = 92
const FOOTER_HEIGHT = 48
const AXIS_TOP = 16
const PERIOD_ROW_HEIGHT = 28

export interface TimelineExportInput {
  events: TimelineEvent[]
  periods: Period[]
  title: string
  density: TimelineExportDensity
}

interface Tokens {
  paper: string
  paperCard: string
  line: string
  ink: string
  inkMuted: string
  inkFaint: string
  sans: string
  serif: string
}

function readTokens(): Tokens {
  return {
    paper: token('--oc-paper'),
    paperCard: token('--oc-paper-card'),
    line: token('--oc-line'),
    ink: token('--oc-ink'),
    inkMuted: token('--oc-ink-muted'),
    inkFaint: token('--oc-ink-faint'),
    sans: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
    serif: 'Georgia, "Songti SC", "Noto Serif CJK SC", serif',
  }
}

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

function periodHex(period: Period): string {
  const palette = PERIOD_COLORS.find((entry) => entry.value === period.color)
  if (!palette) return PERIOD_COLORS[0].hex
  return isDarkTheme() ? palette.hexDark : palette.hex
}

function dateStamp(): string {
  const date = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 有序的事件（按年，读不出年份的丢掉 —— 画布上没处放） */
function timedEvents(events: TimelineEvent[]): { event: TimelineEvent; year: number; endYear: number }[] {
  const rows: { event: TimelineEvent; year: number; endYear: number }[] = []
  for (const event of events) {
    const year = parseYear(event.time)
    if (year === null) continue
    const endYear = parseYear(event.endTime ?? '') ?? year
    rows.push({ event, year, endYear: Math.max(endYear, year) })
  }
  return rows.sort((a, b) => a.year - b.year || a.event.title.localeCompare(b.event.title))
}

/**
 * 读不出年份、**不会上轴**的事件标题。
 *
 * 画布上没处放它们，但直接丢掉等于「导出的图比页面少了几条」—— 页面底部另有一栏
 * 「未标注时间的事件」。导出时把它们排在页脚，至少不静默消失。
 */
export function untimedEventTitles(events: TimelineEvent[]): string[] {
  return events
    .filter((event) => parseYear(event.time) === null)
    .map((event) => event.title.trim() || '未命名事件')
}

/** 按当前坐标把整条时间线重绘到离屏画布（不做视口变换：导出的是整条轴，不是屏幕截图） */
export async function renderTimelineCanvas({
  events,
  periods,
  title,
  density,
}: TimelineExportInput): Promise<HTMLCanvasElement> {
  const rows = timedEvents(events)
  if (rows.length === 0) throw new Error('时间线上没有带年份的事件，无法导出')

  const activePeriods = periods.filter((period) => parseYear(period.startTime) !== null)
  const tokens = readTokens()

  const minYear = Math.min(...rows.map((row) => row.year), ...activePeriods.map((p) => parseYear(p.startTime) ?? 0))
  const maxYear = Math.max(
    ...rows.map((row) => row.endYear),
    ...activePeriods.map((p) => parseYear(p.endTime) ?? parseYear(p.startTime) ?? 0),
  )
  const rangeStart = minYear - 1
  const totalYears = Math.max(1, maxYear - minYear + 2)

  let pxPerYear = TIMELINE_DENSITY_PX[density]
  const naturalWidth = LEFT_PADDING + RIGHT_PADDING + totalYears * pxPerYear
  if (naturalWidth > MAX_WIDTH) {
    // 太长的轴：压像素密度而不是截断，保证「所有事件都在图上」
    pxPerYear = Math.max(MIN_PX_PER_YEAR / 2, (MAX_WIDTH - LEFT_PADDING - RIGHT_PADDING) / totalYears)
  }

  // 泳道：复用页面同一套分配（同一像素坐标下，导出与页面不会给出不同结论）
  const placed = assignLanes(
    rows.map((row) => ({
      event: row.event,
      x: LEFT_PADDING + (row.year - rangeStart) * pxPerYear,
      width: Math.max((row.endYear - row.year) * pxPerYear, 8),
      lane: 0,
    })),
  )
  const maxLane = placed.reduce((max, item) => Math.max(max, item.lane), 0)

  // 时期分两行交替（与页面相同的贪心避让，但导出只留两行）
  const periodRows: { period: Period; row: number; startX: number; endX: number }[] = []
  const laneEnds: number[] = []
  for (const period of [...activePeriods].sort((a, b) => (parseYear(a.startTime) ?? 0) - (parseYear(b.startTime) ?? 0))) {
    const startYear = parseYear(period.startTime) ?? 0
    const endYear = parseYear(period.endTime) ?? startYear
    let row = 0
    for (; row < 2; row += 1) {
      if (laneEnds[row] === undefined || laneEnds[row] <= startYear) {
        laneEnds[row] = endYear
        periodRows.push({
          period,
          row,
          startX: LEFT_PADDING + (startYear - rangeStart) * pxPerYear,
          endX: LEFT_PADDING + (endYear - rangeStart) * pxPerYear,
        })
        break
      }
    }
  }
  const periodRowCount = periodRows.reduce((max, item) => Math.max(max, item.row + 1), 0)

  const periodsHeight = periodRowCount * PERIOD_ROW_HEIGHT + 8
  const axisY = HEADER_HEIGHT + periodsHeight + AXIS_TOP
  const lanesTop = axisY + YEAR_TICK_HEIGHT + LANE_HEIGHT * 0.6
  const lanesHeight = (Math.min(maxLane, MAX_LANES) + 1) * LANE_HEIGHT

  const untimed = untimedEventTitles(events)
  const width = Math.round(LEFT_PADDING + RIGHT_PADDING + totalYears * pxPerYear)
  const height = Math.round(
    Math.min(MAX_HEIGHT, lanesTop + lanesHeight + FOOTER_HEIGHT + (untimed.length > 0 ? 18 : 0)),
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('画布初始化失败')

  // 底色 + 极淡的点阵（和关系图同一套观感）
  ctx.fillStyle = tokens.paper
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = withAlpha(tokens.inkFaint, 0.16)
  for (let x = 24; x < width; x += 24) {
    for (let y = 24; y < height; y += 24) {
      ctx.fillRect(x, y, 1, 1)
    }
  }

  // 标题
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = tokens.ink
  ctx.font = `600 30px ${tokens.serif}`
  ctx.fillText(truncateText(ctx, title.trim() === '' ? '时间线' : title.trim(), width - LEFT_PADDING - RIGHT_PADDING), LEFT_PADDING, HEADER_HEIGHT - 44)
  ctx.fillStyle = tokens.inkFaint
  ctx.font = `400 13px ${tokens.sans}`
  ctx.fillText(
    `${minYear} – ${maxYear} · ${rows.length} 个事件${periodRows.length > 0 ? ` · ${periodRows.length} 个时期` : ''}`,
    LEFT_PADDING,
    HEADER_HEIGHT - 22,
  )

  // 时期条
  for (const item of periodRows) {
    const y = HEADER_HEIGHT - 4 + item.row * PERIOD_ROW_HEIGHT
    const w = Math.max(item.endX - item.startX, 24)
    const fill = periodHex(item.period)
    ctx.fillStyle = withAlpha(fill, 0.85)
    roundedRectPath(ctx, item.startX, y, w, PERIOD_ROW_HEIGHT - 10, 4)
    ctx.fill()
    ctx.fillStyle = isLightColor(fill) ? token('--oc-ink-fixed') : token('--oc-paper-fixed')
    ctx.font = `500 11px ${tokens.sans}`
    ctx.fillText(truncateText(ctx, item.period.name, w - 12), item.startX + 6, y + (PERIOD_ROW_HEIGHT - 10) / 2 + 4)
  }

  // 年份轴
  const pxForTicks = pxPerYear
  const tickDensity = computeDensity(pxForTicks)
  const ticks = buildYearTicks(tickDensity, rangeStart, totalYears, pxForTicks, LEFT_PADDING)
  ctx.strokeStyle = withAlpha(tokens.line, 0.9)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(LEFT_PADDING - 24, axisY)
  ctx.lineTo(width - RIGHT_PADDING + 24, axisY)
  ctx.stroke()

  ctx.font = `400 11px ${tokens.sans}`
  ctx.textAlign = 'center'
  for (const tick of ticks) {
    if (tick.x < LEFT_PADDING - 1 || tick.x > width - RIGHT_PADDING + 1) continue
    ctx.strokeStyle = withAlpha(tokens.line, 0.9)
    ctx.beginPath()
    ctx.moveTo(tick.x, axisY)
    ctx.lineTo(tick.x, axisY + YEAR_TICK_HEIGHT)
    ctx.stroke()
    ctx.fillStyle = tokens.inkFaint
    ctx.fillText(String(tick.year), tick.x, axisY - 6)
  }
  ctx.textAlign = 'left'

  // 事件：点 + 标题 + 年份；有结束年的画成一段条
  const labelWidth = Math.max(pxPerYear * 6, 96)
  for (const item of placed) {
    const lane = Math.min(item.lane, MAX_LANES)
    const y = lanesTop + lane * LANE_HEIGHT + LANE_HEIGHT / 2
    const spanWidth = item.width
    const row = rows.find((candidate) => candidate.event.id === item.event.id)
    const major = item.event.isMajor || item.event.kind === 'birth'
    const color = item.event.kind === 'birth' ? tokens.inkFaint : major ? tokens.ink : tokens.inkMuted

    if (spanWidth > 10) {
      ctx.fillStyle = withAlpha(color, 0.12)
      roundedRectPath(ctx, item.x, y - 7, spanWidth, 14, 7)
      ctx.fill()
    }

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(item.x, y, major ? 4.5 : 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = major ? tokens.ink : tokens.inkMuted
    ctx.font = `${major ? 600 : 400} 12px ${tokens.sans}`
    const labelX = item.x + 8
    ctx.fillText(truncateText(ctx, item.event.title, labelWidth), labelX, y - 3)
    ctx.fillStyle = tokens.inkFaint
    ctx.font = `400 10px ${tokens.sans}`
    const yearLabel =
      row && row.endYear > row.year ? `${row.year} – ${row.endYear}` : row ? String(row.year) : ''
    ctx.fillText(yearLabel, labelX, y + 10)
  }

  // 未标注时间的事件：排在署名上方，别让它们从图里消失
  if (untimed.length > 0) {
    ctx.fillStyle = tokens.inkFaint
    ctx.font = `400 11px ${tokens.sans}`
    const line = truncateText(ctx, `未标注时间：${untimed.join('、')}`, width - LEFT_PADDING - RIGHT_PADDING)
    ctx.fillText(line, LEFT_PADDING, height - 38)
  }

  // 署名
  ctx.fillStyle = tokens.inkFaint
  ctx.font = `400 11px ${tokens.sans}`
  ctx.fillText(`OC Studio · ${dateStamp()}`, LEFT_PADDING, height - 20)
  ctx.textAlign = 'right'
  ctx.fillText('时间线', width - RIGHT_PADDING, height - 20)
  ctx.textAlign = 'left'

  return canvas
}
