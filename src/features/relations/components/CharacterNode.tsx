'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { NODE_WRAPPER } from '@/lib/ui-tokens'

export function CharacterNode({ data }: NodeProps) {
  const src = data.avatarUrl as string | undefined

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-line-hover" />
      <div className={NODE_WRAPPER}>
        <Avatar src={getImageUrl(src, 'avatar')} className="w-14 h-14" size="md" />
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-line-hover" />
    </>
  )
}
