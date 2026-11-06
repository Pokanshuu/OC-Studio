'use client'

/**
 * 关系的「＋ 添加」：一个按实体类型分组、可搜索的浮层。
 *
 * 为什么不用 `RelatedItemsSelector`：那个是单选一类实体的字段控件（国籍、参与者），
 * 关系要跨类型（角色 / 事件 / 国家），还要带分组标题。这里保留同一套 MENU / MENU_ITEM
 * 皮肤，但把候选项的**来源**交给调用方（三个编辑器各自只给能存的那几类）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { ADD_ACTION, MENU, MENU_GROUP_LABEL, MENU_ITEM } from '@/lib/ui-tokens'
import {
  RELATION_KIND_LABEL,
  RELATION_KIND_ORDER,
  type RelationCandidate,
  type RelationTargetKind,
} from './types'

interface RelationPickerProps {
  candidates: RelationCandidate[]
  onPick: (candidate: RelationCandidate) => void
}

interface Anchor {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

const PANEL_WIDTH = 260
const MAX_PANEL_HEIGHT = 320
const MAX_VISIBLE = 60
const GAP = 4
const MARGIN = 8

function measure(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(PANEL_WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.min(Math.max(MARGIN, rect.right - width), window.innerWidth - width - MARGIN)
  const spaceBelow = window.innerHeight - rect.bottom - MARGIN
  const spaceAbove = rect.top - MARGIN
  // 下面放不下、上面更宽裕时向上翻；两边都放不下就留在下面并压小高度
  const above = spaceBelow < 200 && spaceAbove > spaceBelow
  if (above) {
    return {
      left,
      width,
      bottom: window.innerHeight - rect.top + GAP,
      maxHeight: Math.max(160, Math.min(MAX_PANEL_HEIGHT, spaceAbove - GAP)),
    }
  }
  return {
    left,
    width,
    top: rect.bottom + GAP,
    maxHeight: Math.max(160, Math.min(MAX_PANEL_HEIGHT, spaceBelow - GAP)),
  }
}

export function RelationPicker({ candidates, onPick }: RelationPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 面板跟着触发按钮走：滚动 / 改窗口大小时重算，不跟着内容一起滚走
  useEffect(() => {
    if (!open) return
    const place = () => {
      if (triggerRef.current) setAnchor(measure(triggerRef.current))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  // 只在打开时订阅「点外面关闭」；触发按钮自己不算外面
  useEffect(() => {
    if (!open) return
    function handleClick(event: MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const id = window.setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('click', handleClick)
    }
  }, [open])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return candidates
    return candidates.filter((candidate) => candidate.name.toLowerCase().includes(query))
  }, [candidates, search])

  // 库很大时不要一次铺几百行：先给一屏，剩下的靠搜索
  const visible = useMemo(() => filtered.slice(0, MAX_VISIBLE), [filtered])

  const groups = useMemo(() => {
    const grouped = new Map<RelationTargetKind, RelationCandidate[]>()
    for (const kind of RELATION_KIND_ORDER) {
      const items = visible.filter((candidate) => candidate.kind === kind)
      if (items.length > 0) grouped.set(kind, items)
    }
    return [...grouped.entries()]
  }, [visible])

  function pick(candidate: RelationCandidate): void {
    onPick(candidate)
    setOpen(false)
    setSearch('')
  }

  const panel =
    open && anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: anchor.left,
              width: anchor.width,
              ...(anchor.top !== undefined ? { top: anchor.top } : { bottom: anchor.bottom }),
            }}
            className={`${MENU} pointer-events-auto`}
          >
            <div className="px-2 pb-1">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setOpen(false)
                  }
                }}
                placeholder="搜索"
                className="h-6 w-full border-b border-line bg-transparent text-[12px] text-ink placeholder:text-ink-faint transition-colors focus:border-line-hover focus:outline-none"
              />
            </div>
            <div style={{ maxHeight: anchor.maxHeight }} className="overflow-auto">
              {groups.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-ink-faint">
                  {search.trim() ? '未找到匹配项' : '没有可添加的对象'}
                </p>
              ) : (
                <>
                  {groups.map(([kind, items]) => (
                    <div key={kind}>
                      <p className={MENU_GROUP_LABEL}>{RELATION_KIND_LABEL[kind]}</p>
                      {items.map((candidate) => (
                        <button
                          key={`${kind}-${candidate.targetId}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => pick(candidate)}
                          className={MENU_ITEM}
                        >
                          <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                          {candidate.subtitle ? (
                            <span className="shrink-0 text-[11px] text-ink-faint">{candidate.subtitle}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ))}
                  {filtered.length > visible.length ? (
                    <p className="px-3 py-1 text-[11px] text-ink-faint">
                      还有 {filtered.length - visible.length} 项，输入关键词筛选
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>,
          document.getElementById('overlay-root') ?? document.body,
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          setSearch('')
          setOpen(true)
        }}
        className={ADD_ACTION}
      >
        <Plus size={12} strokeWidth={2} />
        <span>添加</span>
      </button>
      {panel}
    </>
  )
}
