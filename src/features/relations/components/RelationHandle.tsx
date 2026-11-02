'use client'

import { Handle, Position } from '@xyflow/react'
import { Plus } from 'lucide-react'

/**
 * 关系图节点上的连接热区。
 * - 中心处保留一个透明热区，兼容旧的拖拽习惯。
 * - 右侧增加一个悬停可见的“+”手柄，用来直接拖出一条新关系线。
 */
export function RelationHandle({
  centerY = 28,
  size = 48,
}: {
  centerY?: number
  size?: number
}) {
  return (
    <>
      <Handle
        type="source"
        position={Position.Top}
        className="relation-handle-hidden"
        style={{
          width: size,
          height: size,
          top: centerY - size / 2,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: 0,
          border: 'none',
          background: 'transparent',
          pointerEvents: 'all',
        }}
      />
      <Handle
        type="source"
        id="relation-connect"
        position={Position.Right}
        className="relation-connect-handle"
        title="拖到另一个节点的＋上创建关系（可重复创建多条）"
        style={{
          width: 20,
          height: 20,
          top: centerY - 10,
          right: -12,
          left: 'auto',
          transform: 'none',
          border: '1px solid var(--color-line-hover)',
          background: 'var(--color-paper)',
          color: 'var(--color-ink-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'crosshair',
          zIndex: 40,
        }}
      >
        <Plus size={11} strokeWidth={2} />
      </Handle>
    </>
  )
}
