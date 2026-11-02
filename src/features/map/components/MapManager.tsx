'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, ExternalLink, FolderOpen, Map as MapIcon, RefreshCw, Star, Trash2, Upload } from 'lucide-react'
import type { WorldMapRecord } from '@/types'
import { db } from '@/lib/db'
import {
  deleteMap,
  getMapRecords,
  setActiveMapId,
  setMapLinkedEntities,
  setMapTemplate,
  renameMap,
  updateRegionPlacement,
} from '../services'
import { normalizeMapParams } from '../params'
import { downloadMapImage, downloadOcmap, importOcmapFile } from '../mapExport'

interface MapManagerProps {
  onOpenMap: () => void
  onEditMap: () => void
}

type Filter = 'all' | 'world' | 'region' | 'template'

function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function MapManager({ onOpenMap, onEditMap }: MapManagerProps) {
  const [maps, setMaps] = useState<WorldMapRecord[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [attachWorldId, setAttachWorldId] = useState<number | null>(null)
  const [entities, setEntities] = useState<Array<{ type: 'country' | 'character' | 'event'; id: number; name: string }>>([])
  const [linkValue, setLinkValue] = useState('')
  const [dialog, setDialog] = useState<{ mode: 'rename' | 'delete'; value: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setMaps(await getMapRecords())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    void Promise.all([db.countries.toArray(), db.characters.toArray(), db.events.toArray()]).then(
      ([countries, characters, events]) => {
        setEntities([
          ...countries.filter((item) => !item.deleted && item.id !== undefined).map((item) => ({
            type: 'country' as const,
            id: item.id as number,
            name: item.name,
          })),
          ...characters.filter((item) => !item.deleted && item.id !== undefined).map((item) => ({
            type: 'character' as const,
            id: item.id as number,
            name: item.name,
          })),
          ...events.filter((item) => !item.deleted && item.id !== undefined).map((item) => ({
            type: 'event' as const,
            id: item.id as number,
            name: item.title,
          })),
        ])
      },
    )
    const handler = () => void refresh()
    window.addEventListener('data-updated', handler)
    window.addEventListener('oc-maps-changed', handler)
    return () => {
      window.removeEventListener('data-updated', handler)
      window.removeEventListener('oc-maps-changed', handler)
    }
  }, [refresh])

  const filtered = useMemo(() => {
    return maps.filter((map) => {
      if (filter === 'template') return Boolean(map.isTemplate)
      if (filter === 'world') return normalizeMapParams(map.params).kind === 'world'
      if (filter === 'region') return normalizeMapParams(map.params).kind === 'region'
      return true
    })
  }, [filter, maps])

  const selected = useMemo(
    () => maps.find((map) => map.id === selectedId) ?? null,
    [maps, selectedId],
  )

  const handleRename = useCallback(() => {
    if (!selected || selected.id === undefined) return
    setDialog({ mode: 'rename', value: selected.name })
  }, [selected])

  const confirmDialog = useCallback(async () => {
    if (!selected || selected.id === undefined || !dialog) return
    if (dialog.mode === 'rename') {
      const name = dialog.value.trim()
      if (!name || name === selected.name) {
        setDialog(null)
        return
      }
      await renameMap(selected.id, name)
      setMessage('地图已重命名')
    } else {
      await deleteMap(selected.id)
      setSelectedId(null)
      setMessage('地图已移入回收站')
    }
    setDialog(null)
    window.dispatchEvent(new Event('oc-maps-changed'))
    await refresh()
  }, [dialog, refresh, selected])

  const worldMaps = useMemo(
    () => maps.filter((map) => normalizeMapParams(map.params).kind === 'world' && map.id !== undefined),
    [maps],
  )

  const editMap = useCallback(
    (id: number) => {
      setActiveMapId(id)
      window.dispatchEvent(new CustomEvent('oc-map-open', { detail: id }))
      onEditMap()
    },
    [onEditMap],
  )

  const openMap = useCallback((id: number) => {
    setActiveMapId(id)
    window.dispatchEvent(new CustomEvent('oc-map-open', { detail: id }))
    onOpenMap()
  }, [onOpenMap])

  const attachRegion = useCallback(async () => {
    if (!selected || selected.id === undefined || attachWorldId === null) return
    try {
      await updateRegionPlacement(selected.id, attachWorldId, {
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
      })
      await refresh()
      openMap(attachWorldId)
      setMessage('已叠放到世界地图，可在 2D 视图中拖动/缩放区域')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '叠放失败')
    }
  }, [attachWorldId, openMap, refresh, selected])

  const handleDelete = useCallback((id: number) => {
    if (id !== selected?.id) return
    setDialog({ mode: 'delete', value: selected?.name ?? '' })
  }, [selected])

  const toggleTemplate = useCallback(async (map: WorldMapRecord) => {
    if (map.id === undefined) return
    await setMapTemplate(map.id, !map.isTemplate)
    await refresh()
  }, [refresh])

  const entityLabel = useCallback(
    (link: { type: 'country' | 'character' | 'event'; id: number }): string => {
      const found = entities.find((item) => item.type === link.type && item.id === link.id)
      return found?.name ?? `${link.type} #${link.id}`
    },
    [entities],
  )

  const addMapLink = useCallback(async () => {
    if (!selected || selected.id === undefined || !linkValue) return
    const [type, rawId] = linkValue.split(':')
    const id = Number(rawId)
    if (!id) return
    const current = selected.linkedEntities ?? []
    if (current.some((item) => item.type === type && item.id === id)) {
      setMessage('这个实体已经关联过了')
      return
    }
    await setMapLinkedEntities(selected.id, [
      ...current,
      { type: type as 'country' | 'character' | 'event', id },
    ])
    setLinkValue('')
    await refresh()
  }, [linkValue, refresh, selected])

  const removeMapLink = useCallback(
    async (link: { type: 'country' | 'character' | 'event'; id: number }) => {
      if (!selected || selected.id === undefined) return
      await setMapLinkedEntities(
        selected.id,
        (selected.linkedEntities ?? []).filter((item) => item.type !== link.type || item.id !== link.id),
      )
      await refresh()
    },
    [refresh, selected],
  )

  const handleExport = useCallback(async (map: WorldMapRecord, format: 'png' | 'jpg' | 'ocmap') => {
    try {
      setMessage(null)
      if (format === 'ocmap') await downloadOcmap(map)
      else await downloadMapImage(map, format)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败')
    }
  }, [])

  const handleImport = useCallback(async (file: File | undefined) => {
    if (!file) return
    try {
      setMessage(null)
      const record = await importOcmapFile(file)
      await refresh()
      setSelectedId(record.id ?? null)
      setMessage(`已导入：${record.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [refresh])

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-line px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line bg-paper-card text-ink-muted">
            <FolderOpen size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-lg font-bold text-ink">地图</h1>
            <p className="truncate text-[10px] text-ink-faint">
              已生成资产 · 世界地图与区域地图 · 本地存储
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            className="flex h-8 w-8 items-center justify-center rounded border border-line text-ink-muted hover:border-line-hover hover:text-ink"
            title="刷新"
          >
            <RefreshCw size={14} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ocmap,.json,application/json"
            className="hidden"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 rounded border border-line px-3 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
          >
            <Upload size={13} strokeWidth={2} />
            导入
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(new Event('oc-new-map'))
              onOpenMap()
            }}
            className="flex h-8 items-center gap-1.5 rounded border border-line px-3 text-xs text-ink hover:border-line-hover"
          >
            <MapIcon size={13} strokeWidth={2} />
            新建地图
          </button>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
        {([
          ['all', '全部'],
          ['world', '世界地图'],
          ['region', '区域地图'],
          ['template', '模板'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`h-7 rounded px-2.5 text-[11px] transition-colors ${
              filter === value ? 'bg-paper-card text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-2 text-[10px] text-ink-faint">
          {filtered.length} 张 · 全部 {maps.length} 张
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center">
              <FolderOpen size={24} strokeWidth={2} className="text-ink-faint" />
              <p className="text-xs text-ink-muted">
                {loading ? '正在读取本地地图…' : '还没有地图。在“地图生成器”中生成一张世界地图。'}
              </p>
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
            >
              {filtered.map((map) => {
                const params = normalizeMapParams(map.params)
                const active = map.id === selectedId
                return (
                  <button
                    key={map.id}
                    onClick={() => setSelectedId(map.id ?? null)}
                    className={`group flex flex-col overflow-hidden rounded border bg-paper text-left transition-colors ${
                      active ? 'border-line-hover ring-1 ring-line-hover' : 'border-line hover:border-line-hover'
                    }`}
                  >
                    <div
                      className="relative w-full overflow-hidden bg-paper-card"
                      style={{ aspectRatio: params.kind === 'world' ? '2 / 1' : '1 / 1' }}
                    >
                      {map.thumbnail ? (
                        <img
                          src={map.thumbnail}
                          alt={map.name}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#dfe4d5] to-[#6f8f9d] text-ink-faint">
                          <MapIcon size={22} strokeWidth={1.5} />
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded bg-paper/85 px-1.5 py-0.5 text-[9px] text-ink-muted backdrop-blur">
                        {params.kind === 'world' ? '世界' : '区域'} · {params.width}×{params.height}
                      </span>
                      {map.isTemplate ? (
                        <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[9px] text-warning">
                          <Star size={9} strokeWidth={2} />
                          模板
                        </span>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm text-ink">{map.name}</p>
                        <span className="shrink-0 font-mono text-[9px] text-ink-faint">
                          {formatSeed(map.seed)}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-ink-faint">
                        陆地 {((map.stats?.landRatio ?? 0) * 100).toFixed(1)}% · 最高{' '}
                        {Math.round(map.stats?.maxElevation ?? 0).toLocaleString()}m · 更新{' '}
                        {formatDate(map.updatedAt)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <aside className="w-[272px] shrink-0 border-l border-line bg-paper-alt p-4">
          {selected ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-faint">地图详情</p>
                <p className="mt-1 font-serif text-lg text-ink">{selected.name}</p>
                <p className="mt-1 font-mono text-[10px] text-ink-faint">
                  seed {formatSeed(selected.seed)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded border border-line bg-paper p-2">
                  <p className="text-ink-faint">尺寸</p>
                  <p className="font-mono text-ink">
                    {normalizeMapParams(selected.params).width}×
                    {normalizeMapParams(selected.params).height}
                  </p>
                </div>
                <div className="rounded border border-line bg-paper p-2">
                  <p className="text-ink-faint">类型</p>
                  <p className="text-ink">
                    {normalizeMapParams(selected.params).kind === 'world' ? '世界地图' : '区域地图'}
                  </p>
                </div>
                <div className="rounded border border-line bg-paper p-2">
                  <p className="text-ink-faint">标注</p>
                  <p className="font-mono text-ink">{selected.annotations?.length ?? 0}</p>
                </div>
                <div className="rounded border border-line bg-paper p-2">
                  <p className="text-ink-faint">模板</p>
                  <p className="text-ink">{selected.isTemplate ? '是' : '否'}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleRename}
                  className="flex h-8 items-center justify-center gap-1.5 rounded border border-line text-xs text-ink-muted hover:border-line-hover hover:text-ink"
                >
                  重命名地图
                </button>
                <button
                  onClick={() => selected.id !== undefined && editMap(selected.id)}
                  className="flex h-8 items-center justify-center gap-1.5 rounded border border-ink bg-ink text-xs text-paper hover:opacity-90"
                >
                  <MapIcon size={13} strokeWidth={2} />
                  编辑国家 / 城市 / 道路
                </button>
                <button
                  onClick={() => selected.id !== undefined && openMap(selected.id)}
                  className="flex h-8 items-center justify-center gap-1.5 rounded border border-line-hover bg-paper-card text-xs text-ink hover:bg-paper"
                >
                  <ExternalLink size={13} strokeWidth={2} />
                  在生成器中重新生成
                </button>
                {normalizeMapParams(selected.params).kind === 'region' && worldMaps.length > 0 ? (
                  <div className="rounded border border-line bg-paper p-2">
                    <p className="mb-1.5 text-[10px] text-ink-faint">叠放到世界地图</p>
                    <select
                      value={attachWorldId ?? ''}
                      onChange={(event) => setAttachWorldId(Number(event.target.value) || null)}
                      className="mb-1.5 h-7 w-full rounded border border-line bg-paper px-1.5 text-[10px] text-ink outline-none"
                    >
                      <option value="">选择世界地图</option>
                      {worldMaps.map((world) => (
                        <option key={world.id} value={world.id}>
                          {world.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void attachRegion()}
                      disabled={attachWorldId === null || !selected.imageBlob}
                      className="flex h-7 w-full items-center justify-center rounded border border-line text-[10px] text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
                    >
                      叠放并打开
                    </button>
                  </div>
                ) : null}
                <div className="rounded-xl border border-line bg-paper p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                      OC 关联
                    </p>
                    <span className="text-[9px] text-ink-faint">
                      {(selected.linkedEntities ?? []).length} 项
                    </span>
                  </div>
                  <div className="mb-1.5 flex flex-wrap gap-1">
                    {(selected.linkedEntities ?? []).map((link) => (
                      <button
                        key={`${link.type}:${link.id}`}
                        onClick={() => void removeMapLink(link)}
                        className="rounded border border-line px-1.5 py-0.5 text-[9px] text-ink-muted hover:border-error/50 hover:text-error"
                        title="点击移除关联"
                      >
                        {entityLabel(link)} ×
                      </button>
                    ))}
                    {(selected.linkedEntities ?? []).length === 0 ? (
                      <span className="text-[9px] text-ink-faint">尚未关联角色/国家/事件</span>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <select
                      value={linkValue}
                      onChange={(event) => setLinkValue(event.target.value)}
                      className="h-7 min-w-0 flex-1 rounded border border-line bg-paper px-1.5 text-[10px] text-ink outline-none"
                    >
                      <option value="">选择实体</option>
                      {entities.map((entity) => (
                        <option key={`${entity.type}:${entity.id}`} value={`${entity.type}:${entity.id}`}>
                          {entity.type === 'country' ? '国家' : entity.type === 'character' ? '角色' : '事件'} · {entity.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void addMapLink()}
                      disabled={!linkValue}
                      className="h-7 rounded border border-line px-2 text-[10px] text-ink-muted hover:border-line-hover hover:text-ink disabled:opacity-40"
                    >
                      关联
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={() => void handleExport(selected, 'png')}
                    disabled={!selected.imageBlob}
                    className="flex h-8 items-center justify-center gap-1 rounded border border-line text-[10px] text-ink-muted hover:border-line-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    title="导出 PNG"
                  >
                    <Download size={12} strokeWidth={2} />
                    PNG
                  </button>
                  <button
                    onClick={() => void handleExport(selected, 'jpg')}
                    disabled={!selected.imageBlob}
                    className="flex h-8 items-center justify-center gap-1 rounded border border-line text-[10px] text-ink-muted hover:border-line-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    title="导出 JPG"
                  >
                    JPG
                  </button>
                  <button
                    onClick={() => void handleExport(selected, 'ocmap')}
                    className="flex h-8 items-center justify-center gap-1 rounded border border-line text-[10px] text-ink-muted hover:border-line-hover hover:text-ink"
                    title="导出 .ocmap"
                  >
                    .ocmap
                  </button>
                </div>
                <button
                  onClick={() => void toggleTemplate(selected)}
                  className="flex h-8 items-center justify-center gap-1.5 rounded border border-line text-xs text-ink-muted hover:border-line-hover hover:text-ink"
                >
                  <Star size={13} strokeWidth={2} />
                  {selected.isTemplate ? '取消模板' : '保存为模板'}
                </button>
                <button
                  onClick={() => selected.id !== undefined && void handleDelete(selected.id)}
                  className="flex h-8 items-center justify-center gap-1.5 rounded border border-line text-xs text-ink-muted hover:border-error/50 hover:text-error"
                >
                  <Trash2 size={13} strokeWidth={2} />
                  删除地图
                </button>
              </div>
              {message ? (
                <p className="rounded border border-line bg-paper px-2 py-1.5 text-[10px] text-ink-muted">
                  {message}
                </p>
              ) : null}
              <p className="border-t border-line pt-3 text-[10px] leading-5 text-ink-faint">
                图片、标注与模板保存在本地 IndexedDB。.ocmap 是单文件 JSON 资产，可在另一台离线设备导入。
              </p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MapIcon size={22} strokeWidth={1.5} className="text-ink-faint" />
              <p className="mt-2 text-xs text-ink-muted">选择一张地图查看详情</p>
            </div>
          )}
        </aside>
      </div>

      {dialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDialog(null)
          }}
        >
          <div className="w-[360px] rounded-xl border border-line bg-paper p-4 shadow-xl">
            <h3 className="font-serif text-base text-ink">
              {dialog.mode === 'rename' ? '重命名地图' : '删除地图'}
            </h3>
            <p className="mt-1 text-[11px] text-ink-muted">
              {dialog.mode === 'rename'
                ? '输入新的地图名称。'
                : `「${dialog.value}」将移入回收站，可在回收站恢复。`}
            </p>
            {dialog.mode === 'rename' ? (
              <input
                autoFocus
                value={dialog.value}
                onChange={(event) =>
                  setDialog((current) => (current ? { ...current, value: event.target.value } : current))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void confirmDialog()
                  if (event.key === 'Escape') setDialog(null)
                }}
                className="mt-3 h-9 w-full rounded-lg border border-line bg-paper-card px-3 text-sm text-ink outline-none focus:border-line-hover"
              />
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDialog(null)}
                className="h-8 rounded-lg border border-line px-3 text-xs text-ink-muted hover:border-line-hover hover:text-ink"
              >
                取消
              </button>
              <button
                onClick={() => void confirmDialog()}
                className={`h-8 rounded-lg px-3 text-xs text-paper ${
                  dialog.mode === 'delete' ? 'bg-error hover:opacity-90' : 'bg-ink hover:opacity-90'
                }`}
              >
                {dialog.mode === 'rename' ? '保存名称' : '移入回收站'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
