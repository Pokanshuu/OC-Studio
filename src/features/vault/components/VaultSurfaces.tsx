'use client'

import { VaultScanReportDialog } from './VaultScanReportDialog'
import { VaultWelcome } from './VaultWelcome'

/**
 * 挂在应用壳里一次，集中渲染两个全局浮层。
 * 分开挂会让「菜单里点开报告」和「启动时自动弹报告」变成两处状态，容易不同步。
 */
export function VaultSurfaces() {
  return (
    <>
      <VaultWelcome />
      <VaultScanReportDialog />
    </>
  )
}
