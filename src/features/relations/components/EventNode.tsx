'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

export function EventNode({ data }: NodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-line-hover" />
      <div className="flex flex-col items-center gap-1 group cursor-pointer">
        <div className="px-3 py-1.5 rounded-md border border-line bg-paper-card transition-colors hover:border-ink-muted">
          <span className="text-xs text-ink">{data.label as string}</span>
        </div>
        {data.subtitle ? (
          <span className="text-[10px] text-ink-faint">{data.subtitle as string}</span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-line-hover" />
    </>
  )
}
