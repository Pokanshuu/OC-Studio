'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Flag } from 'lucide-react'

export function CountryNode({ data }: NodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-line-hover" />
      <div className="flex flex-col items-center gap-1 group cursor-pointer">
        <div className="w-14 h-14 rounded-md border-2 border-line bg-paper-card flex items-center justify-center transition-colors hover:border-ink-muted">
          <Flag size={20} strokeWidth={2} className="text-ink-muted" />
        </div>
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-line-hover" />
    </>
  )
}
