'use client'

/**
 * 地图生成器面板（插件 `official.map-generator` 的宿主侧）。
 *
 * 内置侧只做三件事：给参数、把插件画出来的像素接到画布上、把结果落成**底图**。
 * 生成算法一行都不在这里（`src/plugins/map-generator/kernel/`）。
 *
 * Worker **只建一次**：切视图 / 改参数都不重建它 —— 世界活在 Worker 内存里，
 * 重建就等于把刚生成的世界丢了（effect 依赖 `[]`，最新消息处理器放在 ref 里）。
 * 每个请求带递增 `requestId`，只认最新那一个的响应：重新生成时旧结果直接丢弃。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Dices, ImageDown, Lock, Minus, Plus, Save, Wand2 } from 'lucide-react'
import {
  DEFAULT_MAP_PARAMS,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
  MAP_VIEW_LABELS,
  REGION_MAP_SIZE,
  WORLD_MAP_HEIGHT,
  WORLD_MAP_WIDTH,
  createMapGeneratorWorker,
  normalizeMapParams,
  type GeneratedMeta,
  type MapView,
  type TerrainPreset,
  type WorkerRequest,
  type WorkerResponse,
  type WorldMapKind,
  type WorldMapParams,
} from '@/plugins/map-generator'
import {
  BTN_PRIMARY,
  BTN_QUIET,
  ICON_BTN,
  NUMBER_INPUT,
  FLOAT_BAR,
  FLOAT_BAR_ICON,
  PANEL,
  ROUND_ITEM,
} from '@/lib/ui-tokens'
import { MapLegend } from './components/MapLegend'
import { saveBlobAs } from './export'

const VIEWS: MapView[] = ['terrain', 'contour', 'temperature', 'moisture', 'biome', 'political']

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function signedPct(value: number): string {
  const amount = Math.round(value * 100)
  return `${amount > 0 ? '+' : ''}${amount}%`
}

/**
 * 滑块。上下限必须与 `plugins/map-generator/params.ts` 的 clamp 逐项一致，
 * 否则滑块两端是死区（拖到头数字不动，看起来像坏了）。
 * 右侧那个数字是**当前值**：没有它，用户只能靠滑块位置猜自己调到了哪。
 */
interface ParamField {
  key: keyof WorldMapParams
  label: string
  min: number
  max: number
  step: number
  format: (value: number) => string
  /** 光看名字猜不出后果的才给一句（文案预算：≤ 20 字、只占一行） */
  hint?: string
}

/** 面积类参数存的是「占全图的比例」，显示成百分比 */
function areaPct(value: number): string {
  return `${(value * 100).toFixed(3)}%`
}

/** 参数分两组：地形 / 气候是一组，湖泊自己一组（它有三个数，混在一起太挤） */
const PARAM_GROUPS: Array<{ label?: string; fields: ParamField[] }> = [
  {
    fields: [
      { key: 'landCoverage', label: '陆地覆盖', min: 0.08, max: 0.62, step: 0.01, format: pct },
      { key: 'mountainStrength', label: '山脉强度', min: 0, max: 1, step: 0.01, format: pct },
      { key: 'plateauStrength', label: '高原强度', min: 0, max: 1, step: 0.01, format: pct },
      {
        key: 'plainBias',
        label: '平原偏置',
        min: -1,
        max: 1,
        step: 0.05,
        format: signedPct,
        hint: '提高平原占比；负值增加丘陵与破碎地形。',
      },
      {
        key: 'temperatureOffset',
        label: '温度偏移',
        min: -10,
        max: 10,
        step: 1,
        format: (value) => `${value > 0 ? '+' : ''}${value}°C`,
      },
      { key: 'moistureBias', label: '降水偏置', min: -1, max: 1, step: 0.05, format: signedPct },
      { key: 'riverDensity', label: '河流密度', min: 0, max: 1, step: 0.01, format: pct },
      {
        key: 'latitudeSpan',
        label: '纬度跨度',
        min: 100,
        max: 170,
        step: 5,
        format: (value) => `${Math.round(value)}°`,
        hint: '控制极地到赤道的温差；越大，冰原与雨林越极端。',
      },
    ],
  },
  {
    label: '湖泊',
    fields: [
      { key: 'lakeDensity', label: '湖泊密度', min: 0, max: 1, step: 0.01, format: pct },
      { key: 'lakeMinArea', label: '最小面积', min: 0.00005, max: 0.01, step: 0.00005, format: areaPct },
      { key: 'lakeMaxArea', label: '最大面积', min: 0.0005, max: 0.05, step: 0.0005, format: areaPct },
    ],
  },
]

/** 分组小标题：比正文小一档、只靠字距与颜色分层 */
const SECTION_LABEL = 'text-[11px] tracking-[0.08em] text-ink-faint'

/**
 * 堆叠式滑块：标签与当前值一行，滑杆下一行，必要时再加一句小字。
 * 不用「字段行 + 横线」那套：参数一多就是一片线，层级反而没了。
 */
function ParamSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled = false,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex flex-col gap-1 ${disabled ? 'opacity-60' : ''}`}>
      <span className="flex items-baseline justify-between gap-2 leading-4">
        <span className="text-[12px] text-ink">{label}</span>
        <span className="text-[11px] tabular-nums text-ink-muted">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={RANGE_INPUT}
      />
      {hint ? <span className="text-[11px] leading-4 text-ink-faint">{hint}</span> : null}
    </label>
  )
}

/** 尺寸 = `kind` + 一对像素值；`kind` 同时决定地形的投影方式（世界 / 区域） */
const SIZES: Array<{ value: WorldMapKind; label: string; width: number; height: number }> = [
  { value: 'world', label: '世界', width: WORLD_MAP_WIDTH, height: WORLD_MAP_HEIGHT },
  { value: 'region', label: '区域', width: REGION_MAP_SIZE, height: REGION_MAP_SIZE },
]

/**
 * 大陆分布预设（`custom` 只读兼容，不给入口：它本来就等于当前参数）。
 * 四个选项的值差得远，光看名字猜不出会生成什么，所以每个带一句「长什么样」。
 */
const PRESETS: Array<{ value: TerrainPreset; label: string; hint: string }> = [
  { value: 'earth', label: '地球型大陆', hint: '南北大陆，约 70% 海洋' },
  { value: 'three-continents', label: '三大洲', hint: '三块大陆，少量岛屿' },
  { value: 'islands', label: '多岛屿世界', hint: '群岛为主，海洋约 85%' },
  { value: 'pangaea', label: '盘古大陆', hint: '一整块超级大陆' },
]

/**
 * 数字输入：**不用 `type="number"`** —— 系统那对步进箭头够不着令牌（暗色下是一块白底），
 * 和 `<datalist>` / `type="date"` 同一类问题。外观走 `NUMBER_INPUT`，行为在这里：
 * 只收数字、↑/↓ 步进、失焦夹进范围。
 *
 * 需要一份本地草稿：输入途中把「3」立刻夹成 512，人就永远敲不出「3072」。
 */
function NumericField({
  value,
  min,
  max,
  step,
  label,
  widthClass,
  onCommit,
}: {
  value: number
  min: number
  max: number
  step: number
  label: string
  widthClass: string
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  // 外部改了这个值（「随机种子」、生成后回填）时，草稿跟上
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部改了值，草稿必须同步，没有可派生的来源
    setDraft(String(value))
  }, [value])

  const clamp = (next: number): number => Math.min(max, Math.max(min, next))

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      aria-label={label}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^\d]/g, '')
        setDraft(digits)
        if (digits !== '') onCommit(Number(digits))
      }}
      onBlur={() => {
        const next = clamp(Number(draft) || value)
        setDraft(String(next))
        onCommit(next)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        const next = clamp((Number(draft) || 0) + (event.key === 'ArrowUp' ? step : -step))
        setDraft(String(next))
        onCommit(next)
      }}
      className={`${NUMBER_INPUT} ${widthClass}`}
    />
  )
}

/** 设计系统滑杆（同 TimelineToolbar）：轨道 4px、拇指 14px、无描边盒 */
const RANGE_INPUT =
  'h-4 w-full cursor-pointer appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 ' +
  '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted ' +
  '[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line ' +
  '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0'

/**
 * 生成结果写到哪 —— 决定面板上那句提示与底部那颗按钮的措辞：
 * - `existing`：从地图里打开的生成器，写完就替换那张图的底图
 * - `new`：工具页（直接进入生成器），每次提交都**新建一张地图**
 */
export type MapGeneratorTarget =
  | { kind: 'existing'; name: string }
  | { kind: 'new' }

export function MapGeneratorPanel({
  onUseAsBackground,
  initialSeed,
  initialParams,
  target,
}: {
  /** 拿到 PNG 后交给宿主：落盘 + 设为当前地图底图（带上是哪一档视图） */
  onUseAsBackground: (
    blob: Blob,
    size: { width: number; height: number },
    seed: number,
    params: WorldMapParams,
    view: MapView,
    /** 顺带把六档底图的渲染进度报上来（阶段 + 0–1） */
    onProgress?: (stage: string, value: number) => void,
  ) => Promise<void>
  /** 「在这张图上重新生成」：把原来的种子带进来，调参后仍是同一片大陆 */
  initialSeed?: number
  /** 原来的参数（JSON 字符串，来自 `map_params`）；解析不了就当没有 */
  initialParams?: string
  /** 生成结果写到哪：既有地图（提示写入哪张）/ 新建一张（工具页） */
  target?: MapGeneratorTarget
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  /** 最新一次生成回传的元信息 —— 画布尺寸、落库参数都以它为准 */
  const metaRef = useRef<GeneratedMeta | null>(null)
  /** 最新请求号：响应只认它，旧请求的结果一律丢弃 */
  const requestIdRef = useRef(0)
  /** Worker 的 message 回调要保持稳定（effect 只建一次），最新闭包放这里 */
  const handleResponseRef = useRef<(message: WorkerResponse) => void>(() => {})

  const [params, setParams] = useState<WorldMapParams>(() => {
    if (initialParams) {
      try {
        return normalizeMapParams(JSON.parse(initialParams) as WorldMapParams)
      } catch {
        // 坏参数当没有：生成器永远从一份合法参数起步
      }
    }
    return normalizeMapParams(DEFAULT_MAP_PARAMS)
  })
  const [seed, setSeed] = useState(() => initialSeed ?? Math.floor(Math.random() * 1_000_000))
  const [view, setView] = useState<MapView>('terrain')
  /** 等高线间隔（米）：只在等高线视图里看得见，改它要重画这一档 */
  const [contourInterval, setContourInterval] = useState(100)
  const [progress, setProgress] = useState<{ stage: string; value: number } | null>(null)
  const [meta, setMeta] = useState<GeneratedMeta | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 预览缩放：1 = 适应面板宽度。大图（3072×1536）不放大看不清海岸线 */
  const [zoom, setZoom] = useState(1)
  const previewRef = useRef<HTMLDivElement | null>(null)
  /** 拖动画面时的起点与当时的滚动量（放大到超过面板才有得拖） */
  const panRef = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  /** 画面是否真的超出面板：只有超了才接管拖拽，否则鼠标手势会吃掉双击等原生行为 */
  const [pannable, setPannable] = useState(false)

  useEffect(() => {
    const node = previewRef.current
    if (!node) return
    const measure = (): void => {
      setPannable(node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [zoom, ready, meta])

  /**
   * 按住画面拖动 = 平移。
   *
   * 放大到 200% 以后只看得到地图的一角，靠滚动条挪太细了；触屏不接管
   * （原生滚动更跟手），鼠标 / 笔才走拖拽。
   */
  const startPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    const node = previewRef.current
    if (!node || !pannable || event.pointerType === 'touch' || event.button !== 0) return
    panRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
    }
    node.setPointerCapture(event.pointerId)
  }

  const movePan = (event: React.PointerEvent<HTMLDivElement>): void => {
    const node = previewRef.current
    const pan = panRef.current
    if (!node || !pan || pan.id !== event.pointerId) return
    node.scrollLeft = pan.left - (event.clientX - pan.x)
    node.scrollTop = pan.top - (event.clientY - pan.y)
  }

  const endPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    const node = previewRef.current
    if (panRef.current?.id === event.pointerId) panRef.current = null
    if (node?.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
  }

  const busy = progress !== null

  const send = useCallback((build: (requestId: number) => WorkerRequest) => {
    const worker = workerRef.current
    if (!worker) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    worker.postMessage(build(requestId))
  }, [])

  /**
   * 像素画到画布上。宽高只信 Worker 回传的 meta（它按 `MAP_MIN/MAX_SIZE` 夹过），
   * 本地 params 可能和实际不一致；长度对不上就直接报错，不把坏数据塞进 ImageData。
   */
  const drawBuffer = useCallback((buffer: ArrayBuffer, width: number, height: number): boolean => {
    const canvas = canvasRef.current
    if (!canvas) return false
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false
    const expected = width * height * 4
    if (buffer.byteLength !== expected) return false
    const pixels = new Uint8ClampedArray(buffer)
    if (pixels.length !== expected) return false
    const context = canvas.getContext('2d')
    if (!context) return false
    canvas.width = width
    canvas.height = height
    context.putImageData(new ImageData(pixels, width, height), 0, 0)
    return true
  }, [])

  const handleResponse = (message: WorkerResponse) => {
    // 重新生成 / 切换视图之后，旧请求的进度、像素、错误都不该再影响界面
    if (message.requestId !== requestIdRef.current) return

    if (message.type === 'progress') {
      setProgress({ stage: message.stage, value: Math.min(1, Math.max(0, message.value)) })
      return
    }

    if (message.type === 'error') {
      setProgress(null)
      setReady(false)
      setError(message.message.length > 0 ? message.message : '地图生成失败')
      return
    }

    if (message.type === 'generated') {
      metaRef.current = message.meta
      setMeta(message.meta)
      // 把 Worker 实际生效的参数写回 state：滑块位置 = 像素所用参数
      setParams(message.meta.params)
      setProgress(null)
      if (!drawBuffer(message.initialImage, message.meta.width, message.meta.height)) {
        setReady(false)
        setError('地图像素与宽高不一致，请重新生成')
        return
      }
      setReady(true)
      setError(null)
      // 初始图是地形；按当前视图再要一张（地形直接命中 Worker 缓存）
      send((requestId) => ({ type: 'render', requestId, view, contourInterval }))
      return
    }

    // rendered：尺寸不在消息里，用最近一次生成的 meta
    const current = metaRef.current
    if (!current) return
    if (!drawBuffer(message.buffer, current.width, current.height)) {
      setReady(false)
      setError('地图像素与宽高不一致，请重新生成')
      return
    }
    setError(null)
  }

  // 每次渲染后同步最新闭包；Worker effect 保持 []，不因 view / state 变化重建
  useEffect(() => {
    handleResponseRef.current = handleResponse
  })

  useEffect(() => {
    const worker = createMapGeneratorWorker()
    workerRef.current = worker

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      handleResponseRef.current(event.data)
    }
    const onError = (event: ErrorEvent) => {
      event.preventDefault()
      // Worker 已经不可信：作废在途请求，别让迟到的消息再改界面
      requestIdRef.current += 1
      setProgress(null)
      setReady(false)
      setError('地图生成器出错，请重新生成')
      console.error('[map] worker error:', event.message)
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const generate = () => {
    const effective = normalizeMapParams(params)
    setParams(effective)
    setError(null)
    setReady(false)
    setProgress({ stage: '准备', value: 0 })
    send((requestId) => ({ type: 'generate', requestId, seed, params: effective }))
  }

  const switchView = (next: MapView) => {
    if (next === view) return
    setView(next)
    if (ready) send((requestId) => ({ type: 'render', requestId, view: next, contourInterval }))
  }

  const canvasBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) {
        resolve(null)
        return
      }
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })

  const handleUse = async () => {
    const current = metaRef.current
    if (!current) return
    const blob = await canvasBlob()
    if (!blob) {
      setError('画布还没有内容')
      return
    }
    try {
      await onUseAsBackground(
        blob,
        { width: current.width, height: current.height },
        current.seed,
        current.params,
        view,
        // 六档底图一次性画完存盘：进度接着用生成器那条胶囊
        (stage, value) => setProgress({ stage, value }),
      )
      setProgress(null)
      setError(null)
    } catch (err) {
      setProgress(null)
      setError(err instanceof Error ? err.message : '保存底图失败')
    }
  }

  const handleExport = async () => {
    const blob = await canvasBlob()
    if (!blob) {
      setError('画布还没有内容')
      return
    }
    try {
      // 系统保存对话框直接写用户选的位置，不经过库内素材目录（不产生孤儿文件）
      const saved = await saveBlobAs(blob, `地图-${metaRef.current?.seed ?? seed}.png`)
      if (saved) setError(null)
    } catch (err) {
      setError(err instanceof Error ? `导出失败：${err.message}` : '导出失败')
    }
  }

  const canvasWidth = meta?.width ?? params.width
  const canvasHeight = meta?.height ?? params.height
  // 工具页（直接进入）每次提交都是新建一张；地图里打开的才是替换当前底图
  const createsMap = target?.kind === 'new'
  const CommitIcon = createsMap ? Plus : Save
  const commitLabel = createsMap ? '保存为新地图' : '用作底图'

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      {/* 左：形态 + 参数（自己滚），生成钉在底部 —— 屏矮时也不用先往下翻才找得到出口 */}
            {/* 左：形态 / 大陆 / 参数 / 湖泊，生成钉在底部。
          版式对齐 oc_editor 的生成器：**分组 + 堆叠滑块**（标签与数值一行，滑杆下一行，
          需要解释的给一句小字），不再是一排排带横线的字段行 —— 参数多起来那会变成
          「全是线线线」，分组和留白才是层级。 */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col md:w-[300px]">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section className="flex flex-col">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="flex min-w-0 items-baseline gap-2"><span className={SECTION_LABEL}>形态</span>{target?.kind === 'existing' ? <span className="truncate text-[11px] text-ink-faint">写入「{target.name}」</span> : null}</p>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-control border border-line bg-paper p-1">
              {SIZES.map((size) => {
                const selected = params.kind === size.value && params.width === size.width
                return (
                  <button
                    key={size.value}
                    type="button"
                    onClick={() =>
                      setParams((prev) => ({
                        ...prev,
                        kind: size.value,
                        width: size.width,
                        height: size.height,
                      }))
                    }
                    aria-pressed={selected}
                    className={`h-7 text-[12px] transition-colors ${ROUND_ITEM} ${
                      selected ? 'bg-paper-card text-ink' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {size.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">宽度</span>
                <NumericField
                  value={params.width}
                  min={MAP_MIN_SIZE}
                  max={MAP_MAX_SIZE}
                  step={64}
                  label="宽度"
                  widthClass="w-full"
                  onCommit={(next) => setParams((prev) => ({ ...prev, width: next }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">高度</span>
                <NumericField
                  value={params.height}
                  min={MAP_MIN_SIZE}
                  max={MAP_MAX_SIZE}
                  step={64}
                  label="高度"
                  widthClass="w-full"
                  onCommit={(next) => setParams((prev) => ({ ...prev, height: next }))}
                />
              </label>
            </div>
          </section>

          <section className="flex flex-col">
            <p className={`mb-2 ${SECTION_LABEL}`}>大陆形态</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((preset) => {
                const selected = (params.terrainPreset ?? 'earth') === preset.value
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() =>
                      setParams((prev) => ({ ...prev, terrainPreset: preset.value }))
                    }
                    aria-pressed={selected}
                    className={`flex flex-col gap-0.5 border px-2 py-1.5 text-left transition-colors ${ROUND_ITEM} ${
                      selected
                        ? 'border-ink bg-paper-card'
                        : 'border-line hover:border-line-hover'
                    }`}
                  >
                    <span className="text-[12px] text-ink">{preset.label}</span>
                    <span className="text-[11px] leading-4 text-ink-faint">{preset.hint}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className={SECTION_LABEL}>参数</p>
              <div className="flex items-center gap-1">
                <span className="text-[10px] tracking-[0.06em] text-ink-faint">SEED</span>
                <NumericField
                  value={seed}
                  min={0}
                  max={999_999_999}
                  step={1}
                  label="种子"
                  widthClass="w-20"
                  onCommit={setSeed}
                />
                <button
                  type="button"
                  onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
                  className={ICON_BTN}
                  title="随机种子"
                  aria-label="随机种子"
                >
                  <Dices size={13} strokeWidth={2} />
                </button>
              </div>
            </div>

            {PARAM_GROUPS[0].fields.map((field) => (
              <ParamSlider
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={Number(params[field.key] ?? 0)}
                min={field.min}
                max={field.max}
                step={field.step}
                display={field.format(Number(params[field.key] ?? 0))}
                onChange={(next) => setParams((prev) => ({ ...prev, [field.key]: next }))}
              />
            ))}

            <ParamSlider
              label="等高线间隔"
              value={contourInterval}
              min={50}
              max={500}
              step={50}
              display={`${contourInterval}m`}
              onChange={setContourInterval}
              disabled={!ready}
            />
          </section>

          <section className="flex flex-col gap-2.5 border-t border-line pt-4">
            <p className={SECTION_LABEL}>湖泊配置</p>
            {PARAM_GROUPS[1].fields.map((field) => (
              <ParamSlider
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={Number(params[field.key] ?? 0)}
                min={field.min}
                max={field.max}
                step={field.step}
                display={field.format(Number(params[field.key] ?? 0))}
                onChange={(next) => setParams((prev) => ({ ...prev, [field.key]: next }))}
              />
            ))}
          </section>

          {/* 一句必要的口径：同样的种子 + 参数一定出同一张图（不占一块卡片） */}
          <p className="flex items-center gap-1.5 text-[11px] leading-4 text-ink-faint">
            <Lock size={11} strokeWidth={2} />
            同样的种子与参数，生成同一张地图
          </p>
        </div>

        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className={`${BTN_PRIMARY} mt-3 w-full justify-center`}
        >
          生成
        </button>
      </aside>


      {/* 右：视图 → 预览 → 统计与出口 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label="视图">
          {VIEWS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => switchView(item)}
              aria-pressed={view === item}
              disabled={!ready}
              className={`h-6 px-2 text-[12px] transition-colors disabled:opacity-40 ${ROUND_ITEM} ${
                view === item
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
              }`}
            >
              {MAP_VIEW_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="relative mt-3 flex min-h-[240px] flex-1 flex-col overflow-hidden">
          {/* canvas **必须一直在 DOM 里**：Worker 回传像素时是往这个元素上画的，
              以前生成前不渲染它，drawBuffer 拿到 null 就报「像素与宽高不一致」。
              没生成前用 visibility 藏起来，占位与比例照旧。 */}
          <div
            ref={previewRef}
            className={`min-h-0 flex-1 select-none overflow-auto ${pannable ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            <canvas
              ref={canvasRef}
              className={`w-full bg-paper-card ${ROUND_ITEM} ${ready ? '' : 'invisible'}`}
              style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}`, width: `${zoom * 100}%` }}
            />
          </div>

          {ready ? null : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div
                className={`pointer-events-auto flex w-[264px] flex-col items-center gap-3 p-5 text-center ${PANEL}`}
              >
                <Wand2 size={20} strokeWidth={2} className="text-ink-faint" />
                <p className="text-sm text-ink-muted">还没有生成底图</p>
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className={`${BTN_PRIMARY} w-full justify-center`}
                >
                  生成地图
                </button>
              </div>
            </div>
          )}

          {ready ? (
            <div className={`pointer-events-none absolute right-3 top-3 w-[168px] p-2 ${PANEL}`}>
              <MapLegend view={view} />
            </div>
          ) : null}

          {ready ? (
            <div className={`pointer-events-auto absolute bottom-3 right-3 ${FLOAT_BAR}`}>
              <button
                type="button"
                className={FLOAT_BAR_ICON}
                onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 4) / 4))}
                disabled={zoom <= 0.5}
                title="缩小"
                aria-label="缩小"
              >
                <Minus size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="min-w-[46px] px-1 text-[11px] tabular-nums text-ink-muted transition-colors hover:text-ink"
                title="适应宽度"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                className={FLOAT_BAR_ICON}
                onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.25) * 4) / 4))}
                disabled={zoom >= 4}
                title="放大"
                aria-label="放大"
              >
                <Plus size={13} strokeWidth={2} />
              </button>
            </div>
          ) : null}

          {progress ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <div className={`flex w-[280px] items-center gap-2 px-3 py-2 ${PANEL}`}>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress.value * 100)}
                  className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-line"
                >
                  <div
                    className="h-full rounded-full bg-ink-muted transition-[width] duration-150"
                    style={{ width: `${Math.round(progress.value * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-ink-faint">{progress.stage}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] tabular-nums text-ink-faint">
            {meta ? (
              <>
                <span>
                  陆地 <span className="text-ink">{(meta.stats.landRatio * 100).toFixed(1)}%</span>
                </span>
                <span>
                  最高峰{' '}
                  <span className="text-ink">
                    {Math.round(meta.stats.maxElevation).toLocaleString('zh-CN')} m
                  </span>
                </span>
                <span>
                  河流格 <span className="text-ink">{meta.stats.riverCells.toLocaleString('zh-CN')}</span>
                </span>
                <span>
                  湖泊 <span className="text-ink">{meta.stats.lakeCount}</span>
                </span>
                <span>
                  生物群系 <span className="text-ink">{meta.stats.biomeCount}</span>
                </span>
                <span>
                  平均降水 <span className="text-ink">{Math.round(meta.stats.meanPrecipitation)} mm</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleUse()}
              disabled={!ready || busy}
              className={BTN_PRIMARY}
            >
              <CommitIcon size={14} strokeWidth={2} />
              {commitLabel}
            </button>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!ready || busy}
              className={`${BTN_QUIET} disabled:opacity-40`}
            >
              <ImageDown size={14} strokeWidth={2} />
              PNG
            </button>
          </div>
        </div>

        {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
      </div>
    </div>
  )
}
