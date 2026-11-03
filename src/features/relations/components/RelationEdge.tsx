'use client'

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { arrowEnds, relationColorValue, type RelationArrow } from '@/lib/relation-colors'

export function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    // 曲率调小：默认 0.25 在四向落点下会甩出很大的弧，几条线一叠就糊成一团
    curvature: 0.15,
  })

  // 关系名可以为空（如角色关系只连了线没起名）——空标签不画那个白框
  const relation = (data?.relation as string | undefined) ?? ''
  // 颜色与箭头是**边的数据**（docs/关系图.md §2.1），文字永远跟线同色
  const color = relationColorValue(data?.color)
  const arrow = (data?.arrow as RelationArrow | undefined) ?? 'none'
  const ends = arrowEnds(arrow)
  const startId = `arrow-start-${id}`
  const endId = `arrow-end-${id}`

  return (
    <>
      <defs>
        <marker id={startId} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 10 0 L 0 5 L 10 10 z" fill={color} />
        </marker>
        <marker id={endId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <BaseEdge
        id={id ?? ''}
        path={edgePath}
        style={{ stroke: color }}
        markerStart={ends.start ? `url(#${startId})` : undefined}
        markerEnd={ends.end ? `url(#${endId})` : undefined}
      />
      {relation ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              color,
            }}
            className="rounded-item border border-line bg-paper px-1.5 py-0.5 text-[10px] whitespace-nowrap"
          >
            {relation}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
