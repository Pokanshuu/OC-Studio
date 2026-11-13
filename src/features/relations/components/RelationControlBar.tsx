'use client'

/**
 * 左下：**一条控制条**（docs/关系图.md §10）—— 显示什么 + 线怎么画。
 *
 * 与地图的 `MapControlBar` 同一套语法：左端一枚 `显示` 打开面板，竖线之后是常用档位。
 * 区别只在语义：地图那六个是**单选**（换一张底图），这里四类是**多选**（叠不叠），
 * 所以用 `aria-pressed` 的 chip，而不是段落。
 *
 * 图例**只放在面板里**（和地图同规矩）：图例是查阅用的，不该常驻占掉一个角。
 * 面板里的图例行同时就是开关，带篇数 —— 一条信息只说一次。
 */
import { useState, type ReactNode } from 'react'
import { useDismissableLayer } from '@/lib/use-dismissable-layer'
import { ChevronUp, Eye } from 'lucide-react'
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from '@/lib/edge-style'
import { CheckboxBox } from '@/components/ui/checkbox'
import { FLOAT_BAR, PANEL, PANEL_GROUP_LABEL, ROUND_ITEM } from '@/lib/ui-tokens'
import type { RelationNodeType } from '../types'
import { NodeTypeIcon, NODE_TYPE_LABELS, NODE_TYPE_ORDER } from './node-type-icon'

interface RelationControlBarProps {
  counts: Record<RelationNodeType, number>
  visible: Record<RelationNodeType, boolean>
  onToggleType: (type: RelationNodeType) => void
  /** 没有任何边的节点（新建后还没连线的那些） */
  showIsolated: boolean
  onToggleIsolated: () => void
  showEdgeLabels: boolean
  onToggleEdgeLabels: () => void
  edgeStyle: EdgeStyle
  onEdgeStyleChange: (value: EdgeStyle) => void
  showMiniMap: boolean
  onToggleMiniMap: () => void
}

/** 面板里的一行开关：勾 + 名称 + 右侧数字 */
function ToggleRow({
  checked,
  onToggle,
  children,
  trailing,
}: {
  checked: boolean
  onToggle: () => void
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-[12px] text-ink transition-colors hover:bg-[var(--oc-hover)] ${ROUND_ITEM}`}
    >
      <CheckboxBox checked={checked} />
      {children}
      {trailing}
    </button>
  )
}

export function RelationControlBar({
  counts,
  visible,
  onToggleType,
  showIsolated,
  onToggleIsolated,
  showEdgeLabels,
  onToggleEdgeLabels,
  edgeStyle,
  onEdgeStyleChange,
  showMiniMap,
  onToggleMiniMap,
}: RelationControlBarProps) {
  const [open, setOpen] = useState(false)
  // 点外部 / Esc 关闭：面板开在画布上，点一下就收（与菜单同一套）
  const layerRef = useDismissableLayer<HTMLDivElement>({
    onClose: () => setOpen(false),
    enabled: open,
  })

  return (
    <div ref={layerRef} className="pointer-events-auto flex flex-col items-start gap-2">
      {open ? (
        <div className={`w-[248px] p-2 ${PANEL}`} role="group" aria-label="显示与图例">
          <p className={PANEL_GROUP_LABEL}>显示</p>
          <div className="flex flex-col">
            {NODE_TYPE_ORDER.map((type) => (
              <ToggleRow
                key={type}
                checked={visible[type]}
                onToggle={() => onToggleType(type)}
                trailing={
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">{counts[type]}</span>
                }
              >
                <span className="shrink-0 text-ink-faint" aria-hidden>
                  <NodeTypeIcon type={type} size={12} />
                </span>
                <span className="min-w-0 flex-1 truncate">{NODE_TYPE_LABELS[type]}</span>
              </ToggleRow>
            ))}
            <ToggleRow checked={showIsolated} onToggle={onToggleIsolated}>
              <span className="min-w-0 flex-1 truncate">孤立节点</span>
            </ToggleRow>
            <ToggleRow checked={showMiniMap} onToggle={onToggleMiniMap}>
              <span className="min-w-0 flex-1 truncate">小地图</span>
            </ToggleRow>
          </div>

          <div className="mx-1 my-1.5 h-px bg-line" />
          <p className={PANEL_GROUP_LABEL}>边</p>
          <div className="flex flex-col">
            <ToggleRow checked={showEdgeLabels} onToggle={onToggleEdgeLabels}>
              <span className="min-w-0 flex-1 truncate">显示关系名</span>
            </ToggleRow>
            <div className="mt-1 flex items-center gap-0.5 px-1">
              {EDGE_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={edgeStyle === option.value}
                  onClick={() => onEdgeStyleChange(option.value)}
                  className={`h-6 flex-1 text-[12px] transition-colors ${ROUND_ITEM} ${
                    edgeStyle === option.value
                      ? 'bg-[var(--oc-hover)] text-ink'
                      : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className={`relative ${FLOAT_BAR}`}>
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          aria-label="显示"
          className={`flex h-6 shrink-0 items-center gap-1 px-1.5 text-[12px] transition-colors ${ROUND_ITEM} ${
            open
              ? 'bg-[var(--oc-hover)] text-ink'
              : 'text-ink-muted hover:bg-[var(--oc-hover)] hover:text-ink'
          }`}
        >
          <Eye size={13} strokeWidth={2} />
          显示
          <ChevronUp
            size={12}
            strokeWidth={2}
            className={`shrink-0 text-ink-faint transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
          />
        </button>

        <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />

        {/* 窄屏只留「显示」：四个 chip + 右下缩放条在 360px 上会打架，筛选走面板 */}
        <div className="flex items-center gap-0.5 max-md:hidden">
          {NODE_TYPE_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onToggleType(type)}
              aria-pressed={visible[type]}
              className={`flex h-6 shrink-0 items-center gap-1 px-1.5 text-[12px] transition-colors ${ROUND_ITEM} ${
                visible[type]
                  ? 'bg-[var(--oc-hover)] text-ink'
                  : 'text-ink-faint hover:text-ink'
              }`}
            >
              <NodeTypeIcon type={type} size={12} />
              {NODE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
