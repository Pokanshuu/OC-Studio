"use client"

import { Toaster as Sonner } from "sonner"

export function Toaster() {
  return (
    <Sonner
      position="bottom-left"
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
