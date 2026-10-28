'use client'

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

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

  return (
    <>
      <BaseEdge id={id ?? ''} path={edgePath} className="!stroke-line-hover" />
      {relation ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="rounded-item border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-muted whitespace-nowrap"
          >
            {relation}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
