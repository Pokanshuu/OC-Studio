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
  })

  return (
    <>
      <BaseEdge id={id ?? ''} path={edgePath} className="!stroke-line-hover" />
      {data ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-muted whitespace-nowrap"
          >
            {data.relation as string}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
