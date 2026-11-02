'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  GeneratedMeta,
  MapView,
  MapVectors,
  WorldMapParams,
  WorkerResponse,
} from '../types'
import type { MapLayers } from '../profile'
import type { MapwrightData } from '../generator/mapwright'
import { clamp } from '../generator/noise'

export interface MapEngineState {
  status: 'loading' | 'idle' | 'generating' | 'ready' | 'error'
  workerReady: boolean
  progress: { stage: string; value: number }
  meta: GeneratedMeta | null
  image: ImageData | null
  view: MapView
  viewLoading: boolean
  contourInterval: number
  error: string | null
  layers: MapLayers | null
  vectors: MapVectors | null
  generate: (seed: number, params: WorldMapParams) => void
  importMapwright: (data: MapwrightData, params: WorldMapParams) => void
  selectView: (view: MapView) => void
  setContourInterval: (interval: number) => void
}

export function useMapEngine(): MapEngineState {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const viewRef = useRef<MapView>('terrain')
  const contourIntervalRef = useRef(100)
  const cacheRef = useRef<Map<string, ImageData>>(new Map())
  const dimensionsRef = useRef({ width: 1024, height: 1024 })
  const layersRef = useRef<MapLayers | null>(null)
  const metaRef = useRef<GeneratedMeta | null>(null)

  const [workerReady, setWorkerReady] = useState(false)
  const [status, setStatus] = useState<MapEngineState['status']>('loading')
  const [progress, setProgress] = useState({ stage: '等待生成', value: 0 })
  const [meta, setMeta] = useState<GeneratedMeta | null>(null)
  const [image, setImage] = useState<ImageData | null>(null)
  const [view, setView] = useState<MapView>('terrain')
  const [viewLoading, setViewLoading] = useState(false)
  const [contourInterval, setContourIntervalState] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [layers, setLayers] = useState<MapLayers | null>(null)
  const [vectors, setVectors] = useState<MapVectors | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('../map.worker.ts', import.meta.url), {
      type: 'module',
      name: 'oc-map-generator',
    })
    workerRef.current = worker
    setWorkerReady(true)
    setStatus('idle')

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setProgress({ stage: message.stage, value: message.value })
        return
      }
      if (message.type === 'error') {
        setError(message.message)
        setStatus('error')
        setViewLoading(false)
        return
      }
      if (message.type === 'generated') {
        const { width, height } = message.meta
        dimensionsRef.current = { width, height }
        const imageData = new ImageData(
          new Uint8ClampedArray(message.initialImage),
          width,
          height,
        )
        cacheRef.current = new Map([['terrain:0', imageData]])
        layersRef.current = {
          height: new Int16Array(message.height),
          biome: new Uint8Array(message.biome),
          water: new Uint8Array(message.water),
          temperature: new Int16Array(message.temperature),
          moisture: new Uint8Array(message.moisture),
          width,
          mapHeight: height,
        }
        metaRef.current = message.meta
        setLayers(layersRef.current)
        setVectors(message.vectors)
        setMeta(message.meta)
        setImage(imageData)
        setView('terrain')
        viewRef.current = 'terrain'
        setProgress({ stage: '完成', value: 1 })
        setStatus('ready')
        setViewLoading(false)
        return
      }
      if (message.type === 'rendered') {
        const imageData = new ImageData(
          new Uint8ClampedArray(message.buffer),
          dimensionsRef.current.width,
          dimensionsRef.current.height,
        )
        const interval = message.view === 'contour' ? message.contourInterval ?? 100 : 0
        cacheRef.current.set(`${message.view}:${interval}`, imageData)
        const effective = viewRef.current === 'profile' ? 'terrain' : viewRef.current
        if (
          message.view === effective &&
          (effective !== 'contour' || interval === contourIntervalRef.current)
        ) {
          setImage(imageData)
        }
        setViewLoading(false)
      }
    }

    worker.onerror = (event) => {
      setError(event.message || '地图 Worker 异常')
      setStatus('error')
      setViewLoading(false)
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const generate = useCallback((seed: number, params: WorldMapParams) => {
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++requestIdRef.current
    cacheRef.current.clear()
    metaRef.current = null
    layersRef.current = null
    setLayers(null)
    setVectors(null)
    setImage(null)
    setError(null)
    setMeta(null)
    setView('terrain')
    viewRef.current = 'terrain'
    setViewLoading(false)
    setProgress({ stage: '排队', value: 0 })
    setStatus('generating')
    worker.postMessage({
      type: 'generate',
      requestId,
      seed: seed >>> 0,
      params,
    })
  }, [])

  const importMapwright = useCallback((data: MapwrightData, params: WorldMapParams) => {
    const worker = workerRef.current
    if (!worker) return
    const requestId = ++requestIdRef.current
    cacheRef.current.clear()
    metaRef.current = null
    layersRef.current = null
    setLayers(null)
    setVectors(null)
    setImage(null)
    setError(null)
    setMeta(null)
    setView('terrain')
    viewRef.current = 'terrain'
    setViewLoading(false)
    setProgress({ stage: '导入 mapwright', value: 0 })
    setStatus('generating')
    worker.postMessage({
      type: 'mapwright',
      requestId,
      data,
      params,
    })
  }, [])

  const selectView = useCallback((next: MapView) => {
    setView(next)
    viewRef.current = next
    setError(null)
    const worker = workerRef.current
    if (!worker || !metaRef.current) return
    const effective = next === 'profile' ? 'terrain' : next
    const interval = effective === 'contour' ? contourIntervalRef.current : 0
    const cached = cacheRef.current.get(`${effective}:${interval}`)
    if (cached) {
      setImage(cached)
      setViewLoading(false)
      return
    }
    setViewLoading(true)
    worker.postMessage({
      type: 'render',
      requestId: ++requestIdRef.current,
      view: next,
      contourInterval: contourIntervalRef.current,
    })
  }, [])

  const setContourInterval = useCallback((interval: number) => {
    const next = clamp(Math.round(interval / 50) * 50, 50, 500)
    contourIntervalRef.current = next
    setContourIntervalState(next)
    const worker = workerRef.current
    if (!worker || !metaRef.current) return
    cacheRef.current.delete(`contour:${next}`)
    if (viewRef.current !== 'contour') return
    setViewLoading(true)
    worker.postMessage({
      type: 'render',
      requestId: ++requestIdRef.current,
      view: 'contour',
      contourInterval: next,
    })
  }, [])

  return {
    status,
    workerReady,
    progress,
    meta,
    image,
    view,
    viewLoading,
    contourInterval,
    error,
    layers,
    vectors,
    generate,
    importMapwright,
    selectView,
    setContourInterval,
  }
}
