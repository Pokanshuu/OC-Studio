'use client'

/**
 * 地图视图（W3 画布）：把实体上的**归一化锚点**铺到平面上。
 *
 * 口径（`docs/地图.md`）：
 * - 地图是**视图**，不是实体；锚点存在实体上（`map_position`，0–1）
 * - 拖动锚点 = 改 `map_position`（落 frontmatter），不新建任何表
 * - 底图还没接 `.ocstudio/maps/`（那要文件扫描命令），先按 16:9 画布摆锚点
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { listAnchors, listMapAssets, setAnchor, type AnchorKind, type AnchorPoint, type MapAsset } from './services'
import { CENTER_STATE, FILTER_TRIGGER, ROUND_ITEM } from '@/lib/ui-tokens'
import { FilterSelect } from '@/components/shared/FilterSelect'

/** 画布按 16:9；归一化坐标与像素的换算只在这里 */
const CANVAS_ASPECT = 16 / 9

const KIND_LABELS: Record<AnchorKind, string> = {
  country: '国家',
  event: '事件',
  worldEntry: '词条',
}

export function MapView() {
  const [points, setPoints] = useState<AnchorPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [assets, setAssets] = useState<MapAsset[]>([])
  const [backgroundName, setBackgroundName] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const reload = useCallback(async () => {
    const groups = await listAnchors()
    const main = groups.get('') ?? []
    const others = [...groups.entries()].filter(([key]) => key !== '').flatMap(([, list]) => list)
    setPoints([...main, ...others])
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
    void listMapAssets().then((list) => {
      setAssets(list)
      setBackgroundName((current) => current ?? list[0]?.name ?? null)
    })
  }, [reload])

  const background = assets.find((asset) => asset.name === backgroundName) ?? null

  const updateFromPointer = useCallback(
    (kind: AnchorKind, id: number, clientX: number, clientY: number) => {
      const el = canvasRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height
      setPoints((prev) =>
        prev.map((point) =>
          point.kind === kind && point.id === id
            ? { ...point, anchor: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }
            : point,
        ),
      )
      void setAnchor(kind, id, { x, y })
    },
    [],
  )

  if (loading) return null

  if (points.length === 0) {
    return (
      <div className={CENTER_STATE}>
        <MapPin size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">还没有锚点</p>
        <p className="text-xs text-ink-faint">在实体里记录地图坐标后，这里会把它们铺开</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 px-6 pb-3 pt-4">
        <h1 className="text-lg font-serif font-bold tracking-[-0.01em] text-ink">地图</h1>
        <span className="text-xs text-ink-faint">{points.length} 个锚点</span>
        {assets.length > 1 ? (
          <div className="ml-auto">
            <FilterSelect
              value={backgroundName ?? ''}
              onChange={setBackgroundName}
              options={assets.map((asset) => ({ value: asset.name, label: asset.name }))}
              fallbackLabel="选择底图"
              triggerClassName={FILTER_TRIGGER}
              chevronSize={14}
            />
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        <div
          ref={canvasRef}
          className={`relative w-full overflow-hidden border border-line bg-paper ${ROUND_ITEM}`}
          style={{ aspectRatio: String(CANVAS_ASPECT) }}
          onPointerMove={(event) => {
            if (!dragId) return
            const [kind, id] = dragId.split(':')
            updateFromPointer(kind as AnchorKind, Number(id), event.clientX, event.clientY)
          }}
          onPointerUp={() => setDragId(null)}
          onPointerLeave={() => setDragId(null)}
        >
          {background ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background.url}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            />
          ) : null}

          {points.map((point) => {
            const key = `${point.kind}:${point.id}`
            return (
              <button
                key={key}
                type="button"
                title={`${KIND_LABELS[point.kind]}：${point.title}`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  setDragId(key)
                  updateFromPointer(point.kind, point.id, event.clientX, event.clientY)
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink transition-transform hover:scale-105 ${
                  dragId === key ? 'cursor-grabbing scale-105' : ''
                }`}
                style={{ left: `${point.anchor.x * 100}%`, top: `${point.anchor.y * 100}%` }}
              >
                {point.title}
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-ink-faint">
          拖动锚点即保存（写入实体的 <code>map_position</code>）；底图接入 `.ocstudio/maps/` 后同一套坐标直接生效
        </p>
      </div>
    </div>
  )
}
