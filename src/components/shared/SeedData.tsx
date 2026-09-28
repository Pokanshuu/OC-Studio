'use client'

import { useEffect } from 'react'
import { seedSampleData } from '@/lib/seed'

/**
 * 挂载时向空库播种示例内容（幂等：库内已有角色则跳过）。
 * 内容与逻辑都在 `src/lib/seed/`；这里只做「挂载一次」的接线。
 */
export function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    seedSampleData().catch(console.error)
  }, [])

  return null
}
