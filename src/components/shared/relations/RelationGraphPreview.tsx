'use client'

/**
 * 关系呈现的「图」档：**只读缩略**，不是关系图页。
 *
 * 这里只画当前实体与它的直接关系（自有实线、反查虚线），不跑布局、不画整库。
 * 布局是固定的放射环：中心当前实体，周围一圈关系目标 —— 关系图页才是手摆的画布
 * （`docs/关系图.md §2`），组件这边不复制那套交互。
 */
import type { RelationRow, RelationTargetKind } from './types'

interface RelationGraphPreviewProps {
  rows: RelationRow[]
  inbound: RelationRow[]
  selfName: string
  onNavigate?: (kind: RelationTargetKind, targetId: number) => void
}

/** 超过这个数就只画一圈，避免标签叠在一起 */
const MAX_NODES = 8
const VIEW_WIDTH = 360
const VIEW_HEIGHT = 180
const CENTER_X = VIEW_WIDTH / 2
const CENTER_Y = VIEW_HEIGHT / 2 - 4
const RADIUS_X = 118
const RADIUS_Y = 56

function truncate(value: string, length: number): string {
  const text = value.trim()
  if (text.length <= length) return text
  return `${text.slice(0, length)}…`
}

export function RelationGraphPreview({ rows, inbound, selfName, onNavigate }: RelationGraphPreviewProps) {
  // 同一目标在「自有」和「来自」里各有一条时只画一个节点（互为关系会记录两侧），
  // 但自有之间允许并行边（兄弟 + 同事），所以只按「自有」的键去重反查。
  const ownKeys = new Set(rows.map((row) => `${row.kind}:${row.targetId ?? row.name}`))
  const items = [
    ...rows.map((row) => ({ row, inbound: false })),
    ...inbound
      .filter((row) => !ownKeys.has(`${row.kind}:${row.targetId ?? row.name}`))
      .map((row) => ({ row, inbound: true })),
  ]
  const visible = items.slice(0, MAX_NODES).map((item, index, list) => {
    // 一左一右比一上一下更像「关系」；三个以上才用放射环
    const angle =
      list.length === 1
        ? -Math.PI / 2
        : list.length === 2
          ? index === 0
            ? Math.PI
            : 0
          : -Math.PI / 2 + (index * Math.PI * 2) / list.length
    return {
      ...item,
      x: CENTER_X + Math.cos(angle) * RADIUS_X,
      y: CENTER_Y + Math.sin(angle) * RADIUS_Y,
    }
  })
  const hidden = items.length - visible.length

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="group"
        aria-label="关系缩略图"
        className="h-44 w-full"
      >
        {visible.map((item) => (
          <line
            key={`edge-${item.row.key}`}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={item.x}
            y2={item.y}
            stroke="var(--color-line)"
            strokeWidth={1}
            strokeDasharray={item.inbound ? '2 3' : undefined}
          />
        ))}

        <circle cx={CENTER_X} cy={CENTER_Y} r={5} fill="var(--color-ink)" />
        <text
          x={CENTER_X}
          y={CENTER_Y + 18}
          textAnchor="middle"
          fontSize={11}
          fill="var(--color-ink-muted)"
        >
          {truncate(selfName || '当前条目', 10)}
        </text>

        {visible.map((item) => {
          const clickable = item.row.targetId !== undefined && onNavigate !== undefined
          return (
            <g
              key={`node-${item.row.key}`}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={clickable ? `打开 ${item.row.name}` : undefined}
              className={clickable ? 'cursor-pointer' : undefined}
              onClick={() => {
                if (clickable && item.row.targetId !== undefined) {
                  onNavigate(item.row.kind, item.row.targetId)
                }
              }}
              onKeyDown={(event) => {
                if (!clickable || item.row.targetId === undefined) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onNavigate(item.row.kind, item.row.targetId)
                }
              }}
            >
              <title>{item.row.relation ? `${item.row.name} · ${item.row.relation}` : item.row.name}</title>
              <circle
                cx={item.x}
                cy={item.y}
                r={4}
                fill={item.inbound ? 'var(--color-paper)' : 'var(--color-ink-muted)'}
                stroke={item.inbound ? 'var(--color-line-hover)' : undefined}
                strokeWidth={1}
              />
              <text
                x={item.x}
                y={item.y + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-ink-muted)"
              >
                {truncate(item.row.name, 6)}
              </text>
              {item.row.relation ? (
                <text
                  x={item.x}
                  y={item.y - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-ink-faint)"
                >
                  {truncate(item.row.relation, 6)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {hidden > 0 ? (
        <p className="mt-1 text-right text-[11px] text-ink-faint">另有 {hidden} 条</p>
      ) : null}
    </div>
  )
}
