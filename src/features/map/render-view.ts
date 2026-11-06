/**
 * 用**存下来的生成快照**重画一档视图（方案 A 的唯一渲染入口）。
 *
 * 为什么走 Worker 而不是主线程纯函数：一张世界图生成要几百毫秒到数秒，
 * 在主线程做会把切模式变成一个拖动窗口都掉帧的动作。插件本来就有 Worker，
 * 宿主侧没有理由自己再写一遍。
 *
 * 契约（`src/plugins/map-generator/index.ts`）：只认 `createMapGeneratorWorker` /
 * `normalizeMapParams` 两个出口，不碰 `kernel/*`。
 *
 * 一次调用建一个 Worker、用完即弃 —— 这里不需要「世界活在内存里」，
 * 每次都是同一份种子 + 参数，结果必然一致（算法版本变了才会变）。
 */
import {
  createMapGeneratorWorker,
  lineLengthKm,
  normalizeMapParams,
  sampleProfile,
  type MapLayers,
  type MapView,
  type ProfilePoint,
  type WorldMapParams,
  type WorkerRequest,
  type WorkerResponse,
} from '@/plugins/map-generator'

export interface RenderMapViewOptions {
  seed: number
  /** 落库时的参数快照（JSON.parse 之后的对象） */
  params: WorldMapParams
  view: MapView
  /** 进度：0–1，用于「生成中」的细线 */
  onProgress?: (stage: string, value: number) => void
  /** 单档渲染的兜底超时（毫秒）。超时就报错，不把界面永远挂在「生成中」 */
  timeoutMs?: number
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

/** 把一帧 RGBA 画进离屏画布并编成 PNG（生成器保存时也用它转 Worker 回的像素） */
export async function pixelsToPng(buffer: ArrayBuffer, width: number, height: number): Promise<Blob> {
  const expected = width * height * 4
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('地图尺寸不合法')
  }
  if (buffer.byteLength !== expected) throw new Error('地图像素与宽高不一致')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('画布不可用')
  context.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png')
  })
  if (!blob) throw new Error('导出像素失败')
  return blob
}

export async function renderMapView(options: RenderMapViewOptions): Promise<Blob> {
  const params = normalizeMapParams(options.params)
  const worker = createMapGeneratorWorker()
  const requestId = 1
  const timeoutMs = options.timeoutMs ?? 60_000

  try {
    return await new Promise<Blob>((resolve, reject) => {
      let settled = false
      let width = params.width
      let height = params.height

      const finish = (error: Error | null, blob?: Blob): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (error) reject(error)
        else if (blob) resolve(blob)
        else reject(new Error('渲染失败'))
      }

      const timer = window.setTimeout(() => finish(new Error('渲染超时')), timeoutMs)

      const send = (request: WorkerRequest): void => worker.postMessage(request)

      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const message = event.data
        if (message.requestId !== requestId) return

        if (message.type === 'progress') {
          options.onProgress?.(message.stage, message.value)
          return
        }
        if (message.type === 'error') {
          finish(new Error(message.message.length > 0 ? message.message : '渲染失败'))
          return
        }
        if (message.type === 'generated') {
          width = message.meta.width
          height = message.meta.height
          options.onProgress?.('绘制', 0.98)
          send({ type: 'render', requestId, view: options.view })
          return
        }
        // rendered
        void pixelsToPng(message.buffer, width, height)
          .then((blob) => finish(null, blob))
          .catch((err: unknown) => finish(new Error(messageOf(err))))
      })

      worker.addEventListener('error', (event: ErrorEvent) => {
        event.preventDefault()
        finish(new Error('地图生成器出错'))
      })

      send({ type: 'generate', requestId, seed: options.seed, params })
    })
  } finally {
    worker.terminate()
  }
}

/* ── 剖面 ─────────────────────────────────────────────────────────────── */

export interface MapProfileResult {
  points: ProfilePoint[]
  lengthKm: number
  /** 底图像素尺寸（剖面坐标是像素，界面上要按比例换算） */
  width: number
  height: number
}

/**
 * 沿一条**归一化**直线取地形剖面。
 *
 * 与切视图共用同一份快照（种子 + 参数），所以剖面永远和屏幕上那张图对得上。
 * 采样要的是整片图层（高程 / 生物群系 / 水体 / 温度 / 降水），Worker 的
 * `generated` 消息本来就原样传回来了 —— 这里只是把它们拼成 `MapLayers`，
 * 不必再画一遍像素。
 */
export async function renderMapProfile(options: {
  seed: number
  params: WorldMapParams
  /** 归一化 0–1 的两端点（与标注、锚点同一套坐标） */
  line: { ax: number; ay: number; bx: number; by: number }
  onProgress?: (stage: string, value: number) => void
  timeoutMs?: number
}): Promise<MapProfileResult> {
  const params = normalizeMapParams(options.params)
  const worker = createMapGeneratorWorker()
  const requestId = 1
  const timeoutMs = options.timeoutMs ?? 60_000

  try {
    return await new Promise<MapProfileResult>((resolve, reject) => {
      let settled = false
      const finish = (error: Error | null, result?: MapProfileResult): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (error) reject(error)
        else if (result) resolve(result)
        else reject(new Error('剖面采样失败'))
      }
      const timer = window.setTimeout(() => finish(new Error('剖面采样超时')), timeoutMs)

      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const message = event.data
        if (message.requestId !== requestId) return

        if (message.type === 'progress') {
          options.onProgress?.(message.stage, message.value)
          return
        }
        if (message.type === 'error') {
          finish(new Error(message.message.length > 0 ? message.message : '剖面采样失败'))
          return
        }
        if (message.type !== 'generated') return

        const width = message.meta.width
        const height = message.meta.height
        const layers: MapLayers = {
          height: new Int16Array(message.height),
          biome: new Uint8Array(message.biome),
          water: new Uint8Array(message.water),
          temperature: new Int16Array(message.temperature),
          moisture: new Uint8Array(message.moisture),
          width,
          mapHeight: height,
        }
        const line = {
          ax: options.line.ax * width,
          ay: options.line.ay * height,
          bx: options.line.bx * width,
          by: options.line.by * height,
        }
        finish(null, {
          points: sampleProfile(layers, line),
          lengthKm: lineLengthKm(line),
          width,
          height,
        })
      })

      worker.addEventListener('error', (event: ErrorEvent) => {
        event.preventDefault()
        finish(new Error('地图生成器出错'))
      })

      worker.postMessage({ type: 'generate', requestId, seed: options.seed, params } satisfies WorkerRequest)
    })
  } finally {
    worker.terminate()
  }
}
