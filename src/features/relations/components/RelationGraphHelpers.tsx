'use client'

import { useEffect, useRef } from 'react'
import { useReactFlow, type ReactFlowInstance } from '@xyflow/react'
import { MIN_ZOOM } from './relation-graph-utils'

/** 数据就绪后自动 fitView 一次（每次过滤结果变化时重新挂载以重置） */
export function FitViewOnLoad({ ready }: { ready: boolean }) {
  const { fitView } = useReactFlow()
  const called = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (ready && !called.current) {
      // minZoom：图很大时不缩到看不清（见 MIN_ZOOM）
      timerRef.current = setTimeout(() => fitView({ padding: 0.3, minZoom: MIN_ZOOM }), 100)
      called.current = true
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [ready, fitView])

  return null
}

/** 把 ReactFlow 实例回吐给父组件（用于外部控制缩放） */
export function ZoomReader({ onInstance }: { onInstance: (rf: ReactFlowInstance) => void }) {
  const rf = useReactFlow()
  useEffect(() => { onInstance(rf) }, [rf, onInstance])
  return null
}
