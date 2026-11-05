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
import { Dices, ImageDown, Minus, Plus, Save } from 'lucide-react'
import {
  BIOME_COLORS,
  BIOME_NAMES,
  DEFAULT_MAP_PARAMS,
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
  FIELD_LABEL,
  ICON_BTN,
  FIELD_ROW,
  LIST_END,
  MENU_ITEM_BASE,
  ROUND_ITEM,
  SECTION_TITLE_BARE,
} from '@/lib/ui-tokens'
import { saveBlobAs } from './export'

const VIEWS: MapView[] = ['terrain', 'contour', 'temperature', 'moisture', 'biome', 'political']

/** 范围必须与 `plugins/map-generator/params.ts` 的 clamp 一致，否则滑块两端是死区 */
const PARAM_FIELDS: Array<{ key: keyof WorldMapParams; label: string; min: number; max: number; step: number }> = [
  { key: 'landCoverage', label: '陆地比例', min: 0.08, max: 0.62, step: 0.02 },
  { key: 'mountainStrength', label: '山脉强度', min: 0, max: 1, step: 0.05 },
  { key: 'lakeDensity', label: '湖泊密度', min: 0, max: 1, step: 0.05 },
  { key: 'riverDensity', label: '河流密度', min: 0, max: 1, step: 0.05 },
  { key: 'temperatureOffset', label: '温度偏移', min: -10, max: 10, step: 1 },
  { key: 'moistureBias', label: '降水偏置', min: -1, max: 1, step: 0.3 },
]

/** 尺寸 = `kind` + 一对像素值；`kind` 同时决定地形的投影方式（世界 / 区域） */
const SIZES: Array<{ value: WorldMapKind; label: string; width: number; height: number }> = [
  { value: 'world', label: '世界', width: WORLD_MAP_WIDTH, height: WORLD_MAP_HEIGHT },
  { value: 'region', label: '区域', width: REGION_MAP_SIZE, height: REGION_MAP_SIZE },
]

/** 大陆分布预设（`custom` 只读兼容，不给入口：它本来就等于当前参数） */
const PRESETS: Array<{ value: TerrainPreset; label: string }> = [
  { value: 'earth', label: '地球型' },
  { value: 'three-continents', label: '三大陆' },
  { value: 'islands', label: '群岛' },
  { value: 'pangaea', label: '盘古' },
]

/** 参数里的小键（尺寸 / 大陆形态）：选中用浅底块，和视图那排同一套语义 */
const CHIP = 'h-6 rounded-item px-2 text-[12px] transition-colors'

/** 设计系统滑杆（同 TimelineToolbar）：轨道 4px、拇指 14px、无描边盒 */
const RANGE_INPUT =
  'h-6 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 ' +
  '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink-muted ' +
  '[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line ' +
  '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:bg-ink-muted [&::-moz-range-thumb]:border-0'

export function MapGeneratorPanel({
  onUseAsBackground,
  initialSeed,
  initialParams,
}: {
  /** 拿到 PNG 后交给宿主：落盘 + 设为当前地图底图（带上是哪一档视图） */
  onUseAsBackground: (
    blob: Blob,
    size: { width: number; height: number },
    seed: number,
    params: WorldMapParams,
    view: MapView,
  ) => Promise<void>
  /** 「在这张图上重新生成」：把原来的种子带进来，调参后仍是同一片大陆 */
  initialSeed?: number
  /** 原来的参数（JSON 字符串，来自 `map_params`）；解析不了就当没有 */
  initialParams?: string
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
  const [progress, setProgress] = useState<{ stage: string; value: number } | null>(null)
  const [meta, setMeta] = useState<GeneratedMeta | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 预览缩放：1 = 适应面板宽度。大图（3072×1536）不放大看不清海岸线 */
  const [zoom, setZoom] = useState(1)

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
      send((requestId) => ({ type: 'render', requestId, view }))
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
    if (ready) send((requestId) => ({ type: 'render', requestId, view: next }))
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
      )
      setError(null)
    } catch (err) {
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 md:w-64">
        {/* 参数区自己滚，底部「用作底图 / PNG」固定可见：以前它们跟在滚动内容尾部，
            屏矮一点就被推到视口外，生成完还得先往下翻才找得到出口 */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <section className="flex flex-col">
          <div className="mb-1 flex items-center justify-between">
            <h2 className={SECTION_TITLE_BARE}>形态</h2>
            <span className="text-[11px] tabular-nums text-ink-faint">
              {params.width} × {params.height}
            </span>
          </div>

          <div className={LIST_END}>
            <div className={FIELD_ROW}>
              <span className={FIELD_LABEL}>尺寸</span>
              <div className="flex gap-1">
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
                      className={`${CHIP} ${
                        selected
                          ? 'bg-[var(--oc-hover)] text-ink'
                          : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                      }`}
                    >
                      {size.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={FIELD_ROW}>
              <span className={FIELD_LABEL}>大陆</span>
              <div className="flex flex-wrap gap-1">
                {PRESETS.map((preset) => {
                  const selected = (params.terrainPreset ?? 'earth') === preset.value
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setParams((prev) => ({ ...prev, terrainPreset: preset.value }))}
                      aria-pressed={selected}
                      className={`${CHIP} ${
                        selected
                          ? 'bg-[var(--oc-hover)] text-ink'
                          : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                      }`}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col">
          <div className="mb-1 flex items-center justify-between">
            <h2 className={SECTION_TITLE_BARE}>参数</h2>
            <button
              type="button"
              onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
              className={BTN_QUIET}
              title="换一个种子"
            >
              <Dices size={14} strokeWidth={2} />
              <span className="tabular-nums">{seed}</span>
            </button>
          </div>

          <div className={LIST_END}>
            {PARAM_FIELDS.map((field) => (
              <label key={field.key} className={FIELD_ROW}>
                <span className={FIELD_LABEL}>{field.label}</span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(params[field.key] ?? 0)}
                  onChange={(event) =>
                    setParams((prev) => ({ ...prev, [field.key]: Number(event.target.value) }))
                  }
                  className={RANGE_INPUT}
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className={`${BTN_PRIMARY} mt-3 w-full justify-center`}
          >
            生成
          </button>
        </section>

        <div className="flex flex-col gap-1" role="group" aria-label="视图">
          {VIEWS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => switchView(item)}
              aria-pressed={view === item}
              className={`${MENU_ITEM_BASE} ${
                view === item
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
              }`}
            >
              {MAP_VIEW_LABELS[item]}
            </button>
          ))}
        </div>

        </div>

        <div className="flex shrink-0 items-center gap-1 border-t border-line pt-3">
          <button type="button" onClick={() => void handleUse()} disabled={!ready} className={BTN_PRIMARY}>
            <Save size={14} strokeWidth={2} />
            用作底图
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!ready}
            className={`${BTN_QUIET} disabled:opacity-40`}
          >
            <ImageDown size={14} strokeWidth={2} />
            PNG
          </button>
        </div>
      </aside>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <canvas
            className={`border border-line bg-paper ${ROUND_ITEM}`}
            style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}`, width: `${zoom * 100}%` }}
          />
        </div>

        <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-control border border-line bg-paper/90 px-1 py-0.5 float-shadow">
          <button
            type="button"
            className={ICON_BTN}
            onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 4) / 4))}
            disabled={zoom <= 0.5}
            title="缩小"
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
            className={ICON_BTN}
            onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.25) * 4) / 4))}
            disabled={zoom >= 4}
            title="放大"
          >
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>
        {meta ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] tabular-nums text-ink-faint">
            <span>
              陆地 <span className="text-ink">{(meta.stats.landRatio * 100).toFixed(1)}%</span>
            </span>
            <span>
              最高峰 <span className="text-ink">{Math.round(meta.stats.maxElevation).toLocaleString('zh-CN')} m</span>
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
          </div>
        ) : null}

        {view === 'biome' ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
            {BIOME_NAMES.map((name, id) =>
              name ? (
                <span key={name} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: BIOME_COLORS[id] ?? 'transparent' }}
                  />
                  {name}
                </span>
              ) : null,
            )}
          </div>
        ) : null}
        <div className="mt-2 flex min-h-5 items-center gap-2">
          {progress ? (
            <>
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
              <span className="max-w-[50%] shrink-0 truncate text-xs text-ink-faint">{progress.stage}</span>
            </>
          ) : error ? (
            <p className="text-xs text-error">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
