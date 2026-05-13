'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'

export function CharacterNode({ data }: NodeProps) {
  const qAvatarUrl = data.qAvatarUrl as string | undefined
  const avatarUrl = data.avatarUrl as string | undefined
  const src = qAvatarUrl || avatarUrl

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-line-hover" />
      <div className="flex flex-col items-center gap-1 group cursor-pointer">
        <Avatar src={getImageUrl(src, 'avatar')} className="w-14 h-14 border-2 border-line-hover" size="md" />
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-line-hover" />
    </>
  )
}
