'use client'

import { useEffect, useRef, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import { Palette } from 'lucide-react'
import { useRelationUiStore } from '../store'
import {
  resolveRelationArrow,
  resolveRelationColor,
} from '../style'
import { useFloatingEdge } from './useFloatingEdge'

const OFFSETS_KEY = 'oc-custom-edge-offsets'

function loadOffset(id: string): number {
  try {
    const raw = window.localStorage.getItem(OFFSETS_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    return typeof all[id] === 'number' ? all[id] : 34
  } catch {
    return 34
  }
}

function saveOffset(id: string, offset: number): void {
  try {
    const raw = window.localStorage.getItem(OFFSETS_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    all[id] = offset
    window.localStorage.setItem(OFFSETS_KEY, JSON.stringify(all))
  } catch {
    // ignore storage errors
  }
}

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

export function CustomEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow()
  const edgeStyle = useRelationUiStore((state) => state.edgeStyle)
  const edgeId = id ?? ''
  const [offset, setOffset] = useState(() => loadOffset(edgeId))
  const readOnly = data?.readOnly === true
  const hideLabel = data?.hideLabel === true
  const onDelete = data?.onDelete as ((id: string) => void) | undefined
  const onStyle = data?.onStyle as ((id: string) => void) | undefined
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(data?.label ?? '相关'))
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

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
  const normalX = -dy / length
  const normalY = dx / length
  const midX = (startX + endX) / 2
  const midY = (startY + endY) / 2
  const parallelIndex = Number(data?.parallelIndex ?? 0)
  const parallelCount = Number(data?.parallelCount ?? 1)
  const lane =
    parallelCount > 1 ? (parallelIndex - (parallelCount - 1) / 2) * 36 : 0
  const controlX = midX + normalX * (offset + lane)
  const controlY = midY + normalY * (offset + lane)
  const [path, labelX, labelY] =
    edgeStyle === 'straight'
      ? getStraightPath({ sourceX: startX, sourceY: startY, targetX: endX, targetY: endY })
      : [
          `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
          0.25 * startX + 0.5 * controlX + 0.25 * endX,
          0.25 * startY + 0.5 * controlY + 0.25 * endY,
        ]

  useEffect(() => {
    if (!editing) setValue(String(data?.label ?? '相关'))
  }, [data?.label, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const startCurveDrag = (event: React.PointerEvent<SVGPathElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const startProjection = (start.x - midX) * normalX + (start.y - midY) * normalY
    const move = (moveEvent: PointerEvent): void => {
      const point = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY })
      const projection = (point.x - midX) * normalX + (point.y - midY) * normalY
      const next = Math.max(-500, Math.min(500, offset + projection - startProjection))
      setOffset(next)
      saveOffset(edgeId, next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const commit = (): void => {
    if (committedRef.current) return
    committedRef.current = true
    const label = value.trim() || '相关'
    const onChange = data?.onLabelChange as ((id: string, label: string) => void) | undefined
    if (edgeId) onChange?.(edgeId, label)
    setEditing(false)
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: color, strokeWidth: 1.6 }}
      />
      {arrow === 'forward' || arrow === 'both' ? (
        <polygon
          points={arrowPoints(
            endX,
            endY,
            edgeStyle === 'straight' ? startX : controlX,
            edgeStyle === 'straight' ? startY : controlY,
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
            edgeStyle === 'straight' ? endX : controlX,
            edgeStyle === 'straight' ? endY : controlY,
          )}
          fill={color}
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      {edgeStyle === 'bezier' ? (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={24}
          style={{ pointerEvents: 'stroke', cursor: 'grab' }}
          onPointerDown={startCurveDrag}
          onClick={(event) => {
            if (!onStyle) return
            event.stopPropagation()
            const styleId = String(data?.relationId ?? edgeId)
            if (styleId) onStyle(styleId)
          }}
        />
      ) : null}
      {!hideLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {editing ? (
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    commit()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    committedRef.current = true
                    setEditing(false)
                    setValue(String(data?.label ?? '相关'))
                  }
                }}
                style={{ color }}
                className="h-6 w-24 rounded border border-line bg-paper px-1.5 text-[10px] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (readOnly) return
                  const onEdit = data?.onEditLabel as
                    | ((id: string, label: string) => void)
                    | undefined
                  if (onEdit && edgeId) {
                    onEdit(edgeId, String(data?.label ?? '相关'))
                    return
                  }
                  committedRef.current = false
                  setEditing(true)
                }}
                title={readOnly ? '此连线不可编辑' : '点击编辑关系标签；拖动线条可调整曲线'}
                style={{ color }}
                className={`rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] transition-colors ${
                  readOnly ? 'cursor-default' : 'hover:border-line-hover'
                }`}
              >
                {String(data?.label ?? '相关')}
              </button>
            )}
            {onStyle && !editing ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  const styleId = String(data?.relationId ?? edgeId)
                  if (styleId) onStyle(styleId)
                }}
                title="设置箭头方向与颜色"
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-ink-faint hover:bg-paper-card hover:text-ink"
              >
                <Palette size={11} strokeWidth={2} />
              </button>
            ) : null}
            {onDelete && !editing ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(edgeId)
                }}
                title="删除关系"
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-[10px] text-ink-faint hover:bg-error/10 hover:text-error"
              >
                ×
              </button>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
