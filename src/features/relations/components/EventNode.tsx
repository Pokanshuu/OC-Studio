'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { NODE_HANDLE, NODE_WRAPPER } from '@/lib/ui-tokens'

/** 四向落点，见 CharacterNode 的说明 */
export function EventNode({ data }: NodeProps) {
  return (
    <>
      <Handle id="top" type="source" position={Position.Top} className={NODE_HANDLE} />
      <Handle id="right" type="source" position={Position.Right} className={NODE_HANDLE} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={NODE_HANDLE} />
      <Handle id="left" type="source" position={Position.Left} className={NODE_HANDLE} />
      <div className={NODE_WRAPPER}>
        <div className="px-3 py-1.5 rounded-item border border-line bg-paper-card transition-colors hover:border-ink-muted">
          <span className="text-xs text-ink">{data.label as string}</span>
        </div>
        {data.subtitle ? (
          <span className="text-[10px] text-ink-faint">{data.subtitle as string}</span>
        ) : null}
      </div>
    </>
  )
}
