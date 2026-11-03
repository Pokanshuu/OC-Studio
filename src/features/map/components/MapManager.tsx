'use client'

/**
 * 多地图管理面板（M3 的 UI 部分）。
 *
 * 下拉形态：触发按钮显示当前地图名，面板 portal 到 `#overlay-root`。
 * 这里自己读 `listMaps()` / `listMapAssets()` 并调用 services 的写操作，
 * 调用方只需要接 `onSelect`（切图）与 `onChanged`（重新读锚点/刷新视图）。
 *
 * 删除是二次确认（行内展开），文案说明「锚点会回到主地图」——
 * 这是删除地图唯一会被用户感知的数据后果。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'
import { notifyDataUpdated } from '@/lib/data-events'
import {
  BTN_DANGER,
  BTN_QUIET,
  FILTER_TRIGGER,
  ICON_BTN,
  INPUT_LINE,
  MENU,
  MENU_GROUP_LABEL,
  MENU_ITEM_BASE,
} from '@/lib/ui-tokens'
import {
  createMap,
  deleteMap,
  listMapAssets,
  listMaps,
  renameMap,
  setMapBackground,
  type MapAsset,
  type MapEntity,
} from '../services'

export interface MapManagerProps {
  /** 当前地图 id；null = 还没有地图 */
  activeMapId: number | null
  /** 切图；删除当前地图且已无其它地图时会收到 null */
  onSelect: (mapId: number | null) => void
  /** 新建 / 改名 / 删除 / 设底图之后触发，调用方重新读地图与锚点 */
  onChanged?: () => void
  /** 是否列出 `.ocstudio/maps/` 的底图资源，默认 true */
  showAssets?: boolean
  disabled?: boolean
  className?: string
  /** 触发按钮类名，默认 `FILTER_TRIGGER` */
  triggerClassName?: string
  /** 面板额外类名（宽度 / 层级等） */
  panelClassName?: string
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

function measureImageUrl(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image()
    let settled = false
    const finish = (value: { width: number; height: number } | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => finish(null)
    image.src = url
  })
}

export function MapManager({
  activeMapId,
  onSelect,
  onChanged,
  showAssets = true,
  disabled = false,
  className,
  triggerClassName = FILTER_TRIGGER,
  panelClassName,
}: MapManagerProps) {
  const [open, setOpen] = useState(false)
  const [maps, setMaps] = useState<MapEntity[]>([])
  const [assets, setAssets] = useState<MapAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)

  const activeMap = maps.find((map) => map.id === activeMapId) ?? null

  const refresh = useCallback(async () => {
    const [mapList, assetList] = await Promise.all([
      listMaps(),
      showAssets ? listMapAssets() : Promise.resolve<MapAsset[]>([]),
    ])
    setMaps(mapList)
    setAssets(assetList)
  }, [showAssets])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏读地图列表；setState 在异步回调里
    void refresh().catch((err: unknown) => {
      if (!cancelled) setError(messageOf(err))
    })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 每次打开面板重新读库；setState 在异步回调里
    void refresh().catch((err: unknown) => setError(messageOf(err)))
  }, [open, refresh])

  const placePanel = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger === null) return
    const rect = trigger.getBoundingClientRect()
    const panelWidth = 320
    const panelHeight = 432
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - panelWidth - 8))
    const below = rect.bottom + 4
    const top =
      below + panelHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - panelHeight - 4)
        : below
    setPosition({ left, top })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setRenamingId(null)
    setConfirmDeleteId(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) === true) return
      if (panelRef.current?.contains(target) === true) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const handleResize = () => close()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, close])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    placePanel()
    setError(null)
    setOpen(true)
  }

  const commit = useCallback(
    async (action: () => Promise<void>) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        await action()
        await refresh()
        notifyDataUpdated()
        onChanged?.()
      } catch (err) {
        setError(messageOf(err))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [refresh, onChanged],
  )

  const handleCreate = () => {
    void commit(async () => {
      const id = await createMap()
      setOpen(false)
      onSelect(id)
    })
  }

  const handleSelect = (id: number) => {
    onSelect(id)
    close()
  }

  const handleRename = (id: number) => {
    const next = renameDraft.trim()
    if (next.length === 0) {
      setError('地图名不能为空')
      return
    }
    if (maps.some((map) => map.id !== id && map.name === next)) {
      setError('已存在同名地图')
      return
    }
    void commit(async () => {
      await renameMap(id, next)
      setRenamingId(null)
    })
  }

  const handleDelete = (map: MapEntity) => {
    void commit(async () => {
      await deleteMap(map.id)
      setConfirmDeleteId(null)
      if (map.id === activeMapId) {
        const remaining = maps.filter((item) => item.id !== map.id)
        onSelect(remaining[0]?.id ?? null)
      }
    })
  }

  const handleUseAsset = (asset: MapAsset) => {
    if (activeMap === null) return
    void commit(async () => {
      const size = await measureImageUrl(asset.url)
      await setMapBackground(activeMap.id, asset.relPath, size ?? undefined)
      setOpen(false)
    })
  }

  const overlayRoot = typeof document === 'undefined' ? null : document.getElementById('overlay-root')

  const panel = (
    <div
      ref={panelRef}
      className={`fixed z-40 flex max-h-[min(70vh,34rem)] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto ${MENU} ${panelClassName ?? ''}`}
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label="地图管理"
    >
      {error !== null ? (
        <p className="px-3 py-1 text-[11px] text-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className={MENU_GROUP_LABEL}>地图</p>

      {maps.map((map) => {
        if (renamingId === map.id) {
          return (
            <form
              key={map.id}
              className={`${MENU_ITEM_BASE} gap-1`}
              onSubmit={(event) => {
                event.preventDefault()
                handleRename(map.id)
              }}
            >
              <div className="min-w-0 flex-1">
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setRenamingId(null)
                    }
                  }}
                  aria-label="地图名称"
                  className={INPUT_LINE}
                />
              </div>
              <button type="submit" className={ICON_BTN} disabled={busy} aria-label="保存名称">
                <Check size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={ICON_BTN}
                onClick={() => setRenamingId(null)}
                aria-label="取消"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </form>
          )
        }

        if (confirmDeleteId === map.id) {
          return (
            <div key={map.id} className={`${MENU_ITEM_BASE} flex-col items-stretch gap-1 bg-[var(--oc-hover)]`}>
              <p className="truncate text-[12px] text-ink">删除「{map.name}」？</p>
              <p className="text-[11px] text-ink-faint">锚点会回到主地图</p>
              <div className="flex items-center justify-end gap-1">
                <button type="button" className={BTN_QUIET} onClick={() => setConfirmDeleteId(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className={BTN_DANGER}
                  disabled={busy}
                  onClick={() => handleDelete(map)}
                >
                  删除
                </button>
              </div>
            </div>
          )
        }

        const isActive = map.id === activeMapId
        return (
          <div
            key={map.id}
            className={`${MENU_ITEM_BASE} ${isActive ? 'bg-[var(--oc-hover)]' : 'hover:bg-[var(--oc-hover)]'}`}
          >
            <button
              type="button"
              onClick={() => handleSelect(map.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <Check
                size={14}
                strokeWidth={2}
                className={isActive ? 'shrink-0 text-ink' : 'shrink-0 text-transparent'}
              />
              <span className={`min-w-0 truncate text-[13px] ${isActive ? 'text-ink' : 'text-ink-muted'}`}>
                {map.name}
              </span>
            </button>
            <button
              type="button"
              className={ICON_BTN}
              onClick={() => {
                setConfirmDeleteId(null)
                setRenameDraft(map.name)
                setRenamingId(map.id)
              }}
              aria-label={`重命名 ${map.name}`}
            >
              <Pencil size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`${ICON_BTN} hover:text-error`}
              onClick={() => {
                setRenamingId(null)
                setConfirmDeleteId(map.id)
              }}
              aria-label={`删除 ${map.name}`}
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
        )
      })}

      <button
        type="button"
        className={`${MENU_ITEM_BASE} text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink`}
        disabled={busy}
        onClick={handleCreate}
      >
        <Plus size={14} strokeWidth={2} className="shrink-0" />
        新建地图
      </button>

      {showAssets && activeMap !== null ? (
        <>
          <div className="my-1 border-t border-line" />
          <p className={MENU_GROUP_LABEL}>底图资源</p>
          {assets.length === 0 ? (
            <p className="px-3 py-1 text-[11px] text-ink-faint">还没有底图</p>
          ) : (
            assets.map((asset) => (
              <div
                key={asset.relPath}
                className={`${MENU_ITEM_BASE} hover:bg-[var(--oc-hover)]`}
              >
                <span
                  aria-hidden
                  className="h-7 w-10 shrink-0 rounded-item border border-line bg-cover bg-center"
                  style={{ backgroundImage: `url("${asset.url}")` }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{asset.name}</span>
                {activeMap.image === asset.relPath ? (
                  <span className="shrink-0 text-[11px] text-ink-faint">当前</span>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] text-ink-muted transition-colors hover:text-ink"
                    disabled={busy}
                    onClick={() => handleUseAsset(asset)}
                  >
                    设为底图
                  </button>
                )}
              </div>
            ))
          )}
        </>
      ) : null}
    </div>
  )

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="max-w-[12rem] truncate">{activeMap?.name ?? '选择地图'}</span>
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open && overlayRoot !== null ? createPortal(panel, overlayRoot) : null}
    </div>
  )
}
