'use client'

import { useEffect } from 'react'
import { seedSampleData } from '@/lib/seed'
import { isVaultEnabled } from '@/lib/vault/vault-registry'
import { isVaultSupported } from '@/lib/vault/vault-fs'

/**
 * 挂载时向空库播种示例内容（幂等：库内已有角色则跳过）。
 * 内容与逻辑都在 `src/lib/seed/`；这里只做「挂载一次」的接线。
 *
 * vault 模式下**不播种**：用户的文件夹就是数据源，往里面塞示例角色
 * 既没意义又会真的写出文件。
 *
 * 关键：桌面版一律不播种（`isVaultSupported`），不能只看 `isVaultEnabled`。
 * 那个标记在**首次绑定笔记库之后**才置位，于是全新安装的桌面版会在欢迎页
 * 背后先塞进 10 条示例，把欢迎页的「检测到 N 条旧版本数据」直接顶出来 ——
 * 用户在旧版里根本没写过东西，也会被提示去「备份并导出」一堆示例角色。
 */
export function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isVaultSupported()) return
    if (isVaultEnabled()) return
    seedSampleData().catch(console.error)
  }, [])

  return null
}
