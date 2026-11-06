'use client'

import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { getImageUrl } from '@/lib/image-service'
import { NODE_HANDLE, NODE_WRAPPER } from '@/lib/ui-tokens'
import { NODE_CARD_SIZE, NODE_SIZE } from '../layout'
import { NodeOpenButton } from './NodeOpenButton'

/**
 * 国家节点（docs/关系图.md §4）：**96 × 64 旗帜卡 + 名字**，尺寸写死在 `NODE_SIZE`。
 * 无旗帜时用衬线首字占位（`MEDIA_FALLBACK` 的视觉，不自造图标或阴影）。
 * 四向落点见 CharacterNode 的说明（两种线型下手柄都显形 —— 它是拖新关系的起手点）。
 */
export function CountryNode({ data, selected }: NodeProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const label = String(data.label ?? '')
  const src = data.flagUrl as string | undefined
  const url = src ? getImageUrl(src, 'flag') : ''
  const showImage = Boolean(url) && url !== failedSrc
  const size = NODE_SIZE.country
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
          style={{ width: NODE_CARD_SIZE.w, height: NODE_CARD_SIZE.h }}
          className={`shrink-0 overflow-hidden rounded-item border bg-paper-card transition-colors ${
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
            <span className="grid h-full w-full place-items-center font-serif text-2xl text-ink-faint">
              {label.slice(0, 1)}
            </span>
          )}
        </div>
        <span className="graph-node-label block w-full truncate text-center text-xs leading-4 text-ink">{label}</span>
      </div>
    </>
  )
}
