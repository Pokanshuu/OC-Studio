/**
 * 关系图导出**版式**（唯一源）。
 *
 * 导出中心关系图页签的三套预设 + 六个可调项都在这里；渲染侧
 * （`export-graph.ts#renderRelationGraphCanvas`）只认这个对象，
 * 所以「预览里看到的那张图」与「存下来的 PNG」不会是两套观感。
 *
 * 注意它与 `lib/edge-style.ts` 的分工：那条是**线型**（正交 / 曲线），
 * 存在应用设置里、画布与导出共用；这里是**导出时的排版**，不改数据、不进设置。
 */

export type GraphPaper = 'dot' | 'plain' | 'grid'

export type GraphNodeShape = 'avatar' | 'name'

export interface GraphExportStyle {
  /** 纸面：点阵 / 纯色 / 网格 */
  paper: GraphPaper
  /** 节点：头像卡片 / 只有名字 */
  nodeShape: GraphNodeShape
  /** 画关系名 */
  edgeLabels: boolean
  /** 线宽（1.2 / 1.6 / 2.2） */
  edgeWidth: number
  /** 单色墨线：所有边一个色，适合黑白打印 */
  monochrome: boolean
  showTitle: boolean
  showDate: boolean
  /** 画布四周留白 */
  padding: number
  /** 导出倍率 */
  scale: number
}

export const DEFAULT_GRAPH_STYLE: GraphExportStyle = {
  paper: 'dot',
  nodeShape: 'avatar',
  edgeLabels: true,
  edgeWidth: 1.6,
  monochrome: false,
  showTitle: true,
  showDate: true,
  padding: 96,
  scale: 2,
}

export const GRAPH_PAPER_OPTIONS: ReadonlyArray<{ value: GraphPaper; label: string }> = [
  { value: 'dot', label: '点阵' },
  { value: 'plain', label: '纯色' },
  { value: 'grid', label: '网格' },
]

export const GRAPH_NODE_OPTIONS: ReadonlyArray<{ value: GraphNodeShape; label: string }> = [
  { value: 'avatar', label: '头像' },
  { value: 'name', label: '名字' },
]

export const GRAPH_WIDTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1.2, label: '细' },
  { value: 1.6, label: '标准' },
  { value: 2.2, label: '粗' },
]

export const GRAPH_PADDING_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 48, label: '紧凑' },
  { value: 96, label: '标准' },
  { value: 160, label: '宽松' },
]

export const GRAPH_SCALE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 3, label: '3×' },
]

export type GraphStylePresetId = 'poster' | 'ink' | 'atlas'

export interface GraphStylePreset {
  id: GraphStylePresetId
  label: string
  hint: string
  style: GraphExportStyle
}

/**
 * 三套版式：
 * - 留白：现在的默认观感（点阵纸、头像、关系名、2 倍）
 * - 墨线：纯纸 + 名字节点 + 单色线，像一张关系草图，黑白打印也清楚
 * - 图谱：网格纸、无关系名、粗线、大留白，人多了也不乱
 */
export const GRAPH_STYLE_PRESETS: readonly GraphStylePreset[] = [
  { id: 'poster', label: '留白', hint: '点阵 · 头像', style: DEFAULT_GRAPH_STYLE },
  {
    id: 'ink',
    label: '墨线',
    hint: '纯纸 · 名字 · 单色',
    style: {
      paper: 'plain',
      nodeShape: 'name',
      edgeLabels: true,
      edgeWidth: 1.2,
      monochrome: true,
      showTitle: true,
      showDate: false,
      padding: 48,
      scale: 2,
    },
  },
  {
    id: 'atlas',
    label: '图谱',
    hint: '网格 · 粗线 · 大留白',
    style: {
      paper: 'grid',
      nodeShape: 'avatar',
      edgeLabels: false,
      edgeWidth: 2.2,
      monochrome: false,
      showTitle: true,
      showDate: true,
      padding: 160,
      scale: 2,
    },
  },
]

export const GRAPH_STYLE_OPTIONS = GRAPH_STYLE_PRESETS.map(({ id, label }) => ({ value: id, label }))

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 收敛：认不出的枚举回到默认，数值夹进合法区间（NaN 也回默认，别让它漏进画布） */
export function normalizeGraphStyle(input?: Partial<GraphExportStyle> | null): GraphExportStyle {
  const source = input ?? {}
  const paper: GraphPaper =
    source.paper === 'plain' || source.paper === 'grid' || source.paper === 'dot' ? source.paper : DEFAULT_GRAPH_STYLE.paper
  const nodeShape: GraphNodeShape = source.nodeShape === 'name' ? 'name' : 'avatar'
  return {
    paper,
    nodeShape,
    edgeLabels: source.edgeLabels ?? DEFAULT_GRAPH_STYLE.edgeLabels,
    edgeWidth: clamp(source.edgeWidth ?? DEFAULT_GRAPH_STYLE.edgeWidth, 0.8, 3, DEFAULT_GRAPH_STYLE.edgeWidth),
    monochrome: source.monochrome ?? DEFAULT_GRAPH_STYLE.monochrome,
    showTitle: source.showTitle ?? DEFAULT_GRAPH_STYLE.showTitle,
    showDate: source.showDate ?? DEFAULT_GRAPH_STYLE.showDate,
    padding: clamp(source.padding ?? DEFAULT_GRAPH_STYLE.padding, 24, 240, DEFAULT_GRAPH_STYLE.padding),
    scale: clamp(source.scale ?? DEFAULT_GRAPH_STYLE.scale, 1, 3, DEFAULT_GRAPH_STYLE.scale),
  }
}

/** 当前样式正好等于哪套预设（界面高亮用；都不等返回 null） */
export function graphPresetIdOf(style: GraphExportStyle): GraphStylePresetId | null {
  for (const preset of GRAPH_STYLE_PRESETS) {
    const keys = Object.keys(preset.style) as Array<keyof GraphExportStyle>
    if (keys.every((key) => preset.style[key] === style[key])) return preset.id
  }
  return null
}
