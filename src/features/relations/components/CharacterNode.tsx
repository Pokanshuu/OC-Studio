'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Avatar } from '@/components/shared/Avatar'
import { getImageUrl } from '@/lib/image-service'
import { NODE_HANDLE, NODE_WRAPPER } from '@/lib/ui-tokens'

/**
 * 四个方向都有落点：连线按「目标在哪个方位」选手柄（见 relation-graph-utils 的 routeEdges），
 * 否则所有线都从正下方挤出来，贴着节点糊成一束。
 * Loose 模式（RelationGraph 的 connectionMode），任一手柄都能起手也能落点。
 */
export function CharacterNode({ data }: NodeProps) {
  const src = data.avatarUrl as string | undefined

  return (
    <>
      <Handle id="top" type="source" position={Position.Top} className={NODE_HANDLE} />
      <Handle id="right" type="source" position={Position.Right} className={NODE_HANDLE} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={NODE_HANDLE} />
      <Handle id="left" type="source" position={Position.Left} className={NODE_HANDLE} />
      <div className={NODE_WRAPPER}>
        <Avatar src={getImageUrl(src, 'avatar')} className="w-14 h-14" size="md" />
        <span className="text-xs text-ink text-center max-w-[80px] truncate">
          {data.label as string}
        </span>
      </div>
    </>
  )
}
