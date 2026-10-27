'use client'

import { useEffect } from 'react'
import { seedSampleData } from '@/lib/seed'
import { isVaultEnabled } from '@/lib/vault/vault-registry'

/**
 * 挂载时向空库播种示例内容（幂等：库内已有角色则跳过）。
 * 内容与逻辑都在 `src/lib/seed/`；这里只做「挂载一次」的接线。
 *
 * vault 模式下**不播种**：用户的文件夹就是数据源，往里面塞示例角色
 * 既没意义又会真的写出文件。
 */
export function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isVaultEnabled()) return
    seedSampleData().catch(console.error)
  }, [])

  return null
}
