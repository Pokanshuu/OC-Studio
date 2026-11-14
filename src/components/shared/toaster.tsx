"use client"

import { Toaster as Sonner } from "sonner"

/**
 * 全局通知（左下角）。
 *
 * `offset` 不是随手写的数：左下角正好压在侧栏底部的固定区上 ——
 * 状态栏 24px + 侧栏底部区（`border-t` + `py-2` + 三个 `h-8` 的入口 相册 / 回收站 / 设置）
 * = 24 + 8 + 96 + 8 = 136px。抬到 144（+8 呼吸位）就再也盖不住「设置」入口。
 * 右下角才是 toast 的习惯位置，但状态栏在那儿，所以仍是左下、只是抬高。
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-left"
      offset={{ bottom: 144, left: 12 }}
      mobileOffset={{ bottom: 76, left: 12 }}
      toastOptions={{
        style: {
          background: "var(--color-paper-card)",
          border: "1px solid var(--color-line)",
          color: "var(--color-ink)",
          fontSize: "12px",
          // 小档圆角：与卡片/图片同一档（令牌唯一源在 globals.css）
          borderRadius: "var(--radius-item)",
          boxShadow: "var(--oc-shadow-float)",
        },
      }}
    />
  )
}
