'use client'

/**
 * 地图视图（W3）：**地图是实体（笔记）**，锚点挂在其它实体上。
 *
 * 数据口径：
 * - 一张地图 = 一条 `category: 地图` 的笔记，底图路径与像素尺寸存在它自己的 frontmatter
 *   （`map_image` / `map_width` / `map_height`）
 * - 实体锚点存 `map_position`（归一化 0–1）+ `map_id`（**地图名字**，因为 id 只在本次会话有效）
 * - 拖动锚点 = 写回实体，不新建任何表
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { ImageUploader } from '@/components/shared/ImageUploader'
import { FilterSelect } from '@/components/shared/FilterSelect'
import { BTN_PRIMARY, CENTER_STATE, FILTER_TRIGGER, ROUND_ITEM, SECTION_TITLE } from '@/lib/ui-tokens'
import { resolveImageUrl } from '@/lib/image-service'
import { notifyDataUpdated } from '@/lib/data-events'
import {
  createMap,
  listAnchors,
  listMaps,
  setAnchor,
  setMapBackground,
  type AnchorKind,
  type AnchorPoint,
  type MapEntity,
} from './services'

const CANVAS_ASPECT = 16 / 9

const KIND_LABELS: Record<AnchorKind, string> = {
  country: '国家',
  event: '事件',
  worldEntry: '词条',
}

export function MapView() {
  const [maps, setMaps] = useState<MapEntity[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [points, setPoints] = useState<AnchorPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const active = maps.find((map) => map.id === activeId) ?? maps[0] ?? null

  const reload = useCallback(async (keepId?: number | null) => {
    try {
      const [list, groups] = await Promise.all([listMaps(), listAnchors()])
      setMaps(list)
      setActiveId((current) => keepId ?? current ?? list[0]?.id ?? null)
      const all: AnchorPoint[] = []
      for (const [, items] of groups) all.push(...items)
      setPoints(all)
    } catch (err) {
      console.error('[map] 读取地图失败', err)
      setMaps([])
      setPoints([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const activeName = active?.name ?? ''

  /** 空 map_id 的锚点先都算在当前地图上；一旦拖动就归属到这张图 */
  const visible = points.filter((point) => point.mapId === '' || point.mapId === activeName)

  const handleCreate = async () => {
    const id = await createMap()
    await reload(id)
    notifyDataUpdated()
  }

  const handleBackground = async (path: string) => {
    if (!active) return
    // 先拿图片自然尺寸，存进笔记（导出 / 静态站要用）
    try {
      const image = new Image()
      image.src = resolveImageUrl(path, 'map')
      await new Promise<void>((resolve) => {
        image.onload = () => resolve()
        image.onerror = () => resolve()
      })
      await setMapBackground(active.id, path, { width: image.naturalWidth, height: image.naturalHeight })
    } catch {
      await setMapBackground(active.id, path)
    }
    await reload(active.id)
    notifyDataUpdated()
  }

  const updateFromPointer = useCallback(
    (kind: AnchorKind, id: number, clientX: number, clientY: number) => {
      const el = canvasRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      setPoints((prev) =>
        prev.map((point) =>
          point.kind === kind && point.id === id
            ? { ...point, anchor: { x, y }, mapId: activeName }
            : point,
        ),
      )
      void setAnchor(kind, id, { x, y }, activeName)
    },
    [activeName],
  )

  if (loading) return null

  if (maps.length === 0) {
    return (
      <div className={CENTER_STATE}>
        <MapPin size={20} strokeWidth={2} className="text-ink-faint" />
        <p className="text-sm text-ink-muted">还没有地图</p>
        <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
          <Plus size={14} strokeWidth={2} />
          新建地图
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 px-6 pb-3 pt-4">
        <h1 className={SECTION_TITLE}>地图</h1>
        <FilterSelect
          value={active?.id ?? 0}
          onChange={(id) => setActiveId(Number(id))}
          options={maps.map((map) => ({ value: map.id, label: map.name }))}
          fallbackLabel="选择地图"
          triggerClassName={FILTER_TRIGGER}
          chevronSize={14}
        />
        <span className="text-xs text-ink-faint">{visible.length} 个锚点</span>
        <div className="ml-auto flex items-center gap-2">
          <ImageUploader
            value={active?.image}
            aspectRatio="16:9"
            cropAspect={16 / 9}
            placeholderText="设置底图"
            size="sm"
            onChange={(path) => void handleBackground(path)}
            onRemove={() => {
              if (!active) return
              void setMapBackground(active.id, null).then(() => reload(active.id))
            }}
          />
          <button type="button" onClick={() => void handleCreate()} className={BTN_PRIMARY}>
            <Plus size={14} strokeWidth={2} />
            新建
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        <div
          ref={canvasRef}
          className={`relative w-full overflow-hidden border border-line bg-paper ${ROUND_ITEM}`}
          style={{ aspectRatio: active?.width && active?.height ? String(active.width / active.height) : String(CANVAS_ASPECT) }}
          onPointerMove={(event) => {
            if (!dragKey) return
            const [kind, id] = dragKey.split(':')
            updateFromPointer(kind as AnchorKind, Number(id), event.clientX, event.clientY)
          }}
          onPointerUp={() => setDragKey(null)}
          onPointerLeave={() => setDragKey(null)}
        >
          {active?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveImageUrl(active.image, 'map')}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            />
          ) : null}

          {visible.map((point) => {
            const key = `${point.kind}:${point.id}`
            return (
              <button
                key={key}
                type="button"
                title={`${KIND_LABELS[point.kind]}：${point.title}`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  setDragKey(key)
                  updateFromPointer(point.kind, point.id, event.clientX, event.clientY)
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink transition-transform hover:scale-105 ${
                  dragKey === key ? 'cursor-grabbing scale-105' : ''
                }`}
                style={{ left: `${point.anchor.x * 100}%`, top: `${point.anchor.y * 100}%` }}
              >
                {point.title}
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-xs text-ink-faint">拖动锚点即保存到实体的 map_position</p>
      </div>
    </div>
  )
}
