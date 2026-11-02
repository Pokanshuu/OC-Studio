'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Dices,
  Flag,
  Info,
  Layers,
  LineChart,
  Lock,
  Mountain,
  RefreshCw,
  Thermometer,
  Trees,
  Upload,
} from 'lucide-react'
import type { MapAnnotation, WorldMapParams, WorldMapRecord } from '@/types'
import {
  DEFAULT_MAP_PARAMS,
  DEFAULT_PROFILE_LINE,
  DEFAULT_REGION_PARAMS,
  MAP_MAX_SIZE,
  MAP_MIN_SIZE,
} from '../types'
import type { MapView as MapViewId } from '../types'
import { normalizeMapParams } from '../params'
import { useMapEngine } from '../hooks/useMapEngine'
import type { MapwrightData } from '../generator/mapwright'
import { generatePolitical } from '../political'
import type { PoliticalData } from '../political'
import { useCountryList } from '@/features/countries/hooks/useCountries'
import { createCountry } from '@/features/countries/services'
import { useEntryList } from '@/features/world/hooks/useWorldEntries'
import {
  getActiveMap,
  getMap,
  getMapRecords,
  getRegionChildren,
  saveGeneratedMap,
  moveMapToTrash,
  saveMapAnnotations,
  setActiveMapId,
  updateRegionPlacement,
} from '../services'
import { lineLengthKm, profileExtremes, sampleProfile } from '../profile'
import { makeMapThumbnail } from '../thumbnail'
import { composeMapBlob, downloadMapImage, downloadOcmap } from '../mapExport'
import { MapCanvas, type RegionOverlay } from './MapCanvas'
import { ProfileChart } from './ProfileChart'
import { MapLegend } from './MapLegend'
import { MapAlgorithmDialog } from './MapAlgorithmDialog'

const TERRAIN_PRESETS: Array<{
  id: 'earth' | 'three-continents' | 'islands' | 'pangaea' | 'custom'
  label: string
  description: string
  landCoverage: number
  mountainStrength: number
  plateauStrength: number
  plainBias: number
}> = [
  {
    id: 'earth',
    label: '地球型大陆',
    description: '南北大陆，约 70% 海洋',
    landCoverage: 0.3,
    mountainStrength: 0.62,
    plateauStrength: 0.5,
    plainBias: 0.05,
  },
  {
    id: 'three-continents',
    label: '三大洲',
    description: '三块大陆，少量岛屿',
    landCoverage: 0.32,
    mountainStrength: 0.68,
    plateauStrength: 0.58,
    plainBias: 0.02,
  },
  {
    id: 'islands',
    label: '多岛屿世界',
    description: '群岛为主，海洋约 85%',
    landCoverage: 0.15,
    mountainStrength: 0.52,
    plateauStrength: 0.42,
    plainBias: 0.1,
  },
  {
    id: 'pangaea',
    label: '盘古大陆',
    description: '一整块超级大陆',
    landCoverage: 0.34,
    mountainStrength: 0.76,
    plateauStrength: 0.68,
    plainBias: -0.02,
  },
  {
    id: 'custom',
    label: '自定义参数',
    description: '保留当前参数自由生成',
    landCoverage: 0.42,
    mountainStrength: 0.68,
    plateauStrength: 0.55,
    plainBias: 0.05,
  },
]

const VIEWS: Array<{ id: MapViewId; label: string; icon: typeof Mountain }> = [
  { id: 'terrain', label: '地形', icon: Mountain },
  { id: 'contour', label: '等高线', icon: Layers },
  { id: 'temperature', label: '温度', icon: Thermometer },
  { id: 'moisture', label: '降水', icon: CloudRain },
  { id: 'biome', label: '生物群系', icon: Trees },
  { id: 'political', label: '政治', icon: Flag },
  { id: 'profile', label: '剖面', icon: LineChart },
]

function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

function parseSeed(text: string): number {
  const cleaned = text.trim().replace(/^#/, '').replace(/^0x/i, '')
  if (!cleaned) return 0
  const base = /[a-f]/i.test(cleaned) ? 16 : 10
  const value = Number.parseInt(cleaned, base)
  if (!Number.isFinite(value)) return 0
  return value >>> 0
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

interface SliderRowProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
  disabled?: boolean
}

function SliderRow({ label, hint, value, min, max, step, display, onChange, disabled }: SliderRowProps) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? 'opacity-60' : ''}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink">{label}</span>
        <span className="font-mono text-[10px] text-ink-muted">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-ink"
      />
      {hint ? <span className="text-[10px] leading-4 text-ink-faint">{hint}</span> : null}
    </label>
  )
}

interface MapViewProps {
  active?: boolean
  /** 生成器只负责地形；地图工作台负责国家/城市/道路编辑。 */
  mode?: 'generator' | 'editor'
  onCloseEditor?: () => void
}

export function MapView({ active = true, mode = 'generator', onCloseEditor }: MapViewProps) {
  const editorMode = mode === 'editor'
  const engine = useMapEngine()
  const { countries } = useCountryList()
  const { entries } = useEntryList()
  const [seedText, setSeedText] = useState('5EED2026')
  const [params, setParams] = useState<WorldMapParams>({ ...DEFAULT_MAP_PARAMS })
  const [mapName, setMapName] = useState('未命名世界')
  const [mapId, setMapId] = useState<number | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [showPresetChooser, setShowPresetChooser] = useState(true)
  const [mapList, setMapList] = useState<WorldMapRecord[]>([])
  const [algorithmOpen, setAlgorithmOpen] = useState(false)
  const [line, setLine] = useState(DEFAULT_PROFILE_LINE)
  const [annotations, setAnnotations] = useState<MapAnnotation[]>([])
  const [paintBlob, setPaintBlob] = useState<Blob | null>(null)
  const [paintVersion, setPaintVersion] = useState(0)
  const [political, setPolitical] = useState<PoliticalData | null>(null)
  const [selectedStateId, setSelectedStateId] = useState<number | null>(null)
  const [politicalVersion, setPoliticalVersion] = useState(0)
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null)
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null)
  const [countryColor, setCountryColor] = useState('#B36651')
  const [roadColor, setRoadColor] = useState('#8A6A46')
  const [showContourWater, setShowContourWater] = useState(true)
  const [leftOpen, setLeftOpen] = useState(!editorMode)
  const [rightOpen, setRightOpen] = useState(!editorMode)
  const [politicalEditMode, setPoliticalEditMode] = useState(false)
  const [roadMode, setRoadMode] = useState(false)
  const [roadAppendMode, setRoadAppendMode] = useState(false)
  const [selectedRoadId, setSelectedRoadId] = useState<number | null>(null)
  const [roadNodeEditRoadId, setRoadNodeEditRoadId] = useState<number | null>(null)
  const [movingCityId, setMovingCityId] = useState<number | null>(null)
  const [roadDraft, setRoadDraft] = useState<Array<{ x: number; y: number }>>([])
  const politicalHistoryRef = useRef<PoliticalData[]>([])
  const politicalFutureRef = useRef<PoliticalData[]>([])
  const selectedState = political?.states.find((state) => state.id === selectedStateId) ?? null
  const selectedAnnotationCountry =
    countries.find((country) => country.id === selectedCountryId) ?? null
  const annotationCountry = selectedAnnotationCountry
    ? {
        id: selectedAnnotationCountry.id as number,
        name: selectedAnnotationCountry.name,
        color: countryColor,
      }
    : null
  const [regionOverlays, setRegionOverlays] = useState<RegionOverlay[]>([])
  const [regionRevision, setRegionRevision] = useState(0)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const startedRef = useRef(false)
  const initialRecordRef = useRef<WorldMapRecord | null>(null)

  useEffect(() => {
    let cancelled = false
    getActiveMap()
      .then((record) => {
        if (cancelled) return
        initialRecordRef.current = record ?? null
        if (record) {
          setShowPresetChooser(false)
          setMapId(record.id)
        setShowPresetChooser(false)
          setMapName(record.name)
          setSeedText(formatSeed(record.seed))
          setParams(normalizeMapParams(record.params))
          setAnnotations(record.annotations ?? [])
          setPaintBlob(record.paintBlob ?? null)
          setPolitical((record.political as PoliticalData | undefined) ?? null)
          setAcceptedAt(record.acceptedAt ?? null)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!active || !engine.workerReady || !loaded || startedRef.current) return
    startedRef.current = true
    const record = initialRecordRef.current
    // 首次打开生成器：有上次地图就恢复；没有地图则等待用户设置参数再生成。
    if (record) engine.generate(record.seed, normalizeMapParams(record.params))
  }, [active, engine, loaded])

  useEffect(() => {
    const handleOpen = (event: Event): void => {
      const id = (event as CustomEvent<number>).detail
      if (typeof id !== 'number') return
      void getMap(id).then((record) => {
        if (!record || record.id === undefined) return
        const nextParams = normalizeMapParams(record.params)
        setMapId(record.id)
        setShowPresetChooser(false)
        setMapName(record.name)
        setSeedText(formatSeed(record.seed))
        setParams(nextParams)
        setAnnotations(record.annotations ?? [])
        setPaintBlob(record.paintBlob ?? null)
        setPaintVersion((version) => version + 1)
        setPolitical((record.political as PoliticalData | undefined) ?? null)
        setAcceptedAt(record.acceptedAt ?? null)
        setSelectedStateId(null)
        setRegionRevision((revision) => revision + 1)
        setActiveMapId(record.id)
        engine.generate(record.seed, nextParams)
      })
    }
    window.addEventListener('oc-map-open', handleOpen)
    return () => window.removeEventListener('oc-map-open', handleOpen)
  }, [engine])

  const refreshMapList = useCallback(async () => {
    try {
      setMapList(await getMapRecords())
    } catch {
      setMapList([])
    }
  }, [])

  useEffect(() => {
    void refreshMapList()
  }, [refreshMapList])

  const defaultContourReadyRef = useRef(0)
  useEffect(() => {
    if (editorMode || !engine.meta) return
    if (defaultContourReadyRef.current === engine.meta.generatedAt) return
    defaultContourReadyRef.current = engine.meta.generatedAt
    engine.selectView('contour')
  }, [editorMode, engine.meta, engine.view])

  const editorPoliticalReadyRef = useRef(false)
  useEffect(() => {
    editorPoliticalReadyRef.current = false
  }, [mapId])

  useEffect(() => {
    if (!editorMode) {
      editorPoliticalReadyRef.current = false
      if (engine.view === 'political') engine.selectView('terrain')
      return
    }
    // 只在进入工作台时自动切到政治视图，之后用户可以自由切到等高线等视图。
    if (engine.meta && !editorPoliticalReadyRef.current) {
      editorPoliticalReadyRef.current = true
      if (engine.view !== 'political') engine.selectView('political')
    }
  }, [editorMode, engine.meta, engine.view])

  const persistKeyRef = useRef('')
  const mapwrightInputRef = useRef<HTMLInputElement>(null)
  const saveCurrentMap = useCallback(async (overrides?: { acceptedAt?: number }): Promise<WorldMapRecord | undefined> => {
    const meta = engine.meta
    if (!meta) return undefined
    const name = mapName.trim() || '未命名世界'
    setSaving(true)
    try {
      const image = engine.image
      const imageBlob = image ? await composeMapBlob(image, political) : undefined
      const record = await saveGeneratedMap({
        id: mapId,
        name,
        seed: meta.seed,
        params: meta.params,
        meta,
        annotations,
        thumbnail: image ? makeMapThumbnail(image) ?? undefined : undefined,
        imageBlob: imageBlob ?? undefined,
        paintBlob,
        political: political ?? undefined,
        acceptedAt: overrides?.acceptedAt ?? acceptedAt ?? undefined,
      })
      if (record.id !== undefined) {
        setMapId(record.id)
        setShowPresetChooser(false)
        setActiveMapId(record.id)
      }
      setSavedAt(Date.now())
      void refreshMapList()
      return record
    } catch {
      return undefined
    } finally {
      setSaving(false)
    }
  }, [acceptedAt, annotations, engine.image, engine.meta, mapId, mapName, paintBlob, political, refreshMapList])

  useEffect(() => {
    const meta = engine.meta
    // 新生成的地图必须由用户点击“保存”才进入资产库；已有地图的编辑才自动保存。
    if (!meta || mapId === undefined) return
    const name = mapName.trim() || '未命名世界'
    const key = `${meta.generatedAt}:${mapId ?? 'new'}:${name}:${paintVersion}:${politicalVersion}`
    if (persistKeyRef.current === key) return
    persistKeyRef.current = key
    void saveCurrentMap()
  }, [engine.meta, mapId, mapName, paintVersion, politicalVersion, saveCurrentMap])

  const handleSaveNow = useCallback(() => {
    persistKeyRef.current = `${engine.meta?.generatedAt ?? 0}:${mapId ?? 'new'}:${mapName.trim() || '未命名世界'}`
    void saveCurrentMap()
  }, [engine.meta?.generatedAt, mapId, mapName, paintVersion, saveCurrentMap])

  const handleAcceptMap = useCallback(() => {
    const now = Date.now()
    setAcceptedAt(now)
    void saveCurrentMap({ acceptedAt: now })
  }, [saveCurrentMap])

  const handlePaintChange = useCallback((blob: Blob | null) => {
    setPaintBlob(blob)
    setPaintVersion((version) => version + 1)
  }, [])

  const handleGeneratePolitical = useCallback(() => {
    if (!engine.layers || !engine.meta) return
    const next = generatePolitical(engine.layers, engine.meta.seed ^ 0x9e3779b9)
    setPolitical(next)
    setSelectedStateId(next.states[0]?.id ?? null)
    setPoliticalVersion((version) => version + 1)
    if (engine.view !== 'political') engine.selectView('political')
  }, [engine])

  const updatePolitical = useCallback((next: PoliticalData) => {
    setPolitical((current) => {
      if (current) {
        politicalHistoryRef.current.push(current)
        if (politicalHistoryRef.current.length > 60) politicalHistoryRef.current.shift()
        politicalFutureRef.current = []
      }
      return next
    })
    setPoliticalVersion((version) => version + 1)
  }, [])

  const undoPolitical = useCallback(() => {
    const previous = politicalHistoryRef.current.pop()
    if (!previous) return
    setPolitical((current) => {
      if (current) politicalFutureRef.current.push(current)
      return previous
    })
    setPoliticalVersion((version) => version + 1)
  }, [])

  const redoPolitical = useCallback(() => {
    const next = politicalFutureRef.current.pop()
    if (!next) return
    setPolitical((current) => {
      if (current) politicalHistoryRef.current.push(current)
      return next
    })
    setPoliticalVersion((version) => version + 1)
  }, [])

  const handleSyncCountries = useCallback(async () => {
    if (!political) return
    const nextStates = [...political.states]
    for (let index = 0; index < nextStates.length; index++) {
      const state = nextStates[index]
      if (state.countryId) continue
      const countryId = await createCountry({
        name: state.name,
        parentId: null,
        description: '由地图政治层生成',
        system: '',
        geography: '',
        culture: '',
        characters: [],
        events: [],
        tags: [],
      })
      nextStates[index] = { ...state, countryId }
    }
    updatePolitical({ ...political, states: nextStates })
    window.dispatchEvent(new Event('data-updated'))
  }, [political, updatePolitical])

  const handleCountryDrop = useCallback(
    (countryId: number, x: number, y: number) => {
      const country = countries.find((item) => item.id === countryId)
      if (!country || !engine.layers || !engine.meta) return
      const existing = political?.seeds ?? []
      if (existing.some((seed) => seed.countryId === countryId)) {
        setSelectedStateId(political?.states.find((state) => state.countryId === countryId)?.id ?? null)
        return
      }
      const palette = ['#B36651', '#5E8B74', '#8B7BA8', '#C49A4A', '#6A8FA8', '#A96C7B', '#7F8F54', '#A07850']
      const nextSeed = {
        countryId,
        name: country.name,
        color: palette[existing.length % palette.length],
        x,
        y,
      }
      const next = generatePolitical(engine.layers, engine.meta.seed ^ 0x9e3779b9, [...existing, nextSeed])
      setPolitical(next)
      setSelectedStateId(next.states.find((state) => state.countryId === countryId)?.id ?? null)
      setPoliticalVersion((version) => version + 1)
      if (engine.view !== 'political') engine.selectView('political')
    },
    [countries, engine, political],
  )

  const handleAutoPlaceCities = useCallback(() => {
    if (!political) return
    const usedNames = new Set(political.cities.map((city) => city.name))
    const available = entries.filter((entry) => entry.id !== undefined && !usedNames.has(entry.title))
    if (available.length === 0) {
      window.alert('设定集里没有新的城市/地点词条可安置')
      return
    }
    const ownedByState = new Map<number, number[]>()
    for (let index = 0; index < political.owner.length; index++) {
      const owner = political.owner[index]
      if (!owner) continue
      const list = ownedByState.get(owner) ?? []
      list.push(index)
      ownedByState.set(owner, list)
    }
    const totalOwned = [...ownedByState.values()].reduce((sum, list) => sum + list.length, 0)
    if (totalOwned === 0) return
    const nextCities = [...political.cities]
    let nextId = Math.max(0, ...nextCities.map((city) => city.id)) + 1
    let cursor = 0
    for (const state of political.states) {
      if (cursor >= available.length) break
      const owned = ownedByState.get(state.id) ?? []
      if (owned.length === 0) continue
      const share = Math.max(
        1,
        Math.round((available.length * owned.length) / totalOwned),
      )
      const take = Math.min(share, available.length - cursor)
      const candidates = [...owned]
        .map((cell) => {
          const x = cell % political.cols
          const y = Math.floor(cell / political.cols)
          if (!engine.layers) return { cell, score: 0 }
          const sx = Math.min(
            engine.layers.width - 1,
            Math.floor(((x + 0.5) / political.cols) * engine.layers.width),
          )
          const sy = Math.min(
            engine.layers.mapHeight - 1,
            Math.floor(((y + 0.5) / political.rows) * engine.layers.mapHeight),
          )
          let waterNear = 0
          let high = 0
          for (let dy = -4; dy <= 4; dy += 2) {
            for (let dx = -4; dx <= 4; dx += 2) {
              const px = sx + dx
              const py = sy + dy
              if (px < 0 || py < 0 || px >= engine.layers.width || py >= engine.layers.mapHeight) continue
              const index = py * engine.layers.width + px
              if (engine.layers.water[index] !== 0) waterNear += 1
              if (engine.layers.height[index] > 2600) high += 1
            }
          }
          const index = sy * engine.layers.width + sx
          const elevation = Math.max(0, engine.layers.height[index])
          return { cell, score: elevation / 8000 - waterNear * 0.12 + high * 0.08 }
        })
        .sort((a, b) => a.score - b.score)
      for (let n = 0; n < take; n++) {
        const entry = available[cursor + n]
        let selected: { x: number; y: number } | null = null
        for (const candidate of candidates) {
          const x = (candidate.cell % political.cols) / political.cols
          const y = Math.floor(candidate.cell / political.cols) / political.rows
          if (nextCities.some((city) => Math.hypot(city.x - x, city.y - y) < 0.014)) continue
          selected = { x, y }
          break
        }
        if (!selected) continue
        nextCities.push({
          id: nextId++,
          stateId: state.id,
          name: entry.title,
          x: selected.x,
          y: selected.y,
          worldEntryId: entry.id,
        })
      }
      cursor += take
    }
    updatePolitical({ ...political, cities: nextCities })
  }, [engine.layers, entries, political, updatePolitical])

  const handleWorldEntryDrop = useCallback(
    (entryId: number, x: number, y: number) => {
      const entry = entries.find((item) => item.id === entryId)
      if (!entry || !political) return
      const gx = Math.max(0, Math.min(political.cols - 1, Math.floor(x * political.cols)))
      const gy = Math.max(0, Math.min(political.rows - 1, Math.floor(y * political.rows)))
      const owner = political.owner[gy * political.cols + gx]
      let stateId = owner
      if (!stateId) {
        // 落在无主地时并入最近的国家首都，避免拖放失败。
        let bestDistance = Infinity
        for (const state of political.states) {
          const dx = state.capitalX - x
          const dy = state.capitalY - y
          const distance = dx * dx + dy * dy
          if (distance < bestDistance) {
            bestDistance = distance
            stateId = state.id
          }
        }
      }
      if (!stateId) return
      const nextId = Math.max(0, ...political.cities.map((city) => city.id)) + 1
      updatePolitical({
        ...political,
        cities: [
          ...political.cities,
          {
            id: nextId,
            stateId,
            name: entry.title,
            x,
            y,
            worldEntryId: entry.id,
          },
        ],
      })
      setSelectedStateId(stateId)
    },
    [entries, political, updatePolitical],
  )

  const handleCityMove = useCallback(
    (x: number, y: number) => {
      if (!political || movingCityId === null) return
      updatePolitical({
        ...political,
        cities: political.cities.map((city) =>
          city.id === movingCityId ? { ...city, x, y } : city,
        ),
      })
      setMovingCityId(null)
    },
    [movingCityId, political, updatePolitical],
  )

  const handleRoadNodeMove = useCallback(
    (roadId: number, index: number, x: number, y: number) => {
      if (!political) return
      updatePolitical({
        ...political,
        roads: (political.roads ?? []).map((road) =>
          road.id === roadId
            ? {
                ...road,
                points: road.points.map((point, pointIndex) =>
                  pointIndex === index ? { x, y } : point,
                ),
              }
            : road,
        ),
      })
    },
    [political, updatePolitical],
  )

  const handleRoadPoint = useCallback(
    (x: number, y: number) => {
      if (roadAppendMode && selectedRoadId !== null && political) {
        updatePolitical({
          ...political,
          roads: (political.roads ?? []).map((road) =>
            road.id === selectedRoadId ? { ...road, points: [...road.points, { x, y }] } : road,
          ),
        })
        return
      }
      setRoadDraft((points) => [...points, { x, y }])
    },
    [political, roadAppendMode, selectedRoadId, updatePolitical],
  )

  const finishRoad = useCallback(() => {
    if (!political || roadDraft.length < 2) {
      setRoadMode(false)
      setRoadDraft([])
      return
    }
    const nextId = Math.max(0, ...(political.roads ?? []).map((road) => road.id)) + 1
    updatePolitical({
      ...political,
      roads: [
        ...(political.roads ?? []),
        {
          id: nextId,
          stateId: selectedStateId ?? undefined,
          points: roadDraft,
        },
      ],
    })
    setRoadMode(false)
    setRoadDraft([])
  }, [political, roadDraft, selectedStateId, updatePolitical])

  const handlePoliticalAssign = useCallback(
    (x: number, y: number) => {
      if (!political || !selectedStateId) return
      const gx = Math.max(0, Math.min(political.cols - 1, Math.floor(x * political.cols)))
      const gy = Math.max(0, Math.min(political.rows - 1, Math.floor(y * political.rows)))
      const index = gy * political.cols + gx
      if (political.owner[index] === selectedStateId) return
      const owner = [...political.owner]
      owner[index] = selectedStateId
      updatePolitical({ ...political, owner })
    },
    [political, selectedStateId, updatePolitical],
  )

  const handleMapwrightFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        const data = JSON.parse(await file.text()) as {
          width?: number
          height?: number
          cells?: unknown[]
          cell_of?: unknown[]
        }
        if (!data.width || !data.height || !Array.isArray(data.cells) || !Array.isArray(data.cell_of)) {
          throw new Error('不是 OC Studio mapwright JSON：缺少 width/height/cells/cell_of')
        }
        setMapId(undefined)
        setMapName(file.name.replace(/\.json$/i, ''))
        setAnnotations([])
        setSelectedStateId(null)
        setSelectedRoadId(null)
        setPolitical(null)
        setPaintBlob(null)
        setPaintVersion((version) => version + 1)
        setAcceptedAt(null)
        engine.importMapwright(data as MapwrightData, normalizeMapParams(params))
      } catch (cause) {
        window.alert(cause instanceof Error ? cause.message : 'mapwright JSON 导入失败')
      }
    },
    [engine, params],
  )

  const handleExportMap = useCallback(
    async (format: 'png' | 'jpg' | 'ocmap') => {
      const record = await saveCurrentMap()
      if (!record) return
      try {
        if (format === 'ocmap') await downloadOcmap(record)
        else await downloadMapImage(record, format)
      } catch (error) {
        window.alert(error instanceof Error ? error.message : '导出失败')
      }
    },
    [saveCurrentMap],
  )

  useEffect(() => {
    if (mapId === undefined || !engine.meta) return
    const timer = window.setTimeout(() => {
      void saveMapAnnotations(mapId, annotations)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [annotations, engine.meta, mapId])

  useEffect(() => {
    if (mapId === undefined || params.kind !== 'world') {
      setRegionOverlays([])
      return
    }
    let cancelled = false
    const urls: string[] = []
    void getRegionChildren(mapId).then((children) => {
      if (cancelled) return
      const overlays: RegionOverlay[] = []
      for (const child of children) {
        if (child.id === undefined || !child.imageBlob || !child.placement) continue
        const url = URL.createObjectURL(child.imageBlob)
        urls.push(url)
        overlays.push({
          id: child.id,
          name: child.name,
          url,
          placement: child.placement,
        })
      }
      setRegionOverlays(overlays)
    })
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [mapId, params.kind, regionRevision])

  const handleRegionPlacementChange = useCallback(
    (id: number, placement: { x: number; y: number; width: number; height: number }) => {
      if (mapId === undefined) return
      setRegionOverlays((current) =>
        current.map((overlay) => (overlay.id === id ? { ...overlay, placement } : overlay)),
      )
      void updateRegionPlacement(id, mapId, placement)
    },
    [mapId],
  )

  const archiveUnsavedMap = useCallback(async () => {
    if (mapId !== undefined || !engine.meta) return
    const image = engine.image
    const imageBlob = image ? await composeMapBlob(image, political) : undefined
    const record = await saveGeneratedMap({
      name: mapName.trim() || '未命名地图',
      seed: engine.meta.seed,
      params: engine.meta.params,
      meta: engine.meta,
      annotations,
      thumbnail: image ? makeMapThumbnail(image) ?? undefined : undefined,
      imageBlob: imageBlob ?? undefined,
      paintBlob,
      political: political ?? undefined,
    })
    if (record.id !== undefined) await moveMapToTrash(record.id)
  }, [annotations, engine.image, engine.meta, mapId, mapName, paintBlob, political])

  const generateWithParams = useCallback(
    (nextParams: WorldMapParams, seed = parseSeed(seedText)) => {
      setSeedText(formatSeed(seed))
      // 新地形是一张新地图：不继承旧地图的标注/国家/道路，也不覆盖旧记录。
      setMapId(undefined)
      setAnnotations([])
      setSelectedStateId(null)
      setSelectedRoadId(null)
      setPolitical(null)
      void archiveUnsavedMap()
      setPaintBlob(null)
      setPaintVersion((version) => version + 1)
      setAcceptedAt(null)
      setShowPresetChooser(false)
      engine.generate(seed, normalizeMapParams(nextParams))
    },
    [archiveUnsavedMap, engine, seedText],
  )

  const handleGenerate = useCallback(() => {
    generateWithParams(params)
  }, [generateWithParams, params])

  const chooseTerrainPreset = useCallback(
    (preset: (typeof TERRAIN_PRESETS)[number]) => {
      const nextParams: WorldMapParams =
        preset.id === 'custom'
          ? { ...params, terrainPreset: 'custom' }
          : {
              ...params,
              terrainPreset: preset.id,
              landCoverage: preset.landCoverage,
              mountainStrength: preset.mountainStrength,
              plateauStrength: preset.plateauStrength,
              plainBias: preset.plainBias,
            }
      setParams(nextParams)
      setShowPresetChooser(false)
      if (preset.id === 'custom') return
      generateWithParams(nextParams)
    },
    [generateWithParams, params],
  )

  const handleHighResolution = useCallback(() => {
    if (params.kind !== 'world' || params.width >= 3072) return
    const width = 3072
    const height = 1536
    const nextParams = normalizeMapParams({ ...params, width, height })
    const scaleX = width / params.width
    const scaleY = height / params.height
    setParams(nextParams)
    setAnnotations((current) =>
      current.map((annotation) => ({
        ...annotation,
        points: annotation.points.map((point) => ({
          x: Math.round(point.x * scaleX),
          y: Math.round(point.y * scaleY),
        })),
      })),
    )
    setSeedText(formatSeed(parseSeed(seedText)))
    engine.generate(parseSeed(seedText), nextParams)
  }, [engine, params, seedText])

  const handleRandom = useCallback(() => {
    const seed = randomSeed()
    setSeedText(formatSeed(seed))
    setMapId(undefined)
    setAnnotations([])
    setSelectedStateId(null)
    setSelectedRoadId(null)
    setPolitical(null)
    void archiveUnsavedMap()
    setPaintBlob(null)
    setPaintVersion((version) => version + 1)
    setAcceptedAt(null)
    setShowPresetChooser(false)
    engine.generate(seed, normalizeMapParams(params))
  }, [archiveUnsavedMap, engine, params])

  const handleLoadMap = useCallback((id: number) => {
    const record = mapList.find((item) => item.id === id)
    if (!record || record.id === undefined) return
    const nextParams = normalizeMapParams(record.params)
    setMapId(record.id)
        setShowPresetChooser(false)
    setMapName(record.name)
    setSeedText(formatSeed(record.seed))
    setParams(nextParams)
    setAnnotations(record.annotations ?? [])
    setPaintBlob(record.paintBlob ?? null)
    setPaintVersion((version) => version + 1)
    setPolitical((record.political as PoliticalData | undefined) ?? null)
    setAcceptedAt(record.acceptedAt ?? null)
    setSelectedStateId(null)
    setActiveMapId(record.id)
    engine.generate(record.seed, nextParams)
  }, [engine, mapList])

  const handleNewMap = useCallback(() => {
    const seed = randomSeed()
    void archiveUnsavedMap()
    setMapId(undefined)
    setMapName('新世界')
    setSeedText(formatSeed(seed))
    setParams({ ...DEFAULT_MAP_PARAMS })
    setAnnotations([])
    setPaintBlob(null)
    setPaintVersion((version) => version + 1)
    setPolitical(null)
    setAcceptedAt(null)
    setSelectedStateId(null)
    engine.generate(seed, normalizeMapParams(DEFAULT_MAP_PARAMS))
  }, [archiveUnsavedMap, engine])

  useEffect(() => {
    const handleNew = (): void => {
      const seed = randomSeed()
      void archiveUnsavedMap()
      setMapId(undefined)
      setMapName('新世界')
      setSeedText(formatSeed(seed))
      setParams({ ...DEFAULT_MAP_PARAMS })
      setAnnotations([])
      setPaintBlob(null)
      setPaintVersion((version) => version + 1)
      setPolitical(null)
      setAcceptedAt(null)
      setSelectedStateId(null)
      engine.generate(seed, normalizeMapParams(DEFAULT_MAP_PARAMS))
    }
    window.addEventListener('oc-new-map', handleNew)
    return () => window.removeEventListener('oc-new-map', handleNew)
  }, [archiveUnsavedMap, engine])

  const dirty = useMemo(() => {
    if (!engine.meta) return true
    return (
      engine.meta.seed !== parseSeed(seedText) ||
      JSON.stringify(engine.meta.params) !== JSON.stringify(params)
    )
  }, [engine.meta, params, seedText])

  const profilePoints = useMemo(() => {
    if (!engine.layers || engine.view !== 'profile') return []
    return sampleProfile(engine.layers, line)
  }, [engine.layers, engine.view, line])

  const profileDistance = useMemo(() => (profilePoints.length > 0 ? profilePoints[profilePoints.length - 1].distanceKm : lineLengthKm(line)), [profilePoints, line])
  const extremes = useMemo(() => profileExtremes(profilePoints), [profilePoints])
  const generating = engine.status === 'generating'

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <header className="flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-line px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-paper-card text-ink-muted">
            <Mountain size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold text-ink">世界地图</h1>
            <p className="truncate text-[10px] text-ink-faint">
              程序化地形 · 水文 · 气候 · 完全本地生成
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editorMode ? (
            <button
              onClick={onCloseEditor}
              className="flex h-8 items-center gap-1 rounded border border-line px-2.5 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
            >
              <ChevronLeft size={12} strokeWidth={2} />
              返回地图库
            </button>
          ) : null}
          <div className={`${editorMode ? 'hidden' : 'hidden sm:flex'} items-center gap-1.5 rounded border border-line bg-paper-alt px-2 py-1`}>
            <span className="text-[10px] text-ink-faint">SEED</span>
            <input
              value={seedText}
              onChange={(event) => setSeedText(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleGenerate()
              }}
              spellCheck={false}
              className="w-[86px] bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-faint"
              aria-label="地图种子"
            />
          </div>
          <button
            onClick={handleRandom}
            disabled={generating}
            title="随机种子"
            className={`${editorMode ? 'hidden' : 'flex'} h-8 w-8 items-center justify-center rounded border border-line text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-40`}
          >
            <Dices size={15} strokeWidth={2} />
          </button>
          <input
            ref={mapwrightInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void handleMapwrightFile(event)}
          />
          <button
            onClick={() => mapwrightInputRef.current?.click()}
            className={`${editorMode ? 'hidden' : 'flex'} h-8 items-center gap-1 rounded border border-line px-2.5 text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink`}
            title="导入本地 mapwright JSON（由 tools/mapwright_server.py 生成）"
          >
            <Upload size={12} strokeWidth={2} />
            mapwright
          </button>
          <button
            onClick={handleGeneratePolitical}
            disabled={!engine.meta || !engine.layers}
            className="hidden h-8 items-center gap-1 rounded border border-line px-2.5 text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-40"
            title="根据当前地形生成国家、城市和国界；生成后可在政治面板编辑"
          >
            <Flag size={12} strokeWidth={2} />
            生成国家
          </button>
          <button
            onClick={handleSaveNow}
            disabled={saving || !engine.meta}
            className="flex h-8 items-center gap-1 rounded border border-line px-2.5 text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50"
            title="保存到地图资产库"
          >
            {saving ? '保存中' : '保存'}
          </button>
          {params.kind === 'world' && params.width < 3072 ? (
            <button
              onClick={handleHighResolution}
              disabled={generating}
              className={`${editorMode ? 'hidden' : 'flex'} h-8 items-center rounded border border-line px-2.5 text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-50`}
              title="保持 seed，将世界地图重建为 3072×1536"
            >
              高清重建
            </button>
          ) : null}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className={`${editorMode ? 'hidden' : 'flex'} h-8 items-center gap-1.5 rounded border border-line-hover bg-paper-card px-3 text-xs text-ink transition-colors hover:bg-paper-alt disabled:opacity-50`}
          >
            {generating ? (
              <RefreshCw size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <RefreshCw size={14} strokeWidth={2} />
            )}
            {generating ? '生成中' : dirty ? '按当前参数生成' : '重新生成'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={
            leftOpen
              ? 'hidden w-[272px] shrink-0 flex-col border-r border-line bg-paper-alt lg:flex'
              : 'hidden'
          }
        >
          <div className="border-b border-line p-4">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">地图库</p>
            <select
              value={mapId ?? ''}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value)) handleLoadMap(value)
              }}
              className="h-8 w-full rounded border border-line bg-paper px-2 text-xs text-ink outline-none focus:border-line-hover"
            >
              {mapId === undefined ? <option value="">未保存的地图</option> : null}
              {mapList.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name} · {formatSeed(record.seed)}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-2">
              <input
                value={mapName}
                onChange={(event) => setMapName(event.target.value)}
                placeholder="地图名称"
                className="h-8 min-w-0 flex-1 rounded border border-line bg-paper px-2 text-xs text-ink outline-none focus:border-line-hover"
              />
              <button
                onClick={handleNewMap}
                className="h-8 shrink-0 rounded border border-line px-2 text-[11px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
              >
                新建
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">生成参数</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPresetChooser(true)}
                  className="text-[9px] text-ink-faint hover:text-ink"
                  title="重新选择地球型、盘古、三大洲等世界形态"
                >
                  世界形态
                </button>
                <span className="font-mono text-[10px] text-ink-faint">
                  {params.width}×{params.height}
                </span>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-1 rounded border border-line bg-paper/60 p-1">
              <button
                onClick={() => {
                  if (params.kind === 'world') return
                  setParams({ ...DEFAULT_MAP_PARAMS })
                }}
                disabled={generating}
                className={`h-7 rounded text-[11px] transition-colors ${
                  params.kind === 'world' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                世界地图
              </button>
              <button
                onClick={() => {
                  if (params.kind === 'region') return
                  setParams({ ...DEFAULT_REGION_PARAMS })
                }}
                disabled={generating}
                className={`h-7 rounded text-[11px] transition-colors ${
                  params.kind === 'region' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                区域地图
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-ink-faint">宽度</span>
                <input
                  type="number"
                  min={MAP_MIN_SIZE}
                  max={MAP_MAX_SIZE}
                  step={64}
                  value={params.width}
                  disabled={generating}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) return
                    setParams((prev) => ({
                      ...prev,
                      width: Math.max(MAP_MIN_SIZE, Math.min(MAP_MAX_SIZE, Math.round(value))),
                    }))
                  }}
                  className="h-8 rounded border border-line bg-paper px-2 font-mono text-xs text-ink outline-none focus:border-line-hover"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-ink-faint">高度</span>
                <input
                  type="number"
                  min={MAP_MIN_SIZE}
                  max={MAP_MAX_SIZE}
                  step={64}
                  value={params.height}
                  disabled={generating}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) return
                    setParams((prev) => ({
                      ...prev,
                      height: Math.max(MAP_MIN_SIZE, Math.min(MAP_MAX_SIZE, Math.round(value))),
                    }))
                  }}
                  className="h-8 rounded border border-line bg-paper px-2 font-mono text-xs text-ink outline-none focus:border-line-hover"
                />
              </label>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-[10px] text-ink-faint">大陆形态</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {TERRAIN_PRESETS.map((preset) => {
                    const active = (params.terrainPreset ?? 'earth') === preset.id
                    return (
                      <button
                        key={preset.id}
                        onClick={() =>
                          setParams((prev) => ({
                            ...prev,
                            terrainPreset: preset.id,
                            landCoverage: preset.landCoverage,
                          }))
                        }
                        className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                          active
                            ? 'border-ink bg-paper-card text-ink'
                            : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                        }`}
                        title={preset.description}
                      >
                        <span className="block text-[10px]">{preset.label}</span>
                        <span className="block text-[9px] text-ink-faint">{preset.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <SliderRow
                label="陆地覆盖"
                value={params.landCoverage}
                min={0.08}
                max={0.62}
                step={0.01}
                display={`${Math.round(params.landCoverage * 100)}%`}
                onChange={(value) => setParams((prev) => ({ ...prev, landCoverage: value }))}
                disabled={generating}
              />
              <SliderRow
                label="山脉强度"
                value={params.mountainStrength}
                min={0}
                max={1}
                step={0.01}
                display={`${Math.round(params.mountainStrength * 100)}%`}
                onChange={(value) => setParams((prev) => ({ ...prev, mountainStrength: value }))}
                disabled={generating}
              />
              <SliderRow
                label="高原强度"
                value={params.plateauStrength}
                min={0}
                max={1}
                step={0.01}
                display={`${Math.round(params.plateauStrength * 100)}%`}
                onChange={(value) => setParams((prev) => ({ ...prev, plateauStrength: value }))}
                disabled={generating}
              />
              <SliderRow
                label="平原偏置"
                value={params.plainBias}
                min={-1}
                max={1}
                step={0.05}
                display={`${Math.round(params.plainBias * 100)}%`}
                hint="提高平原占比，降低低地起伏；负值增加丘陵与破碎地形。"
                onChange={(value) => setParams((prev) => ({ ...prev, plainBias: value }))}
                disabled={generating}
              />
              <SliderRow
                label="温度偏移"
                value={params.temperatureOffset}
                min={-6}
                max={6}
                step={0.5}
                display={`${params.temperatureOffset > 0 ? '+' : ''}${params.temperatureOffset.toFixed(1)}°C`}
                onChange={(value) => setParams((prev) => ({ ...prev, temperatureOffset: value }))}
                disabled={generating}
              />
              <SliderRow
                label="降水偏置"
                value={params.moistureBias}
                min={-1}
                max={1}
                step={0.05}
                display={`${params.moistureBias > 0 ? '+' : ''}${Math.round(params.moistureBias * 100)}%`}
                onChange={(value) => setParams((prev) => ({ ...prev, moistureBias: value }))}
                disabled={generating}
              />
              <SliderRow
                label="河流密度"
                value={params.riverDensity}
                min={0.1}
                max={0.9}
                step={0.01}
                display={`${Math.round(params.riverDensity * 100)}%`}
                onChange={(value) => setParams((prev) => ({ ...prev, riverDensity: value }))}
                disabled={generating}
              />
              <SliderRow
                label="等高线间隔"
                value={engine.contourInterval}
                min={50}
                max={500}
                step={50}
                display={`${engine.contourInterval}m`}
                onChange={engine.setContourInterval}
                disabled={!engine.meta}
              />
              <SliderRow
                label="纬度跨度"
                value={params.latitudeSpan}
                min={100}
                max={170}
                step={5}
                display={`${params.latitudeSpan}°`}
                hint="控制从极地到赤道的温差；越大，冰雪与热带雨林越极端。"
                onChange={(value) => setParams((prev) => ({ ...prev, latitudeSpan: value }))}
                disabled={generating}
              />
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-ink-faint">湖泊配置</p>
              <div className="flex flex-col gap-4">
                <SliderRow
                  label="湖泊密度"
                  value={params.lakeDensity}
                  min={0}
                  max={1}
                  step={0.01}
                  display={`${Math.round(params.lakeDensity * 100)}%`}
                  onChange={(value) => setParams((prev) => ({ ...prev, lakeDensity: value }))}
                  disabled={generating}
                />
                <SliderRow
                  label="最小面积"
                  value={params.lakeMinArea}
                  min={0.00005}
                  max={0.0015}
                  step={0.00005}
                  display={`${(params.lakeMinArea * 100).toFixed(3)}%`}
                  onChange={(value) => setParams((prev) => ({ ...prev, lakeMinArea: value }))}
                  disabled={generating}
                />
                <SliderRow
                  label="最大面积"
                  value={params.lakeMaxArea}
                  min={0.0005}
                  max={0.03}
                  step={0.0005}
                  display={`${(params.lakeMaxArea * 100).toFixed(1)}%`}
                  onChange={(value) => setParams((prev) => ({ ...prev, lakeMaxArea: value }))}
                  disabled={generating}
                />
              </div>
            </div>

            <div className="mt-5 rounded border border-line bg-paper/60 p-3">
              <p className="flex items-center gap-1.5 text-[11px] text-ink">
                <Lock size={12} strokeWidth={2} className="text-ink-faint" />
                本地确定性生成
              </p>
              <p className="mt-1.5 text-[10px] leading-4 text-ink-muted">
                相同的 seed 与参数会生成完全相同的地图。参数与种子写入 IndexedDB，并可在全局备份中导出。
              </p>
            </div>

            <button
              onClick={() => setAlgorithmOpen(true)}
              className="mt-3 flex w-full items-center gap-1.5 rounded border border-line px-2.5 py-2 text-left text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink"
            >
              <Info size={12} strokeWidth={2} />
              算法与离线说明
            </button>
          </div>

          <div className="border-t border-line p-4">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-ink-faint">
                {saving ? '保存中…' : savedAt ? '已保存到本地' : '尚未保存'}
              </span>
              <span className="font-mono text-ink-faint">
                {engine.meta ? formatSeed(engine.meta.seed) : formatSeed(parseSeed(seedText))}
              </span>
            </div>
            <div
              className="mt-2 grid gap-1"
              style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
            >
              {(['png', 'jpg', 'ocmap'] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => void handleExportMap(format)}
                  disabled={!engine.meta || saving}
                  className="h-7 rounded border border-line text-[10px] text-ink-muted transition-colors hover:border-line-hover hover:text-ink disabled:opacity-40"
                  title={format === 'ocmap' ? '导出 .ocmap 资产' : `导出 ${format.toUpperCase()}`}
                >
                  {format === 'ocmap' ? '.ocmap' : format.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-ink-muted transition-[width] duration-300"
                style={{ width: `${Math.round((engine.progress.value || 0) * 100)}%` }}
              />
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2">
            <button
              onClick={() => setLeftOpen((value) => !value)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-paper-card hover:text-ink"
              title={leftOpen ? '收起左侧参数栏' : '展开左侧参数栏'}
            >
              <ChevronLeft size={13} strokeWidth={2} />
            </button>
            {VIEWS.filter((item) => editorMode || item.id !== 'political').map((item) => {
              const active = engine.view === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => engine.selectView(item.id)}
                  disabled={engine.status === 'generating' || !engine.meta}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-[11px] transition-colors disabled:opacity-40 ${
                    active
                      ? 'bg-paper-card text-ink'
                      : 'text-ink-muted hover:bg-paper-card hover:text-ink'
                  }`}
                >
                  <item.icon size={13} strokeWidth={2} />
                  {item.label}
                </button>
              )
            })}
            {engine.view === 'contour' ? (
              <button
                onClick={() => setShowContourWater((value) => !value)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-[11px] transition-colors ${
                  showContourWater
                    ? 'bg-[#A9C4C9]/35 text-ink'
                    : 'text-ink-muted hover:bg-paper-card hover:text-ink'
                }`}
                title="在等高线上显示或隐藏河流湖泊"
              >
                水系
              </button>
            ) : null}
            <div className="flex-1" />
            <button
              onClick={() => setRightOpen((value) => !value)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-paper-card hover:text-ink"
              title={rightOpen ? '收起右侧图例' : '展开右侧图例'}
            >
              <ChevronRight size={13} strokeWidth={2} />
            </button>
            {engine.meta ? (
              <span className="hidden shrink-0 items-center gap-1 pr-2 text-[10px] text-ink-faint md:flex">
                <Lock size={11} strokeWidth={2} />
                零在线瓦片
              </span>
            ) : null}
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <MapCanvas
              image={engine.image}
              view={engine.view}
              line={line}
              onLineChange={setLine}
              annotations={editorMode ? annotations : []}
              onAddAnnotation={(annotation) => setAnnotations((current) => [...current, annotation])}
              onDeleteAnnotation={(id) =>
                setAnnotations((current) => current.filter((annotation) => annotation.id !== id))
              }
              paintBlob={paintBlob}
              onPaintChange={handlePaintChange}
              political={political}
              politicalVisible={false}
              selectedStateId={selectedStateId}
              annotationCountry={annotationCountry}
              politicalEditStateId={politicalEditMode ? selectedStateId : null}
              onPoliticalAssign={handlePoliticalAssign}
              onCountryDrop={handleCountryDrop}
              onWorldEntryDrop={handleWorldEntryDrop}
              roadEditMode={roadMode || roadAppendMode}
              onRoadPoint={handleRoadPoint}
              annotationRoadColor={roadColor}
              showContourWater={showContourWater}
              roadNodeEditRoadId={roadNodeEditRoadId}
              onRoadNodeMove={handleRoadNodeMove}
              cityMoveMode={movingCityId !== null}
              onCityMove={handleCityMove}
              regionOverlays={editorMode ? regionOverlays : []}
              onRegionPlacementChange={handleRegionPlacementChange}
              vectors={engine.vectors}
            />

            {!generating && !editorMode && showPresetChooser ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/80 p-6 backdrop-blur-sm">
                <div className="w-[560px] max-w-full rounded-xl border border-line bg-paper/95 p-5 shadow-xl">
                  <h2 className="font-serif text-lg text-ink">选择世界形态</h2>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    先选大陆分布，再生成。之后仍可以在左侧调整参数并重新生成。
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {TERRAIN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => chooseTerrainPreset(preset)}
                        className="rounded-xl border border-line p-3 text-left text-ink-muted transition-colors hover:border-line-hover hover:bg-paper-card hover:text-ink"
                      >
                        <span className="block text-sm text-ink">{preset.label}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-ink-faint">
                          {preset.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {!engine.meta && !generating && !showPresetChooser && !editorMode ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="rounded-xl border border-line bg-paper/95 px-4 py-3 text-center shadow-sm">
                  <p className="text-xs text-ink">先设置参数，再生成第一张地图</p>
                  <p className="mt-1 text-[10px] text-ink-faint">
                    生成不会自动保存；满意后再点“保存”。
                  </p>
                  <button
                    onClick={handleGenerate}
                    className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                  >
                    按当前参数生成
                  </button>
                </div>
              </div>
            ) : null}

            {!engine.meta && !generating && editorMode ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="rounded-xl border border-line bg-paper/95 px-4 py-3 text-center shadow-sm">
                  <p className="text-xs text-ink">还没有打开地图</p>
                  <button
                    onClick={onCloseEditor}
                    className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                  >
                    返回地图库
                  </button>
                </div>
              </div>
            ) : null}

            {editorMode && engine.view === 'political' && political ? (
              <div className="hidden absolute right-3 top-3 z-20 max-h-[calc(100%-24px)] w-[228px] overflow-y-auto rounded border border-line bg-paper/95 p-3 text-xs shadow-lg backdrop-blur">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-ink">政治地图</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={undoPolitical}
                      className="text-[10px] text-ink-faint hover:text-ink"
                      title="撤销"
                    >
                      撤销
                    </button>
                    <button
                      onClick={redoPolitical}
                      className="text-[10px] text-ink-faint hover:text-ink"
                      title="重做"
                    >
                      重做
                    </button>
                    <button
                      onClick={handleGeneratePolitical}
                      className="text-[10px] text-ink-faint hover:text-ink"
                    >
                      重新生成
                    </button>
                  </div>
                </div>
                {countries.length > 0 ? (
                  <div className="mb-2">
                    <div className="mb-1 text-[10px] text-ink-faint">拖拽设定集国家到地图上建国</div>
                    <div className="flex flex-wrap gap-1">
                      {countries.map((country) => (
                        <button
                          key={country.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/x-oc-country', String(country.id))
                            event.dataTransfer.setData('text/plain', String(country.id))
                            event.dataTransfer.effectAllowed = 'copy'
                          }}
                          className="cursor-grab rounded border border-line bg-paper-card px-1.5 py-0.5 text-[10px] text-ink-muted active:cursor-grabbing"
                          title="拖到地图上"
                        >
                          {country.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {entries.length > 0 ? (
                  <div className="mb-2">
                    <div className="mb-1 text-[10px] text-ink-faint">拖拽设定集地点/城市到地图</div>
                    <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                      {entries.slice(0, 40).map((entry) => (
                        <button
                          key={entry.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/x-oc-world', String(entry.id))
                            event.dataTransfer.setData('text/plain', String(entry.id))
                            event.dataTransfer.effectAllowed = 'copy'
                          }}
                          className="cursor-grab rounded border border-line bg-paper-card px-1.5 py-0.5 text-[10px] text-ink-muted active:cursor-grabbing"
                          title={entry.category || '地点'}
                        >
                          {entry.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mb-2 space-y-1">
                  {political.states.map((state) => (
                    <button
                      key={state.id}
                      onClick={() => setSelectedStateId(state.id)}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left ${
                        selectedStateId === state.id ? 'bg-paper-card text-ink' : 'text-ink-muted hover:bg-paper-card'
                      }`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: state.color }} />
                      <span className="truncate">{state.name}</span>
                      <span className="ml-auto text-[9px] text-ink-faint">
                        {political.cities.filter((city) => city.stateId === state.id).length}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedState ? (
                  <>
                    <div className="mb-2 flex items-center gap-1.5">
                      <input
                        type="color"
                        value={selectedState.color}
                        onChange={(event) => {
                          const color = event.target.value
                          updatePolitical({
                            ...political,
                            states: political.states.map((state) =>
                              state.id === selectedState.id ? { ...state, color } : state,
                            ),
                          })
                        }}
                        className="h-7 w-7 rounded border border-line bg-transparent p-0"
                      />
                      <input
                        value={selectedState.name}
                        onChange={(event) => {
                          const name = event.target.value
                          updatePolitical({
                            ...political,
                            states: political.states.map((state) =>
                              state.id === selectedState.id ? { ...state, name } : state,
                            ),
                          })
                        }}
                        className="h-7 min-w-0 flex-1 rounded border border-line bg-paper-card px-2 text-xs text-ink outline-none focus:border-line-hover"
                      />
                    </div>
                    <select
                      value={selectedState.countryId ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value
                        const countryId = raw ? Number(raw) : undefined
                        updatePolitical({
                          ...political,
                          states: political.states.map((state) =>
                            state.id === selectedState.id ? { ...state, countryId } : state,
                          ),
                        })
                      }}
                      className="mb-2 h-7 w-full rounded border border-line bg-paper-card px-2 text-[10px] text-ink outline-none focus:border-line-hover"
                    >
                      <option value="">未关联 OC 国家</option>
                      {countries.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleSyncCountries()}
                      className="mb-2 w-full rounded border border-line py-1 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                    >
                      未关联国家写入 OC 国家库
                    </button>
                    <button
                      onClick={() => setPoliticalEditMode((value) => !value)}
                      className={`mb-2 w-full rounded border py-1 text-[10px] ${
                        politicalEditMode
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                      }`}
                    >
                      {politicalEditMode ? '结束国界绘制' : '国界画笔：把地块并入该国家'}
                    </button>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-ink-faint">
                      <span>道路</span>
                      <span>{roadMode ? `点击地图加点（${roadDraft.length}）` : ''}</span>
                    </div>
                    <div className="mb-2 flex gap-1">
                      <button
                        onClick={() => {
                          if (roadMode) {
                            finishRoad()
                          } else {
                            setPoliticalEditMode(false)
                            setRoadDraft([])
                            setRoadMode(true)
                          }
                        }}
                        className={`h-7 flex-1 rounded border text-[10px] ${
                          roadMode
                            ? 'border-ink bg-ink text-paper'
                            : 'border-line text-ink-muted hover:border-line-hover hover:text-ink'
                        }`}
                      >
                        {roadMode ? '完成道路' : '绘制道路'}
                      </button>
                      {roadMode ? (
                        <button
                          onClick={() => {
                            setRoadMode(false)
                            setRoadDraft([])
                          }}
                          className="h-7 rounded border border-line px-2 text-[10px] text-ink-faint hover:text-ink"
                        >
                          取消
                        </button>
                      ) : null}
                    </div>
                    {(political.roads ?? []).length > 0 ? (
                      <div className="mb-2 max-h-20 space-y-0.5 overflow-y-auto">
                        {(political.roads ?? []).map((road) => (
                          <div
                            key={road.id}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${
                              selectedRoadId === road.id
                                ? 'bg-paper-card text-ink'
                                : 'text-ink-muted hover:bg-paper-card'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setSelectedRoadId(road.id)
                                setRoadAppendMode(false)
                              }}
                              className="min-w-0 flex-1 truncate text-left"
                            >
                              道路 #{road.id} · {road.points.length} 点
                            </button>
                            {selectedRoadId === road.id ? (
                              <>
                                <button
                                  onClick={() => setRoadAppendMode((value) => !value)}
                                  className={`rounded px-1 ${roadAppendMode ? 'bg-ink text-paper' : 'hover:text-ink'}`}
                                  title="添加道路节点"
                                >
                                  +点
                                </button>
                                <button
                                  onClick={() =>
                                    setRoadNodeEditRoadId((current) =>
                                      current === road.id ? null : road.id,
                                    )
                                  }
                                  className={`rounded px-1 ${roadNodeEditRoadId === road.id ? 'bg-ink text-paper' : 'hover:text-ink'}`}
                                  title="拖动道路节点"
                                >
                                  节点
                                </button>
                                <button
                                  onClick={() =>
                                    updatePolitical({
                                      ...political,
                                      roads: (political.roads ?? []).map((item) =>
                                        item.id === road.id && item.points.length > 1
                                          ? { ...item, points: item.points.slice(0, -1) }
                                          : item,
                                      ),
                                    })
                                  }
                                  className="rounded px-1 hover:text-ink"
                                  title="删除最后一个节点"
                                >
                                  -点
                                </button>
                                <button
                                  onClick={() => {
                                    updatePolitical({
                                      ...political,
                                      roads: (political.roads ?? []).filter((item) => item.id !== road.id),
                                    })
                                    setSelectedRoadId(null)
                                    setRoadAppendMode(false)
                                  }}
                                  className="px-1 hover:text-error"
                                  title="删除道路"
                                >
                                  ✕
                                </button>
                              </>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <button
                      onClick={handleAutoPlaceCities}
                      className="mb-2 w-full rounded border border-line py-1 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                    >
                      用设定集城市名自动安置
                    </button>
                    <div className="mb-1 text-[10px] text-ink-faint">下属城市</div>
                    <div className="space-y-1">
                      {political.cities
                        .filter((city) => city.stateId === selectedState.id)
                        .map((city) => (
                          <div key={city.id} className="flex items-center gap-1">
                            <input
                              value={city.name}
                              onChange={(event) => {
                                const name = event.target.value
                                updatePolitical({
                                  ...political,
                                  cities: political.cities.map((item) =>
                                    item.id === city.id ? { ...item, name } : item,
                                  ),
                                })
                              }}
                              className="h-7 min-w-0 flex-1 rounded border border-line bg-paper-card px-2 text-[11px] text-ink outline-none focus:border-line-hover"
                            />
                            <button
                              onClick={() =>
                                setMovingCityId((current) => (current === city.id ? null : city.id))
                              }
                              className={`rounded px-1 text-[10px] ${
                                movingCityId === city.id ? 'bg-ink text-paper' : 'text-ink-faint hover:text-ink'
                              }`}
                              title="点击地图移动该城市"
                            >
                              移
                            </button>
                            {!city.capital ? (
                              <button
                                onClick={() =>
                                  updatePolitical({
                                    ...political,
                                    cities: political.cities.filter((item) => item.id !== city.id),
                                  })
                                }
                                className="px-1 text-[10px] text-ink-faint hover:text-error"
                                title="删除城市"
                              >
                                ✕
                              </button>
                            ) : (
                              <span className="px-1 text-[9px] text-ink-faint">都城</span>
                            )}
                          </div>
                        ))}
                    </div>
                    <button
                      onClick={() => {
                        const nextId = Math.max(0, ...political.cities.map((city) => city.id)) + 1
                        updatePolitical({
                          ...political,
                          cities: [
                            ...political.cities,
                            {
                              id: nextId,
                              stateId: selectedState.id,
                              name: '新城',
                              x: Math.min(0.98, selectedState.capitalX + 0.03),
                              y: Math.min(0.98, selectedState.capitalY + 0.03),
                            },
                          ],
                        })
                      }}
                      className="mt-2 w-full rounded border border-line py-1 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                    >
                      添加城市
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {editorMode && engine.view === 'political' ? (
              <div className="absolute right-3 top-3 z-20 w-[248px] rounded border border-line bg-paper/95 p-3 text-xs shadow-lg backdrop-blur">
                <p className="mb-2 text-[10px] text-ink-faint">
                  选择国家后，在已保存地图上右键圈区域、画道路或放城市。国界由你画的国家区域边界组成。
                </p>
                <select
                  value={selectedCountryId ?? ''}
                  onChange={(event) => {
                    const id = event.target.value ? Number(event.target.value) : null
                    setSelectedCountryId(id)
                    const existing = annotations.find(
                      (annotation) =>
                        annotation.type === 'polygon' &&
                        annotation.linkedEntity?.type === 'country' &&
                        annotation.linkedEntity.id === id,
                    )
                    if (existing) {
                      setCountryColor(existing.color)
                    } else {
                      const palette = ['#B36651', '#5E8B74', '#8B7BA8', '#C49A4A', '#6A8FA8']
                      setCountryColor(palette[(id ?? 0) % palette.length])
                    }
                    const existingRoad = annotations.find(
                      (annotation) =>
                        annotation.type === 'road' &&
                        annotation.linkedEntity?.type === 'country' &&
                        annotation.linkedEntity.id === id,
                    )
                    if (existingRoad) setRoadColor(existingRoad.color)
                  }}
                  className="mb-2 h-8 w-full rounded border border-line bg-paper-card px-2 text-xs text-ink outline-none"
                >
                  <option value="">未选择国家（通用标注）</option>
                  {countries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
                <label className="mb-1 flex items-center justify-between text-[10px] text-ink-faint">
                  国家颜色
                  <input
                    type="color"
                    value={countryColor}
                    onChange={(event) => {
                      const color = event.target.value
                      setCountryColor(color)
                      if (selectedCountryId !== null) {
                        setAnnotations((current) =>
                          current.map((annotation) =>
                            annotation.type === 'polygon' &&
                            annotation.linkedEntity?.type === 'country' &&
                            annotation.linkedEntity.id === selectedCountryId
                              ? { ...annotation, color }
                              : annotation,
                          ),
                        )
                      }
                    }}
                    className="h-6 w-10 rounded border border-line bg-transparent p-0"
                  />
                </label>
                <label className="mb-2 flex items-center justify-between text-[10px] text-ink-faint">
                  道路颜色
                  <input
                    type="color"
                    value={roadColor}
                    onChange={(event) => {
                      const color = event.target.value
                      setRoadColor(color)
                      if (selectedCountryId !== null) {
                        setAnnotations((current) =>
                          current.map((annotation) =>
                            annotation.type === 'road' &&
                            annotation.linkedEntity?.type === 'country' &&
                            annotation.linkedEntity.id === selectedCountryId
                              ? { ...annotation, color }
                              : annotation,
                          ),
                        )
                      }
                    }}
                    className="h-6 w-10 rounded border border-line bg-transparent p-0"
                  />
                </label>
                <div className="space-y-1 text-[10px] text-ink-muted">
                  <p>右键地图 → 圈国家区域（多边形）</p>
                  <p>右键地图 → 画道路（折线）</p>
                  <p>右键地图 → 放置城市</p>
                  <p>右键已有标注 → 删除</p>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <span
                    className="h-3 w-3 rounded-full border border-line"
                    style={{ background: annotationCountry?.color ?? '#B36651' }}
                  />
                  <span className="text-[10px] text-ink-faint">
                    {annotationCountry ? annotationCountry.name : '通用颜色'}
                  </span>
                </div>
              </div>
            ) : null}

            {generating ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-paper/60 backdrop-blur-[2px]">
                <div className="w-[280px] rounded border border-line bg-paper px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} strokeWidth={2} className="animate-spin text-ink-muted" />
                    <span className="text-xs text-ink">{engine.progress.stage || '生成中'}</span>
                    <span className="ml-auto font-mono text-[10px] text-ink-faint">
                      {Math.round((engine.progress.value || 0) * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-ink-muted transition-[width] duration-300"
                      style={{ width: `${Math.max(4, Math.round((engine.progress.value || 0) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-ink-faint">
                    高程 → 水文 → 气候 → 生物群系，全部在 Web Worker 中计算
                  </p>
                </div>
              </div>
            ) : null}

            {engine.viewLoading ? (
              <div className="absolute right-4 top-3 z-10 flex items-center gap-1.5 rounded border border-line bg-paper/90 px-2 py-1 text-[10px] text-ink-muted backdrop-blur">
                <RefreshCw size={11} strokeWidth={2} className="animate-spin" />
                渲染图层
              </div>
            ) : null}

            {engine.error && !generating ? (
              <div className="absolute inset-x-0 top-4 z-10 mx-auto w-[320px] rounded border border-error/40 bg-paper px-3 py-2 text-center text-[11px] text-error">
                {engine.error}
                <button onClick={handleGenerate} className="ml-2 underline">
                  重试
                </button>
              </div>
            ) : null}
          </div>

          {engine.view === 'profile' ? (
            <div className="h-[238px] shrink-0 border-t border-line bg-paper-alt">
              <div className="flex h-8 items-center gap-3 px-3 text-[10px] text-ink-muted">
                <span className="font-medium text-ink">地形剖面</span>
                <span className="font-mono">{Math.round(profileDistance).toLocaleString()} km</span>
                <span className="font-mono">
                  最高 {Math.round(extremes.max).toLocaleString()} m
                </span>
                <span className="font-mono">
                  最低 {Math.round(extremes.min).toLocaleString()} m
                </span>
                <span className="hidden text-ink-faint md:inline">在地图上拖动可重画剖面线</span>
                <button
                  onClick={() => setLine(DEFAULT_PROFILE_LINE)}
                  className="ml-auto text-[10px] text-ink-faint underline decoration-line underline-offset-2 hover:text-ink"
                >
                  重置剖面线
                </button>
              </div>
              <div className="h-[206px] px-2 pb-2">
                <ProfileChart points={profilePoints} distanceKm={profileDistance} />
              </div>
            </div>
          ) : null}
        </section>

        <aside
          className={
            rightOpen
              ? 'hidden w-[236px] shrink-0 border-l border-line bg-paper-alt xl:flex xl:flex-col'
              : 'hidden'
          }
        >
          <MapLegend
            view={engine.view}
            stats={engine.meta?.stats ?? null}
            onOpenAlgorithm={() => setAlgorithmOpen(true)}
          />
        </aside>
      </div>

      <MapAlgorithmDialog open={algorithmOpen} onOpenChange={setAlgorithmOpen} />
    </div>
  )
}
