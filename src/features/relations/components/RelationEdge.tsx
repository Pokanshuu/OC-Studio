'use client'

import { useEffect, useRef, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getStraightPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { Palette } from 'lucide-react'
import { deleteRelation, updateRelationLabel } from '../services'
import { useRelationUiStore } from '../store'
import {
  resolveRelationArrow,
  resolveRelationColor,
} from '../style'
import { useFloatingEdge } from './useFloatingEdge'

function arrowPoints(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  size = 9,
): string {
  const angle = Math.atan2(tipY - fromY, tipX - fromX)
  const baseX = tipX - Math.cos(angle) * size
  const baseY = tipY - Math.sin(angle) * size
  const normalX = -Math.sin(angle) * size * 0.55
  const normalY = Math.cos(angle) * size * 0.55
  return `${tipX},${tipY} ${baseX + normalX},${baseY + normalY} ${baseX - normalX},${baseY - normalY}`
}

export function RelationEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const edgeStyle = useRelationUiStore((state) => state.edgeStyle)
  const storedControl = useRelationUiStore((state) => state.edgeControls[id ?? ''])
  const setEdgeControl = useRelationUiStore((state) => state.setEdgeControl)
  const { screenToFlowPosition } = useReactFlow()

  const anchors = useFloatingEdge(source, target, { sourceX, sourceY, targetX, targetY })
  const startX = anchors.sourceX
  const startY = anchors.sourceY
  const endX = anchors.targetX
  const endY = anchors.targetY

  const color = resolveRelationColor(data?.color)
  const arrow = resolveRelationArrow(data?.arrow)

  const dx = endX - startX
  const dy = endY - startY
  const length = Math.max(1, Math.hypot(dx, dy))
  const lengthSquared = Math.max(1, dx * dx + dy * dy)
  const normalX = -dy / length
  const normalY = dx / length
  const parallelIndex = Number(data?.parallelIndex ?? 0)
  const parallelCount = Number(data?.parallelCount ?? 1)
  const lane =
    parallelCount > 1 ? (parallelIndex - (parallelCount - 1) / 2) * 36 : 0
  const control = storedControl ?? {
    u1: 0.33,
    v1: 34 + lane,
    u2: 0.66,
    v2: 34 + lane,
  }

  const pointAt = (u: number, v: number): [number, number] => [
    startX + dx * u + normalX * v,
    startY + dy * u + normalY * v,
  ]
  const [c1x, c1y] = pointAt(control.u1, control.v1)
  const [c2x, c2y] = pointAt(control.u2, control.v2)

  const [edgePath, labelX, labelY] =
    edgeStyle === 'straight'
      ? getStraightPath({ sourceX: startX, sourceY: startY, targetX: endX, targetY: endY })
      : [
          `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`,
          0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX,
          0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY,
        ]

  const startCurveDrag = (event: React.PointerEvent<SVGPathElement>): void => {
    if (!id || edgeStyle === 'straight') return
    event.preventDefault()
    event.stopPropagation()
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const project = (point: { x: number; y: number }) => ({
      u: ((point.x - startX) * dx + (point.y - startY) * dy) / lengthSquared,
      v: (point.x - startX) * normalX + (point.y - startY) * normalY,
    })
    const startProjection = project(start)
    // 选择离按下位置最近的控制点：上半段捏 c1，下半段捏 c2。
    const d1 = Math.hypot(
      (startProjection.u - control.u1) * length,
      startProjection.v - control.v1,
    )
    const d2 = Math.hypot(
      (startProjection.u - control.u2) * length,
      startProjection.v - control.v2,
    )
    const first = d1 <= d2
    const move = (moveEvent: PointerEvent): void => {
      const current = project(
        screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY }),
      )
      const du = current.u - startProjection.u
      const dv = current.v - startProjection.v
      const next = first
        ? {
            ...control,
            u1: Math.max(-0.25, Math.min(1.25, control.u1 + du)),
            v1: Math.max(-700, Math.min(700, control.v1 + dv)),
          }
        : {
            ...control,
            u2: Math.max(-0.25, Math.min(1.25, control.u2 + du)),
            v2: Math.max(-700, Math.min(700, control.v2 + dv)),
          }
      setEdgeControl(id, next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(data?.relation ?? ''))
  const [saving, setSaving] = useState(false)
  const committingRef = useRef(false)

  useEffect(() => {
    if (!editing) setValue(String(data?.relation ?? ''))
  }, [data?.relation, editing])

  const relationId = String(data?.relationId ?? id ?? '')
  const onStyle = data?.onStyle as ((id: string) => void) | undefined

  const commit = async (): Promise<void> => {
    if (committingRef.current) return
    const next = value.trim() || String(data?.relation ?? '相关')
    if (next === data?.relation) {
      setEditing(false)
      return
    }
    committingRef.current = true
    setSaving(true)
    try {
      if (relationId) await updateRelationLabel(relationId, next)
      setEditing(false)
    } finally {
      committingRef.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <BaseEdge
        id={id ?? ''}
        path={edgePath}
        style={{ stroke: color, strokeWidth: 1.6 }}
      />
      {arrow === 'forward' || arrow === 'both' ? (
        <polygon
          points={arrowPoints(
            endX,
            endY,
            edgeStyle === 'straight' ? startX : c2x,
            edgeStyle === 'straight' ? startY : c2y,
          )}
          fill={color}
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {arrow === 'reverse' || arrow === 'both' ? (
        <polygon
          points={arrowPoints(
            startX,
            startY,
            edgeStyle === 'straight' ? endX : c1x,
            edgeStyle === 'straight' ? endY : c1y,
          )}
          fill={color}
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {edgeStyle === 'bezier' ? (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          style={{ pointerEvents: 'stroke', cursor: 'grab' }}
          onPointerDown={startCurveDrag}
          onClick={(event) => {
            if (!onStyle) return
            event.stopPropagation()
            onStyle(relationId || String(id ?? ''))
          }}
        />
      ) : null}
      {data ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {editing ? (
              <input
                autoFocus
                value={value}
                disabled={saving}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => void commit()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commit()
                  } else if (event.key === 'Escape') {
                    setEditing(false)
                    setValue(String(data.relation ?? ''))
                  }
                }}
                style={{ color }}
                className="h-6 w-28 rounded border border-line-hover bg-paper px-1.5 text-center text-[10px] outline-none"
              />
            ) : (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    const onEdit = data?.onEditLabel as
                      | ((id: string, label: string) => void)
                      | undefined
                    if (onEdit && relationId) {
                      onEdit(relationId, String(data.relation ?? '相关'))
                      return
                    }
                    setEditing(true)
                  }}
                  title="点击编辑关系标签"
                  style={{ color }}
                  className="cursor-text rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] whitespace-nowrap transition-colors hover:border-line-hover"
                >
                  {(data.relation as string) || '相关'}
                </button>
                {onStyle ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onStyle(relationId || String(id ?? ''))
                    }}
                    title="设置箭头方向与颜色"
                    className="flex h-5 w-5 items-center justify-center rounded text-ink-faint hover:bg-paper-card hover:text-ink"
                  >
                    <Palette size={11} strokeWidth={2} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    const onDelete = data?.onDelete as ((id: string) => void) | undefined
                    if (onDelete && relationId) {
                      onDelete(relationId)
                      return
                    }
                    if (!relationId) return
                    if (window.confirm('删除这条关系？相关实体里的投影也会一起移除。')) {
                      void deleteRelation(relationId)
                    }
                  }}
                  title="删除关系"
                  className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-ink-faint hover:bg-error/10 hover:text-error"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
