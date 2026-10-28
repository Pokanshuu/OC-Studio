'use client'

import { VaultScanReportDialog } from './VaultScanReportDialog'

/**
 * 挂在应用壳里一次，集中渲染全局浮层。
 * 引导页已经归 `VaultGate` 管（没有文件夹时直接渲染引导，不再是浮层）。
 */
export function VaultSurfaces() {
  return <VaultScanReportDialog />
}