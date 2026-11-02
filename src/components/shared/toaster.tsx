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
          fontSize: "14px",
          borderRadius: "6px",
          boxShadow: "none",
        },
      }}
    />
  )
}
