'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { NODE_HANDLE, NODE_WRAPPER } from '@/lib/ui-tokens'

/** 四向落点，见 CharacterNode 的说明 */
export function CountryNode({ data }: NodeProps) {
  const flagUrl = data.flagUrl as string | undefined

  return (
    <>
      <Handle id="top" type="source" position={Position.Top} className={NODE_HANDLE} />
      <Handle id="right" type="source" position={Position.Right} className={NODE_HANDLE} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={NODE_HANDLE} />
      <Handle id="left" type="source" position={Position.Left} className={NODE_HANDLE} />
      <div className={NODE_WRAPPER}>
        <Avatar
          src={getImageUrl(flagUrl, 'flag')}
          className="w-14 h-14"
          shape="square"
          size="md"
        />
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
    </>
  )
}
