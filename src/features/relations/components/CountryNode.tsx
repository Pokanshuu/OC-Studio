'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'

export function CountryNode({ data }: NodeProps) {
  const flagUrl = data.flagUrl as string | undefined

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-line-hover" />
      <div className="flex flex-col items-center gap-1 group cursor-pointer">
        <Avatar
          src={getImageUrl(flagUrl, 'flag')}
          className="w-14 h-14 rounded-md border-2 border-line"
          size="md"
        />
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-line-hover" />
    </>
  )
}
