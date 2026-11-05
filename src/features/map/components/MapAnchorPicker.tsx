'use client'

/**
 * 给当前地图挑一个锚点目标（国家 / 事件 / 词条）。
 *
 * 只负责「列候选 + 搜索 + 返回选择」，不写任何数据：
 * 调用方拿到 `{ kind, id, title }` 后自己 `setAnchor(kind, id, { x: 0.5, y: 0.5 }, mapName)`，
 * 这样默认落点与写回口径（归一化 0–1）仍然只有 `services.ts` 一个源。
 *
 * 候选排除「已经挂在当前地图上」的实体；挂在主地图或其它地图的会标明来源，
 * 因为 MapView 对空 `map_id` 的锚点是全图可见的（拖动后才归属当前图）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { db } from '@/lib/db'
import { isCodexEntry } from '@/lib/entry-kinds'
import {
  ICON_BTN,
  LOADING_TEXT,
  MENU_GROUP_LABEL,
  MENU_ITEM_BASE,
  PANEL,
  SEARCH_ICON,
  SEARCH_INPUT,
} from '@/lib/ui-tokens'
import { MAP_LAYER_LABELS } from '../types'
import type { AnchorKind } from '../services'

export interface MapAnchorSelection {
  kind: AnchorKind
  id: number
  title: string
}

export interface MapAnchorPickerProps {
  open: boolean
  /** 当前地图名；空字符串 = 主地图 */
  mapName: string
  onClose: () => void
  /** 选中一个候选。调用方自行 setAnchor + 关闭（组件也会关闭） */
  onSelect: (selection: MapAnchorSelection) => void
  /** 只列这几类，默认国家 / 事件 / 词条全列 */
  kinds?: readonly AnchorKind[]
  /** 是否隐藏已经挂在当前地图上的实体，默认 true */
  hideOnCurrentMap?: boolean
  /** 自定义 overlay 容器；缺省用 `#overlay-root` */
  portalContainer?: HTMLElement | null
}

interface Candidate extends MapAnchorSelection {
  /** 实体当前归属（空 = 主地图） */
  mapId: string
  /** 是否已经有坐标（主地图上也可能是没摆过的） */
  anchored: boolean
}

const ALL_KINDS: readonly AnchorKind[] = ['country', 'event', 'worldEntry']

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : String(err)
}

function originLabel(candidate: Candidate): string {
  if (candidate.mapId.length > 0) return '其它地图'
  return candidate.anchored ? '主地图' : ''
}

export function MapAnchorPicker({
  open,
  mapName,
  onClose,
  onSelect,
  kinds = ALL_KINDS,
  hideOnCurrentMap = true,
  portalContainer,
}: MapAnchorPickerProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => {
    setQuery('')
    setError(null)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [countries, events, entries] = await Promise.all([
          db.countries.filter((row) => !row.deleted).toArray(),
          db.events.filter((row) => !row.deleted).toArray(),
          db.worldEntries.filter((row) => !row.deleted && isCodexEntry(row)).toArray(),
        ])
        if (cancelled) return

        const rows: Candidate[] = [
          ...countries.map((row) => ({
            kind: 'country' as const,
            id: row.id,
            title: row.name,
            mapId: row.mapId ?? '',
            anchored: row.mapPosition !== undefined,
          })),
          ...events.map((row) => ({
            kind: 'event' as const,
            id: row.id,
            title: row.title,
            mapId: row.mapId ?? '',
            anchored: row.mapPosition !== undefined,
          })),
          ...entries.map((row) => ({
            kind: 'worldEntry' as const,
            id: row.id,
            title: row.title,
            mapId: row.mapId ?? '',
            anchored: row.mapPosition !== undefined,
          })),
        ]

        rows.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
        setCandidates(rows)
      } catch (err) {
        if (!cancelled) setError(messageOf(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return candidates.filter((candidate) => {
      if (!kinds.includes(candidate.kind)) return false
      if (hideOnCurrentMap && candidate.mapId === mapName) return false
      if (keyword.length === 0) return true
      return candidate.title.toLowerCase().includes(keyword)
    })
  }, [candidates, kinds, hideOnCurrentMap, mapName, query])

  const groups = useMemo(() => {
    const out: Array<{ kind: AnchorKind; items: Candidate[] }> = []
    for (const kind of kinds) {
      const items = visible.filter((candidate) => candidate.kind === kind)
      if (items.length > 0) out.push({ kind, items })
    }
    return out
  }, [kinds, visible])

  const pick = (candidate: Candidate) => {
    onSelect({ kind: candidate.kind, id: candidate.id, title: candidate.title })
    close()
  }

  // Esc 关闭：浮层挂在 #overlay-root，离开地图页时也要能收掉
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
  const overlayRoot =
    portalContainer !== undefined
      ? portalContainer
      : typeof document === 'undefined'
        ? null
        : document.getElementById('overlay-root')

  const dialog = (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-start justify-center bg-[var(--oc-scrim)] px-4 pt-[12vh]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className={`flex max-h-[70vh] w-[min(28rem,100%)] flex-col overflow-hidden ${PANEL}`}
        role="dialog"
        aria-modal="true"
        aria-label="添加地图锚点"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <button type="button" className={ICON_BTN} onClick={close} aria-label="关闭">
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">添加锚点</p>
          <span className="shrink-0 text-[11px] text-ink-faint">{mapName.length > 0 ? mapName : '主地图'}</span>
        </div>

        <div className="relative shrink-0 px-3 py-2">
          <Search size={14} strokeWidth={2} className={SEARCH_ICON} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索国家 / 事件 / 词条"
            className={`${SEARCH_INPUT} !w-full`}
            aria-label="搜索可添加的实体"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-1">
          {loading ? <p className={`px-3 py-6 text-center ${LOADING_TEXT}`}>加载中…</p> : null}

          {error !== null ? (
            <p className="px-3 py-2 text-[12px] text-error" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && error === null && groups.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-ink-faint">
              {query.trim().length > 0 ? '没有匹配的条目' : '没有可添加的条目'}
            </p>
          ) : null}

          {groups.map((group) => (
            <section key={group.kind} aria-label={MAP_LAYER_LABELS[group.kind]}>
              <p className={MENU_GROUP_LABEL}>{MAP_LAYER_LABELS[group.kind]}</p>
              <ul>
                {group.items.map((candidate) => {
                  const origin = originLabel(candidate)
                  return (
                    <li key={`${candidate.kind}:${candidate.id}`}>
                      <button
                        type="button"
                        onClick={() => pick(candidate)}
                        className={`${MENU_ITEM_BASE} text-ink hover:bg-[var(--oc-hover)]`}
                      >
                        <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                        {origin.length > 0 ? (
                          <span className="shrink-0 text-[11px] text-ink-faint">{origin}</span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )

  return open && overlayRoot !== null ? createPortal(dialog, overlayRoot) : null
}
