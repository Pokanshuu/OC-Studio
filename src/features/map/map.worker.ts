/// <reference lib="webworker" />

import { generateWorld } from './generator'
import { buildMapwrightWorld } from './generator/mapwright'
import { renderView } from './generator/render'
import { buildMapVectors } from './generator/vectors'
import { clamp } from './generator/noise'
import type { MapState, RenderContext } from './generator/render'
import { MAP_ALGORITHM_VERSION } from './types'
import type { MapView, WorkerRequest, WorkerResponse, WorldMapParams } from './types'
import type { MapwrightData } from './generator/mapwright'

const ctx = self as unknown as DedicatedWorkerGlobalScope

let world: MapState | null = null
let renderContext: RenderContext | null = null
let cache = new Map<string, Uint8ClampedArray>()

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer)
}

function progress(requestId: number, stage: string, value: number): void {
  post({ type: 'progress', requestId, stage, value })
}

function copyBuffer(view: Uint8Array | Int16Array): ArrayBuffer {
  const copy = view.slice()
  return copy.buffer as ArrayBuffer
}

function generate(requestId: number, seed: number, params: WorldMapParams): void {
  try {
    cache = new Map()
    const generated = generateWorld(seed, params, (stage, value) => progress(requestId, stage, value))
    world = generated.state
    renderContext = generated.context

    const initial = renderView(generated.state, generated.context, 'terrain')
    cache.set('terrain:0', initial)
    progress(requestId, '鍑嗗鍥惧眰', 0.99)

    const height = copyBuffer(generated.state.terrain.elevation)
    const biome = copyBuffer(generated.state.biomes.biome)
    const water = copyBuffer(generated.state.hydrology.water)
    const temperature = copyBuffer(generated.state.climate.temperature)
    const moisture = copyBuffer(generated.state.climate.moisture)
    const initialImage = initial.slice().buffer as ArrayBuffer
    const vectors = buildMapVectors(generated.state.terrain, generated.state.hydrology)

    post(
      {
        type: 'generated',
        requestId,
        meta: {
          algorithmVersion: MAP_ALGORITHM_VERSION,
          seed,
          params: generated.state.params,
          generatedAt: Date.now(),
          stats: generated.stats,
          width: generated.state.terrain.width,
          height: generated.state.terrain.height,
        },
        height,
        biome,
        water,
        temperature,
        moisture,
        initialImage,
        vectors,
      },
      [height, biome, water, temperature, moisture, initialImage],
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '鍦板浘鐢熸垚澶辫触'
    post({ type: 'error', requestId, message })
  }
}

function importMapwright(
  requestId: number,
  data: MapwrightData,
  params: WorldMapParams,
): void {
  try {
    cache = new Map()
    const generated = buildMapwrightWorld(data, params)
    world = generated.state
    renderContext = generated.context

    const initial = renderView(generated.state, generated.context, 'terrain')
    cache.set('terrain:0', initial)
    progress(requestId, '鏄犲皠 mapwright 鏁版嵁', 0.99)

    const height = copyBuffer(generated.state.terrain.elevation)
    const biome = copyBuffer(generated.state.biomes.biome)
    const water = copyBuffer(generated.state.hydrology.water)
    const temperature = copyBuffer(generated.state.climate.temperature)
    const moisture = copyBuffer(generated.state.climate.moisture)
    const initialImage = initial.slice().buffer as ArrayBuffer
    const vectors = buildMapVectors(generated.state.terrain, generated.state.hydrology)

    post(
      {
        type: 'generated',
        requestId,
        meta: {
          algorithmVersion: MAP_ALGORITHM_VERSION,
          seed: data.seed ?? 0,
          params: generated.state.params,
          generatedAt: Date.now(),
          stats: generated.stats,
          width: generated.state.terrain.width,
          height: generated.state.terrain.height,
        },
        height,
        biome,
        water,
        temperature,
        moisture,
        initialImage,
        vectors,
      },
      [height, biome, water, temperature, moisture, initialImage],
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'mapwright 鏁版嵁瀵煎叆澶辫触'
    post({ type: 'error', requestId, message })
  }
}

function render(requestId: number, view: MapView, contourInterval = 100): void {
  try {
    if (!world || !renderContext) {
      post({ type: 'error', requestId, message: '鍦板浘灏氭湭鐢熸垚' })
      return
    }
    const effective = view === 'profile' ? 'terrain' : view
    const interval = clamp(Math.round(contourInterval / 50) * 50, 50, 500)
    const cacheKey = `${effective}:${effective === 'contour' ? interval : 0}`
    let image = cache.get(cacheKey)
    if (!image) {
      image = renderView(world, renderContext, effective, interval)
      cache.set(cacheKey, image)
    }
    if (view === 'profile' && !cache.has('profile')) {
      cache.set('profile', image)
    }
    const buffer = image.slice().buffer as ArrayBuffer
    post({ type: 'rendered', requestId, view, contourInterval: interval, buffer }, [buffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : '鍥惧眰娓叉煋澶辫触'
    post({ type: 'error', requestId, message })
  }
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type === 'generate') {
    generate(request.requestId, request.seed, request.params)
  } else if (request.type === 'mapwright') {
    importMapwright(request.requestId, request.data, request.params)
  } else if (request.type === 'render') {
    render(request.requestId, request.view, request.contourInterval)
  }
}

export {}

