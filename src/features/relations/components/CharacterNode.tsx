'use client'

import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { getImageUrl } from '@/lib/image-service'
import { NODE_HANDLE, NODE_WRAPPER } from '@/lib/ui-tokens'
import { NODE_AVATAR_SIZE, NODE_SIZE } from '../layout'
import { NodeOpenButton } from './NodeOpenButton'

/**
 * 角色节点（docs/关系图.md §4）：**56px 圆头像 + 12px 名字**，尺寸写死在 `NODE_SIZE`。
 *
 * 四个方向都有落点（正交模式按「目标在哪个方位」选手柄，见 relation-graph-utils 的 routeEdges）。
 * 曲线模式下线从头像圆的边缘发散、不走手柄，但**手柄照样要显形**：它是「拖一条新关系」唯一的起手点，
 * 藏起来就等于这个模式没法连线（曾经用 `opacity: 0` 收掉，结果就是「hover 看不到圆点」）。
 */
export function CharacterNode({ data, selected }: NodeProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const label = String(data.label ?? '')
  const src = data.avatarUrl as string | undefined
  const url = src ? getImageUrl(src, 'avatar') : ''
  const showImage = Boolean(url) && url !== failedSrc
  const size = NODE_SIZE.character
  const onOpen = data.onOpen as (() => void) | undefined

  return (
    <>
      <Handle id="top" type="source" position={Position.Top} className={NODE_HANDLE} />
      <Handle id="right" type="source" position={Position.Right} className={NODE_HANDLE} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={NODE_HANDLE} />
      <Handle id="left" type="source" position={Position.Left} className={NODE_HANDLE} />
      <div className={`${NODE_WRAPPER} relative`} style={{ width: size.w, height: size.h }}>
        {selected && onOpen ? <NodeOpenButton onOpen={onOpen} /> : null}
        <div
          style={{ width: NODE_AVATAR_SIZE, height: NODE_AVATAR_SIZE }}
          className={`shrink-0 overflow-hidden rounded-full border bg-paper-card transition-colors ${
            selected ? 'border-ink' : 'border-line group-hover:border-line-hover'
          }`}
        >
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              onError={() => setFailedSrc(url)}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center font-serif text-xl text-ink-faint">
              {label.slice(0, 1)}
            </span>
          )}
        </div>
        <span className="graph-node-label block max-w-[80px] truncate whitespace-nowrap text-center text-xs leading-4 text-ink">
          {label}
        </span>
      </div>
    </>
  )
}
