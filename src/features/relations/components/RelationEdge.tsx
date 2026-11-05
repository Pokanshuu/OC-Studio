'use client'

import { useMemo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react'
import { arrowEnds, relationColorValue, type RelationArrow } from '@/lib/relation-colors'
import { useSettings } from '@/lib/settings'
import { nodeRect, relationEdgePath } from './floating-edge'
import type { GraphEdgeKind } from '../types'

/** 标签点击回调：屏幕坐标，与画布上点线打开的样式面板共用同一条路径 */
export type RelationLabelClick = (point: { x: number; y: number }) => void

/**
 * 关系图的边。
 *
 * 线型是**应用设置**（设置 › 个性化、关系图工具栏都能改），不是边的数据：
 * - `orthogonal`（默认）：四向落点折线，并行边靠 offset 分车道
 * - `curve`：从节点形状边缘发散（角色圆 / 国家事件卡片矩形），并行边靠曲率分离
 *
 * 几何全部在 `floating-edge.ts`（纯函数）里算 —— PNG 导出用同一个函数，
 * 所以导出的线和画布上的线是同一条。
 */
export function RelationEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps) {
  const { settings } = useSettings()
  const edgeStyle = settings.edgeStyle
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  const parallelIndex = Number(data?.parallelIndex ?? 0)

  const geometry = useMemo(() => {
    if (!sourceNode || !targetNode) return null
    return relationEdgePath({
      style: edgeStyle,
      source: nodeRect({
        x: sourceNode.internals.positionAbsolute.x,
        y: sourceNode.internals.positionAbsolute.y,
        width: sourceNode.measured.width,
        height: sourceNode.measured.height,
        entityType: sourceNode.data?.entityType,
      }),
      target: nodeRect({
        x: targetNode.internals.positionAbsolute.x,
        y: targetNode.internals.positionAbsolute.y,
        width: targetNode.measured.width,
        height: targetNode.measured.height,
        entityType: targetNode.data?.entityType,
      }),
      parallelIndex,
    })
  }, [sourceNode, targetNode, edgeStyle, parallelIndex])

  // 节点还没测量出来（首帧 / 刚刷新）：先按 React Flow 给的手柄坐标画，下一帧就换成正算的
  const fallback = useMemo(() => {
    if (geometry) return null
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition: sourcePosition ?? Position.Right,
      targetX,
      targetY,
      targetPosition: targetPosition ?? Position.Left,
      curvature: 0.15,
    })
    return { path, labelX, labelY }
  }, [geometry, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition])

  const edgePath = geometry?.path ?? fallback?.path ?? ''
  const labelX = geometry?.labelX ?? fallback?.labelX ?? sourceX
  const labelY = geometry?.labelY ?? fallback?.labelY ?? sourceY

  // 关系名可以为空（如角色关系只连了线没起名）——空标签不画那个白框
  const relation = (data?.relation as string | undefined) ?? ''
  // 关系图里默认只在悬停 / 选中时显示（`RelationGraph` 在 data 上给 showLabel）；
  // 导出等其它消费方没有这个键时保持显示，免得导出图丢名字
  const showLabel = data?.showLabel !== false
  // 点标签 = 点线：标签是 EdgeLabelRenderer 里的独立元素，不经过画布的 onEdgeClick
  const onLabelClick = data?.onLabelClick as RelationLabelClick | undefined
  // 颜色与箭头是**边的数据**（docs/关系图.md §2.1），文字永远跟线同色
  const color = relationColorValue(data?.color)
  const arrow = (data?.arrow as RelationArrow | undefined) ?? 'none'
  const ends = arrowEnds(arrow)
  const startId = `arrow-start-${id}`
  const endId = `arrow-end-${id}`

  /* 线的分级（docs/关系图.md §10）：不新增视觉语汇，只改权重 ——
     语义关系实线稍粗；归属 / 参与细一档；@ 引用推出来的线用虚线（机器推的，不是人手画的）。 */
  const kind = (data?.kind as GraphEdgeKind | undefined) ?? 'relation'
  const strokeWidth = kind === 'member' ? 1 : kind === 'reference' ? 1 : 1.4
  const dash = kind === 'reference' ? '2 3' : undefined
  const baseOpacity = kind === 'reference' ? 0.45 : kind === 'member' ? 0.6 : 0.85

  return (
    <>
      <defs>
        <marker id={startId} viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 10 0 L 0 5 L 10 10 z" fill={color} />
        </marker>
        <marker id={endId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <BaseEdge
        id={id ?? ''}
        path={edgePath}
        // hover 聚焦会把 opacity 挂在 edge.style 上（见 RelationGraph 的 displayEdges），
        // 自定义边必须自己接住它，否则节点淡了、线还全亮
        style={{
          stroke: color,
          strokeWidth,
          ...(dash ? { strokeDasharray: dash } : {}),
          opacity: typeof style?.opacity === 'number' ? style.opacity : baseOpacity,
        }}
        markerStart={ends.start ? `url(#${startId})` : undefined}
        markerEnd={ends.end ? `url(#${endId})` : undefined}
      />
      {relation && showLabel ? (
        <EdgeLabelRenderer>
          <div
            onClick={(event) => {
              // 不让点击冒泡到画布：onPaneClick 会把刚打开的面板立刻关掉
              event.stopPropagation()
              onLabelClick?.({ x: event.clientX, y: event.clientY })
            }}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              color,
              opacity: typeof style?.opacity === 'number' ? style.opacity : 1,
            }}
            className="cursor-pointer rounded-item border border-line bg-paper px-1.5 py-0.5 text-[10px] whitespace-nowrap"
          >
            {relation}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
