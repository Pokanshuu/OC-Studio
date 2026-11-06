'use client'

/**
 * 左上：**这张图是什么 + 能不能定位到人**（docs/关系图.md §10）。
 *
 * 全屏画布没有页头，所以「关系图谱 · 42 节点 · 67 关系」这一行就是这页的身份
 * （和地图左上那张名片同一个位置、同一套皮肤）。定位收在同一朵浮条里：
 * 按一下就地变输入框，结果从条下面垂下来 —— 不另开一个搜索面板。
 *
 * 聚焦子图时这朵浮条换成面包屑：`← 全部 | 先总理`，位置不动，
 * 用户始终知道「怎么回去」。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { getImageUrl } from '@/lib/image-service'
import { FLOAT_BAR, FLOAT_BAR_ICON, FLOAT_BAR_TEXT, MENU_ITEM_BASE, PANEL, ROUND_ITEM } from '@/lib/ui-tokens'
import { useDismissableLayer } from '@/lib/use-dismissable-layer'
import type { GraphNode, RelationNodeType } from '../types'
import { NodeTypeIcon, NODE_TYPE_LABELS } from './node-type-icon'

interface RelationTopBarProps {
  /** 全部节点（不是过滤后的）：定位要能找见被筛掉的那一类 */
  nodes: GraphNode[]
  edgeCount: number
  /** 正在看某节点的关系时给它名字，这朵条就变成面包屑 */
  focusLabel: string | null
  onExitFocus: () => void
  onLocate: (nodeId: string) => void
}

const MAX_RESULTS = 6

/** 缩略图取哪个槽位的图（与节点、导出的口径一致：角色头像 / 事件封面 / 国家旗帜 / 分类封面） */
const THUMB_KIND: Record<RelationNodeType, string> = {
  character: 'avatar',
  event: 'header',
  country: 'flag',
  world: 'flag',
}

/** 结果行左边那一格：有图就给图，没图退回类型图标（拿默认占位图会把人看糊） */
function NodeThumb({ type, src }: { type: RelationNodeType; src: string }) {
  const [failed, setFailed] = useState(false)
  const url = src.trim() !== '' && !failed ? getImageUrl(src, THUMB_KIND[type]) : ''

  return (
    <span
      aria-hidden
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center overflow-hidden border border-line bg-paper-card text-ink-faint ${
        type === 'character' ? 'rounded-full' : ROUND_ITEM
      }`}
    >
      {url !== '' ? (
        // eslint-disable-next-line @next/next/no-img-element -- 库内素材走 asset 协议，不走 next/image
        <img src={url} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <NodeTypeIcon type={type} size={11} />
      )}
    </span>
  )
}

export function RelationTopBar({ nodes, edgeCount, focusLabel, onExitFocus, onLocate }: RelationTopBarProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const layerRef = useDismissableLayer<HTMLDivElement>({
    onClose: () => setOpen(false),
    enabled: open,
  })

  // ⌘F / Ctrl+F：打开定位（不抢浏览器的「查找」——这张图本身就是可查找的）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const pool = nodes.map((node) => {
      const type = node.data.entityType as RelationNodeType
      return {
        id: node.id,
        label: node.data.label,
        type,
        subtitle: node.data.subtitle,
        // 分类条目的封面也挂在 `flagUrl` 上（见 services.buildGraphData）
        image:
          type === 'character'
            ? String(node.data.avatarUrl ?? '')
            : type === 'event'
              ? String(node.data.imageUrl ?? '')
              : String(node.data.flagUrl ?? ''),
      }
    })
    if (!keyword) return pool.slice(0, MAX_RESULTS)
    return pool
      .filter(
        (item) =>
          item.label.toLowerCase().includes(keyword) ||
          (item.subtitle ?? '').toLowerCase().includes(keyword),
      )
      .slice(0, MAX_RESULTS)
  }, [nodes, query])

  // 结果换了一批，高亮回到第一条（改输入时顺手归零，不用 effect 追）
  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (nodeId: string) => {
    onLocate(nodeId)
    close()
  }

  return (
    <div ref={layerRef} className="pointer-events-auto relative">
      <div className={FLOAT_BAR}>
        {focusLabel ? (
          <>
            <button type="button" onClick={onExitFocus} className={FLOAT_BAR_TEXT}>
              <ArrowLeft size={13} strokeWidth={2} />
              全部
            </button>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />
            <span className="max-w-[160px] truncate px-1.5 text-[12px] text-ink">{focusLabel}</span>
          </>
        ) : (
          <>
            <span className="shrink-0 px-1.5 text-[12px] font-bold text-ink">关系图谱</span>
            <span className="shrink-0 pr-1 text-[11px] tabular-nums text-ink-faint">
              {nodes.length} · {edgeCount}
            </span>
          </>
        )}

        <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />

        {open ? (
          <>
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveIndex((index) =>
                    results.length === 0 ? 0 : (index - 1 + results.length) % results.length,
                  )
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  const hit = results[activeIndex]
                  if (hit) pick(hit.id)
                }
              }}
              placeholder="名字"
              aria-label="定位条目"
              className="h-6 w-40 min-w-0 bg-transparent px-1 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
            <button type="button" onClick={close} className={FLOAT_BAR_ICON} aria-label="关闭定位">
              <X size={13} strokeWidth={2} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={FLOAT_BAR_ICON}
            aria-label="定位条目"
            title="定位条目"
          >
            <Search size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {open ? (
        <div className={`absolute left-0 top-[calc(100%+6px)] w-64 p-1 ${PANEL}`}>
          {results.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-ink-faint">没有匹配的条目</p>
          ) : (
            <div role="listbox" aria-label="定位结果">
              {results.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(item.id)}
                  className={`${MENU_ITEM_BASE} ${
                    index === activeIndex
                      ? 'bg-[var(--oc-hover)] text-ink'
                      : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                  }`}
                >
                  <NodeThumb type={item.type} src={item.image} />
                  <span className="min-w-0 flex-1 truncate text-[12px]">{item.label}</span>
                  {item.subtitle ? (
                    <span className="shrink-0 text-[11px] text-ink-faint">{item.subtitle}</span>
                  ) : null}
                  <span className="sr-only">{NODE_TYPE_LABELS[item.type]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
